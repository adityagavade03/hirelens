import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtcSession, type Signal } from "../src/live-call";
import { MonitoringQueue } from "../src/monitoring-queue";
import { SustainedObservation } from "../shared/monitoring";
import { mediaError } from "../src/media-errors";

class TestStream {
  constructor(private tracks: any[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  addTrack(track: any) {
    this.tracks.push(track);
  }
}
class TestPeer {
  signalingState = "stable";
  connectionState = "new";
  localDescription: any = null;
  remoteDescription: any = null;
  onnegotiationneeded: any;
  onicecandidate: any;
  ontrack: any;
  onconnectionstatechange: any;
  transceivers: any[] = [];
  candidates: any[] = [];
  answerSenderTracks: any[] = [];
  addTransceiver(kind: string, options: { direction: string }) {
    const sender = {
      track: null as any,
      replaceTrack: vi.fn(async (track: any) => {
        sender.track = track;
      }),
    };
    const transceiver = {
      sender,
      kind,
      direction: options.direction,
      mid: null as string | null,
      receiver: { track: track(kind, `receiver-${this.transceivers.length}`) },
    };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  getTransceivers() {
    return this.transceivers;
  }
  async setLocalDescription() {
    const answer = this.signalingState === "have-remote-offer";
    if (!answer)
      this.transceivers.forEach((transceiver, index) => {
        transceiver.mid ??=
          ["audio-slot", "camera-slot", "screen-slot"][index] ||
          `extra-${index}`;
      });
    if (answer)
      this.answerSenderTracks = this.transceivers
        .filter((t) => t.mid != null)
        .map((t) => t.sender.track);
    this.localDescription = {
      type: answer ? "answer" : "offer",
      sdp:
        "v=0\r\n" +
        this.transceivers
          .filter((t) => t.mid != null)
          .map(
            (t) =>
              `m=${t.kind} 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:${t.mid}\r\na=${t.direction}\r\n`,
          )
          .join(""),
    };
    this.signalingState =
      this.localDescription.type === "answer" ? "stable" : "have-local-offer";
  }
  async setRemoteDescription(description: any) {
    this.remoteDescription = description;
    // Browser behavior: a disassociated addTransceiver slot is not reused by
    // a remote initial offer. Auto-created receivers must be adopted instead.
    for (const section of description.sdp.split(/\r?\nm=/).slice(1)) {
      const kind = section.startsWith("audio ") ? "audio" : "video";
      const mid = section.match(/(?:^|\n)a=mid:([^\r\n]+)/)?.[1];
      if (this.transceivers.some((t) => t.mid === mid)) continue;
      if (description.type !== "offer")
        throw new Error("Answer did not match an offered slot");
      const transceiver = this.addTransceiver(kind, { direction: "recvonly" });
      transceiver.mid = mid;
      this.ontrack?.({
        transceiver,
        track: transceiver.receiver.track,
        streams: [],
      });
    }
    this.signalingState =
      description.type === "offer" ? "have-remote-offer" : "stable";
  }
  async addIceCandidate(candidate: any) {
    this.candidates.push(candidate);
  }
  close() {
    this.signalingState = "closed";
  }
}
const stream = (...tracks: any[]) =>
  new TestStream(tracks) as unknown as MediaStream;
const track = (kind: string, id: string) => ({
  kind,
  id,
  readyState: "live",
  enabled: true,
});
const offerSdp = (ufrag = "fixture") =>
  `v=0\r\na=ice-ufrag:${ufrag}\r\n` +
  ["audio", "video", "video"]
    .map(
      (kind, index) =>
        `m=${kind} 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:${["audio-slot", "camera-slot", "screen-slot"][index]}\r\na=${index === 2 ? "sendonly" : "sendrecv"}\r\n`,
    )
    .join("");
beforeEach(() => {
  vi.stubGlobal("RTCPeerConnection", TestPeer);
  vi.stubGlobal("MediaStream", TestStream);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(polite = false) {
  const sent: Signal[] = [],
    error = vi.fn(),
    remote = vi.fn();
  const session = new RtcSession(
    {},
    polite,
    async (signal) => {
      sent.push(signal);
    },
    remote,
    error,
    vi.fn(),
  );
  return {
    session,
    peer: session.peer as unknown as TestPeer,
    sent,
    error,
    remote,
  };
}
describe("interview peer lifecycle", () => {
  it("gives HR a receive-only screen transceiver and never attaches an HR display track", async () => {
    const { session, peer } = setup(true);
    await session.update(
      stream(track("audio", "mic"), track("video", "camera")),
      stream(track("video", "forbidden-screen")),
    );
    expect(peer.transceivers).toHaveLength(0);
    await session.negotiate();
    expect(peer.localDescription).toBeNull();
    await session.receive({ description: { type: "offer", sdp: offerSdp() } });
    expect(peer.transceivers[2].direction).toBe("recvonly");
    expect(peer.transceivers[2].sender.track).toBeNull();
    expect(setup(false).peer.transceivers[2].direction).toBe("sendonly");
  });
  it("holds ICE for a restarted connection until the matching description arrives", async () => {
    const { session, peer, error } = setup(true);
    await session.receive({
      description: { type: "offer", sdp: offerSdp("old") },
    });
    await session.receive({
      candidate: { candidate: "new route", usernameFragment: "fresh" },
    });
    expect(peer.candidates).toHaveLength(0);
    await session.receive({
      description: { type: "offer", sdp: offerSdp("fresh") },
    });
    expect(peer.candidates).toEqual([
      { candidate: "new route", usernameFragment: "fresh" },
    ]);
    expect(error).not.toHaveBeenCalled();
  });
  it("supports devices enabled after joining and screen sharing without replacing the camera", async () => {
    const { session, peer } = setup();
    await session.update(null, null);
    const audio = track("audio", "mic"),
      camera = track("video", "camera"),
      display = track("video", "display");
    await session.update(stream(audio, camera), stream(display));
    expect(peer.transceivers.map((t) => t.sender.track)).toEqual([
      audio,
      camera,
      display,
    ]);
    await session.update(stream(audio, camera), null);
    expect(peer.transceivers.map((t) => t.sender.track)).toEqual([
      audio,
      camera,
      null,
    ]);
    expect(peer.transceivers).toHaveLength(3);
  });
  it("drops ended devices and safely replaces live tracks", async () => {
    const { session, peer } = setup();
    const ended = { ...track("video", "old"), readyState: "ended" };
    await session.update(stream(ended), null);
    expect(peer.transceivers[1].sender.track).toBeNull();
    const replacement = track("video", "new");
    await session.update(stream(replacement), null);
    expect(peer.transceivers[1].sender.track).toBe(replacement);
  });
  it("queues ICE arriving before SDP and serializes concurrent incoming messages", async () => {
    const { session, peer, sent } = setup(true);
    const ice = { candidate: "candidate:fixture" };
    await session.receive({ candidate: ice });
    expect(peer.candidates).toHaveLength(0);
    await Promise.all([
      session.receive({ description: { type: "offer", sdp: offerSdp() } }),
      session.receive({ candidate: { candidate: "second" } }),
    ]);
    expect(peer.candidates).toEqual([ice, { candidate: "second" }]);
    expect(sent[0].description?.type).toBe("answer");
  });
  it("lets the polite peer accept a colliding offer and answer it", async () => {
    const { session, peer, sent, error } = setup(true);
    await session.receive({ description: { type: "offer", sdp: offerSdp() } });
    await session.negotiate();
    await session.receive({
      description: { type: "offer", sdp: offerSdp("collision") },
    });
    expect(sent.map((x) => x.description?.type)).toEqual([
      "answer",
      "offer",
      "answer",
    ]);
    expect(peer.signalingState).toBe("stable");
    expect(error).not.toHaveBeenCalled();
  });
  it("ignores collisions and their ICE on the impolite peer, then accepts the answer", async () => {
    const { session, peer } = setup(false);
    await session.negotiate();
    await session.receive({
      description: { type: "offer", sdp: offerSdp("collision") },
    });
    await session.receive({ candidate: { candidate: "ignored" } });
    expect(peer.remoteDescription).toBeNull();
    expect(peer.candidates).toHaveLength(0);
    await session.receive({ description: { type: "answer", sdp: offerSdp() } });
    await session.receive({ candidate: { candidate: "accepted" } });
    expect(peer.candidates).toEqual([{ candidate: "accepted" }]);
  });
  it("combines streamless camera/audio tracks and separates the shared screen", () => {
    const { peer, remote } = setup();
    for (const i of [0, 1, 2])
      peer.ontrack({
        transceiver: peer.transceivers[i],
        track: track(i ? "video" : "audio", String(i)),
        streams: [],
      });
    expect(remote.mock.calls[1][0].getTracks()).toHaveLength(2);
    expect(remote.mock.calls[2][1]).toBe(true);
    expect(remote.mock.calls[2][0].getTracks()).toHaveLength(1);
  });
  it("adopts offered receivers and attaches waiting HR devices before the answer without duplicate media slots", async () => {
    const { session, peer, remote, error } = setup(true);
    const audio = track("audio", "hr-mic"),
      camera = track("video", "hr-camera");
    await session.update(
      stream(audio, camera),
      stream(track("video", "hr-screen-forbidden")),
    );
    await session.receive({ description: { type: "offer", sdp: offerSdp() } });
    expect(peer.transceivers).toHaveLength(3);
    expect(peer.answerSenderTracks).toEqual([audio, camera, null]);
    expect(peer.localDescription.sdp.split(/\r?\nm=/)).toHaveLength(4);
    expect(peer.transceivers[2].direction).toBe("recvonly");
    expect(remote.mock.calls[2][1]).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });
  it("uses negotiated MID for the screen even when browser transceiver ordering differs", async () => {
    const { session, peer, remote } = setup(true);
    await session.receive({ description: { type: "offer", sdp: offerSdp() } });
    const screenSlot = peer.transceivers[2];
    peer.transceivers.unshift(peer.transceivers.pop());
    remote.mockClear();
    peer.ontrack({
      transceiver: screenSlot,
      track: screenSlot.receiver.track,
      streams: [],
    });
    expect(remote).toHaveBeenCalledWith(expect.anything(), true);
  });
  it("cleans up and ignores late signalling after the participant leaves", async () => {
    const { session, peer, sent } = setup();
    session.close();
    await session.receive({ description: { type: "offer", sdp: "late" } });
    await session.negotiate();
    expect(peer.signalingState).toBe("closed");
    expect(peer.ontrack).toBeNull();
    expect(sent).toHaveLength(0);
  });
  it("reports negotiation failures without an unhandled rejection", async () => {
    const { session, peer, error } = setup();
    vi.spyOn(peer, "setLocalDescription").mockRejectedValue(
      new Error("device negotiation failed"),
    );
    await session.negotiate();
    expect(error).toHaveBeenCalledOnce();
  });
});

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};
describe("monitoring delivery and sustained face observations", () => {
  it("retains failed metadata across reloads with the same idempotency IDs", async () => {
    const store = memoryStore(),
      deliver = vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue({ accepted: 1 });
    const first = new MonitoringQueue("interview-a", store, deliver, vi.fn());
    first.add("paste");
    await first.flush();
    expect(first.count).toBe(1);
    const second = new MonitoringQueue("interview-a", store, deliver, vi.fn());
    await second.flush();
    expect(deliver.mock.calls[0][0][0].clientEventId).toBe(
      deliver.mock.calls[1][0][0].clientEventId,
    );
    expect(second.count).toBe(0);
    expect(store.getItem("hirelens.monitoring.interview-a")).toBeNull();
  });
  it("does not lose events added while a batch is uploading and avoids parallel flushes", async () => {
    let release!: () => void;
    const deliver = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const q = new MonitoringQueue("i", null, deliver, vi.fn());
    q.add("copy");
    const first = q.flush();
    q.add("paste");
    const second = q.flush();
    expect(first).toBe(second);
    release();
    await first;
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(q.count).toBe(0);
  });
  it("bounds offline metadata and discloses dropped observations", () => {
    const store = memoryStore(),
      q = new MonitoringQueue("i", store, vi.fn(), vi.fn());
    for (let i = 0; i < 205; i++) q.add("blur");
    const saved = JSON.parse(store.getItem("hirelens.monitoring.i")!);
    expect(q.count).toBe(200);
    expect(saved[0].kind).toBe("monitoring-unavailable");
  });
  it("keeps interview queues isolated and tolerates blocked storage", async () => {
    const store = memoryStore(),
      first = new MonitoringQueue("a", store, vi.fn(), vi.fn());
    first.add("copy");
    expect(new MonitoringQueue("b", store, vi.fn(), vi.fn()).count).toBe(0);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const q = new MonitoringQueue("c", blocked, async () => {}, vi.fn());
    q.add("focus");
    await q.flush();
    expect(q.count).toBe(0);
  });
  it("requires sustained observations and never turns a camera outage into a no-face event", () => {
    const detector = new SustainedObservation();
    expect(detector.observe("no-face", 1000, 5000)).toBeNull();
    expect(detector.observe("one", 3000, 5000)).toBeNull();
    expect(detector.observe("no-face", 4000, 5000)).toBeNull();
    expect(detector.observe("no-face", 9000, 5000)).toEqual({
      kind: "no-face",
      durationMs: 5000,
    });
    expect(detector.observe("no-face", 14000, 5000)).toBeNull();
    expect(detector.observe("unavailable", 20000, 5000)).toBeNull();
    expect(detector.observe("unavailable", 40000, 5000)).toBeNull();
    expect(detector.observe("multiple-faces", 41000, 5000)).toBeNull();
    expect(detector.observe("multiple-faces", 46000, 5000)?.kind).toBe(
      "multiple-faces",
    );
  });
  it("explains permission, busy-device and screen-cancel errors without raw browser exceptions", () => {
    expect(mediaError({ name: "NotAllowedError" })).toContain("site settings");
    expect(mediaError({ name: "NotReadableError" })).toContain(
      "Close other apps",
    );
    expect(mediaError({ name: "NotAllowedError" }, true)).toContain(
      "cancelled",
    );
    expect(mediaError({ name: "NotFoundError" })).toContain("Connect a device");
  });
});
