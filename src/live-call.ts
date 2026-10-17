import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "./api";
import { summarizeCallStats, type CallStats } from "./rtc-diagnostics";

export type MediaState = {
  camera: boolean;
  microphone: boolean;
  screen: boolean;
};
export type Signal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const mediaSections = (sdp = "") => sdp.split(/\r?\nm=/).slice(1);
const sectionMid = (section = "") =>
  section.match(/(?:^|\n)a=mid:([^\r\n]+)/)?.[1];

/** Candidate offers the initial three slots; either peer may later renegotiate. */
export class RtcSession {
  readonly peer: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingAnswer = false;
  private closed = false;
  private pending: RTCIceCandidateInit[] = [];
  private incoming = Promise.resolve();
  private updating = Promise.resolve();
  private local = new MediaStream();
  private display = new MediaStream();
  private remote = new MediaStream();
  private remoteDisplay = new MediaStream();
  private transceivers: RTCRtpTransceiver[] = [];
  private localTracks: (MediaStreamTrack | null)[] = [null, null, null];
  private adoptDescription(description: RTCSessionDescriptionInit) {
    const sections = mediaSections(description.sdp);
    const mids = sections.map(sectionMid);
    if (
      sections.length !== 3 ||
      sections.some(
        (section, index) => !section.startsWith(index ? "video " : "audio "),
      ) ||
      mids.some((mid) => mid == null) ||
      new Set(mids).size !== 3
    )
      throw new Error("Unsupported interview media layout.");
    const negotiated = mids.map((mid) =>
      this.peer
        .getTransceivers()
        .find((transceiver) => transceiver.mid === mid),
    );
    if (
      negotiated.some(
        (transceiver, index) =>
          !transceiver ||
          transceiver.receiver.track.kind !== (index ? "video" : "audio"),
      )
    )
      throw new Error(
        "Interview media could not be associated with its negotiated slots.",
      );
    this.transceivers = negotiated as RTCRtpTransceiver[];
    this.transceivers.forEach((transceiver, index) => {
      transceiver.direction =
        index === 2 ? (this.polite ? "recvonly" : "sendonly") : "sendrecv";
    });
  }
  private matchesDescription(candidate: RTCIceCandidateInit) {
    const sdp = this.peer.remoteDescription?.sdp;
    return (
      !candidate.usernameFragment ||
      !sdp ||
      sdp.split(/\r?\n/).includes(`a=ice-ufrag:${candidate.usernameFragment}`)
    );
  }
  constructor(
    configuration: RTCConfiguration,
    private polite: boolean,
    private send: (signal: Signal) => Promise<void>,
    private onRemote: (stream: MediaStream, screen: boolean) => void,
    private onError: (error: unknown) => void,
    onState: (state: RTCPeerConnectionState) => void,
  ) {
    this.peer = new RTCPeerConnection(configuration);
    // addTransceiver-created slots cannot be reused by an incoming initial offer.
    // HR adopts the browser's offered slots instead of creating duplicate senders.
    if (!polite)
      this.transceivers = [
        this.peer.addTransceiver("audio", {
          direction: "sendrecv",
          streams: [this.local],
        }),
        this.peer.addTransceiver("video", {
          direction: "sendrecv",
          streams: [this.local],
        }),
        this.peer.addTransceiver("video", {
          direction: "sendonly",
          streams: [this.display],
        }),
      ];
    this.peer.onnegotiationneeded = () => {
      void this.negotiate();
    };
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate && !this.closed)
        void send({ candidate: candidate.toJSON() }).catch((error) => {
          if (!this.closed) onError(error);
        });
    };
    this.peer.onconnectionstatechange = () => {
      if (!this.closed) onState(this.peer.connectionState);
    };
    this.peer.ontrack = (event) => {
      if (this.closed) return;
      // ontrack can fire during setRemoteDescription, before slots are adopted.
      // The negotiated MID, not getTransceivers() ordering, identifies the screen.
      const screenMid = sectionMid(
        mediaSections(this.peer.remoteDescription?.sdp)[2],
      );
      const screen =
        event.transceiver.mid != null && screenMid != null
          ? event.transceiver.mid === screenMid
          : event.transceiver === this.transceivers[2];
      const stream = screen ? this.remoteDisplay : this.remote;
      // Keep audio and video together even when the browser supplies streamless tracks.
      if (!stream.getTracks().some((t) => t.id === event.track.id))
        stream.addTrack(event.track);
      onRemote(stream, screen);
      event.track.onunmute = () => {
        if (!this.closed) onRemote(stream, screen);
      };
    };
  }
  async negotiate() {
    if (
      this.closed ||
      !this.transceivers.length ||
      this.makingOffer ||
      this.peer.signalingState !== "stable"
    )
      return;
    try {
      this.makingOffer = true;
      await this.peer.setLocalDescription();
      if (!this.closed)
        await this.send({ description: this.peer.localDescription! });
    } catch (e) {
      if (!this.closed) this.onError(e);
    } finally {
      this.makingOffer = false;
    }
  }
  receive(signal: Signal) {
    // Socket callbacks are asynchronous; serialize them so trickled ICE cannot race SDP.
    this.incoming = this.incoming
      .then(async () => {
        if (this.closed) return;
        const { description, candidate } = signal;
        if (description) {
          const ready =
            !this.makingOffer &&
            (this.peer.signalingState === "stable" || this.settingAnswer);
          const collision = description.type === "offer" && !ready;
          this.ignoreOffer = !this.polite && collision;
          if (this.ignoreOffer) {
            this.pending = [];
            return;
          }
          this.settingAnswer = description.type === "answer";
          try {
            await this.peer.setRemoteDescription(description);
            if (this.closed) return;
            this.adoptDescription(description);
            // A waiting HR's camera/microphone must attach to the newly offered
            // senders before its answer is produced.
            await this.attachTracks();
          } finally {
            this.settingAnswer = false;
          }
          for (const item of this.pending.splice(0))
            if (this.matchesDescription(item))
              await this.peer.addIceCandidate(item);
          if (description.type === "offer") {
            await this.peer.setLocalDescription();
            if (!this.closed)
              await this.send({ description: this.peer.localDescription! });
          }
        }
        if (candidate && !this.ignoreOffer) {
          if (this.peer.remoteDescription && this.matchesDescription(candidate))
            await this.peer.addIceCandidate(candidate);
          else if (this.pending.length < 128) this.pending.push(candidate);
        }
      })
      .catch((e) => {
        if (!this.closed && !this.ignoreOffer) this.onError(e);
      });
    return this.incoming;
  }
  update(stream: MediaStream | null, screen: MediaStream | null) {
    const live = (track?: MediaStreamTrack) =>
      track?.readyState === "live" ? track : null;
    this.localTracks = [
      live(stream?.getAudioTracks()[0]),
      live(stream?.getVideoTracks()[0]),
      this.polite ? null : live(screen?.getVideoTracks()[0]),
    ];
    return this.attachTracks();
  }
  private attachTracks() {
    this.updating = this.updating
      .then(async () => {
        if (this.closed) return;
        await Promise.all(
          this.transceivers.map((transceiver, i) =>
            transceiver.sender.replaceTrack(this.localTracks[i]),
          ),
        );
      })
      .catch((e) => {
        if (!this.closed) this.onError(e);
      });
    return this.updating;
  }
  close() {
    this.closed = true;
    this.pending = [];
    this.localTracks = [null, null, null];
    for (const stream of [this.remote, this.remoteDisplay])
      for (const track of stream.getTracks()) track.onunmute = null;
    this.peer.onnegotiationneeded =
      this.peer.onicecandidate =
      this.peer.ontrack =
      this.peer.onconnectionstatechange =
        null;
    this.peer.close();
  }
}

export function useLiveCall({
  id,
  active,
  candidate,
  stream,
  screen,
  media,
  record,
}: {
  id: string;
  active: boolean;
  candidate: boolean;
  stream: MediaStream | null;
  screen: MediaStream | null;
  media: MediaState;
  record: (kind: string, duration?: number, detail?: string) => void;
}) {
  const [connection, setConnection] = useState("Not connected");
  const [issue, setIssue] = useState("");
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [remoteScreen, setRemoteScreen] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<MediaState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stats, setStats] = useState<CallStats | null>(null);
  const session = useRef<RtcSession | null>(null);
  const latest = useRef({ stream, screen, media, record });
  latest.current = { stream, screen, media, record };
  const publish = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) {
      setStats(null);
      return;
    }
    let cancelled = false,
      busy = false;
    const timer = setInterval(async () => {
      const current = session.current;
      if (!current || current.peer.connectionState !== "connected") {
        setStats(null);
        return;
      }
      if (busy) return;
      busy = true;
      try {
        const report = await current.peer.getStats();
        if (!cancelled && current === session.current)
          setStats(summarizeCallStats(report));
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        busy = false;
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);
  useEffect(() => {
    void session.current?.update(stream, screen);
    publish.current?.();
  }, [stream, screen, media.camera, media.microphone, media.screen]);
  useEffect(() => {
    if (!active) return;
    let disposed = false,
      joined = false,
      present = false,
      restarting = false,
      failures = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let configuration: RTCConfiguration;
    let queued: Signal[] = [];
    const channel = io({
      withCredentials: true,
      autoConnect: false,
      timeout: 10000,
    });
    const clearPeer = (resetMedia = true) => {
      setStats(null);
      clearTimeout(recoveryTimer);
      session.current?.close();
      session.current = null;
      setRemote(null);
      setRemoteScreen(null);
      if (resetMedia) setRemoteMedia(null);
    };
    const failure = () => {
      if (!disposed)
        setIssue(
          "The video link could not be established. Check your connection, then select Reconnect video. Your answers stay in this room.",
        );
    };
    const emit = async (name: string, payload: object) => {
      if (disposed || !channel.connected || !joined) return;
      const reply = await channel
        .timeout(10000)
        .emitWithAck(name, { interviewId: id, ...payload });
      if (!reply?.ok)
        throw new Error(reply?.error || "Room connection rejected.");
    };
    const publishState = () => {
      if (joined) void emit("media:state", latest.current.media).catch(failure);
    };
    publish.current = publishState;
    const recover = async () => {
      const current = session.current;
      if (!current || disposed || !joined || !present || restarting) return;
      if (++failures > 2) {
        failure();
        return;
      }
      restarting = true;
      setConnection("Reconnecting video…");
      try {
        const ice = await api<RTCConfiguration>(`/interviews/${id}/ice`);
        if (disposed || current !== session.current) return;
        configuration = ice;
        current.peer.setConfiguration(ice);
        current.peer.restartIce();
        clearTimeout(recoveryTimer);
        recoveryTimer = setTimeout(() => {
          if (current.peer.connectionState !== "connected") void recover();
        }, 12000);
      } catch {
        failure();
      } finally {
        restarting = false;
      }
    };
    const createPeer = () => {
      clearPeer(false);
      failures = 0;
      if (!joined || !present || disposed) return;
      session.current = new RtcSession(
        configuration,
        !candidate,
        (signal) => emit("signal", signal),
        (value, isScreen) => {
          if (!disposed) (isScreen ? setRemoteScreen : setRemote)(value);
        },
        failure,
        (state) => {
          setConnection(state);
          if (state === "connected") {
            failures = 0;
            clearTimeout(recoveryTimer);
            setIssue("");
            latest.current.record(
              "connection-restored",
              0,
              "Video link connected",
            );
          } else if (state === "failed" || state === "disconnected") {
            latest.current.record(
              "connection-interrupted",
              0,
              "Video link interrupted",
            );
            clearTimeout(recoveryTimer);
            recoveryTimer = setTimeout(
              () => void recover(),
              state === "failed" ? 0 : 5000,
            );
          }
        },
      );
      void session.current.update(latest.current.stream, latest.current.screen);
      for (const signal of queued.splice(0))
        void session.current.receive(signal);
      publishState();
      recoveryTimer = setTimeout(() => {
        if (session.current?.peer.connectionState !== "connected")
          void recover();
      }, 20000);
    };
    channel.on("connect", async () => {
      try {
        setConnection("Joining secure room…");
        const result = await channel
          .timeout(10000)
          .emitWithAck("room:join", { interviewId: id });
        if (disposed) return;
        if (!result?.ok) {
          setIssue(
            result?.error || "Room access was denied. Rejoin the interview.",
          );
          return;
        }
        joined = true;
        present = present || !!result.peers?.length;
        if (result.peers?.[0]?.media) setRemoteMedia(result.peers[0].media);
        setIssue("");
        setConnection(
          present ? "Connecting video…" : "Waiting for the other participant",
        );
        createPeer();
      } catch {
        failure();
      }
    });
    channel.on("peer:joined", () => {
      present = true;
      queued = [];
      if (joined) {
        setConnection("Connecting video…");
        createPeer();
      }
    });
    channel.on("peer:left", () => {
      present = false;
      queued = [];
      clearPeer();
      setConnection("Participant disconnected · waiting to reconnect");
    });
    channel.on("signal", (data: Signal & { interviewId: string }) => {
      if (data.interviewId !== id) return;
      if (session.current) void session.current.receive(data);
      else if (queued.length < 128) queued.push(data);
    });
    channel.on("media:state", (data: MediaState & { interviewId: string }) => {
      if (data.interviewId === id) setRemoteMedia(data);
    });
    channel.on("connect_error", () => {
      setConnection("Connection unavailable · retrying");
      failure();
    });
    channel.on("disconnect", (reason) => {
      joined = false;
      present = false;
      queued = [];
      clearPeer();
      setConnection("Disconnected · reconnecting");
      latest.current.record(
        "connection-interrupted",
        0,
        "Room connection interrupted",
      );
      if (reason === "io server disconnect")
        setIssue(
          "This account opened another room session or its login expired. Close the other session, then sign in again if needed.",
        );
    });
    const start = async () => {
      setIssue("");
      setConnection("Preparing video…");
      try {
        if (typeof RTCPeerConnection === "undefined")
          throw new Error("Unsupported browser");
        configuration = await api<RTCConfiguration>(`/interviews/${id}/ice`);
        if (!disposed) channel.connect();
      } catch {
        failure();
        setConnection("Video unavailable");
      }
    };
    void start();
    return () => {
      disposed = true;
      joined = false;
      clearTimeout(recoveryTimer);
      publish.current = null;
      channel.removeAllListeners();
      channel.disconnect();
      clearPeer();
    };
  }, [id, active, candidate, attempt]);
  return {
    connection,
    issue,
    remote,
    remoteScreen,
    remoteMedia,
    stats,
    reconnect: () => setAttempt((n) => n + 1),
  };
}
