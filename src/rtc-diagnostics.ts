export type CallStats = {
  route: "relay" | "direct" | "unknown";
  roundTripMs?: number;
  sentBytes: number;
  receivedBytes: number;
};

// Deliberately omit addresses, candidate strings and credentials from diagnostics.
export function summarizeCallStats(report: RTCStatsReport): CallStats {
  const rows: any[] = [];
  report.forEach((row) => rows.push(row));
  const transport = rows.find(
    (row) => row.type === "transport" && row.selectedCandidatePairId,
  );
  const pair = transport
    ? report.get(transport.selectedCandidatePairId)
    : rows.find(
        (row) => row.type === "candidate-pair" && row.selected === true,
      );
  const local = pair && report.get(pair.localCandidateId),
    remote = pair && report.get(pair.remoteCandidateId);
  const rtt = pair?.currentRoundTripTime;
  return {
    route:
      !local || !remote
        ? "unknown"
        : local.candidateType === "relay" || remote.candidateType === "relay"
          ? "relay"
          : "direct",
    roundTripMs:
      typeof rtt === "number" && Number.isFinite(rtt) && rtt >= 0
        ? Math.round(rtt * 1000)
        : undefined,
    sentBytes: rows
      .filter((row) => row.type === "outbound-rtp")
      .reduce((n, row) => n + (Number(row.bytesSent) || 0), 0),
    receivedBytes: rows
      .filter((row) => row.type === "inbound-rtp")
      .reduce((n, row) => n + (Number(row.bytesReceived) || 0), 0),
  };
}

export function hasRelay(configuration: RTCConfiguration) {
  return !!configuration.iceServers?.some(
    (server) =>
      [server.urls].flat().some((url) => /^turns?:/.test(url)) &&
      server.username &&
      server.credential,
  );
}

/** Explicit test: two local peers exchange a tiny message through TURN, without camera access. */
export async function testRelay(
  configuration: RTCConfiguration,
  signal: AbortSignal,
): Promise<void> {
  if (!hasRelay(configuration))
    throw new Error(
      "TURN is not configured. An administrator must connect a relay for restrictive networks.",
    );
  if (typeof RTCPeerConnection === "undefined")
    throw new Error("This browser does not support WebRTC.");
  if (signal.aborted) throw new Error("Relay check cancelled.");
  const peers: RTCPeerConnection[] = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const channels: RTCDataChannel[] = [];
  try {
    const left = new RTCPeerConnection({
      ...configuration,
      iceTransportPolicy: "relay",
    });
    peers.push(left);
    const right = new RTCPeerConnection({
      ...configuration,
      iceTransportPolicy: "relay",
    });
    peers.push(right);
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const fail = () => {
        if (!finished) {
          finished = true;
          reject(
            new Error(
              "Relay check failed. Check TURN credentials, firewall and network access, then retry.",
            ),
          );
        }
      };
      abort = () => {
        if (!finished) {
          finished = true;
          reject(new Error("Relay check cancelled."));
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(fail, 15000);
      const pending = new Map<RTCPeerConnection, RTCIceCandidateInit[]>([
        [left, []],
        [right, []],
      ]);
      const sendCandidate = (
        to: RTCPeerConnection,
        candidate: RTCIceCandidate | null,
      ) => {
        if (!candidate || finished) return;
        if (to.remoteDescription)
          void to.addIceCandidate(candidate).catch(fail);
        else pending.get(to)!.push(candidate.toJSON());
      };
      left.onicecandidate = (event) => sendCandidate(right, event.candidate);
      right.onicecandidate = (event) => sendCandidate(left, event.candidate);
      const apply = async (
        peer: RTCPeerConnection,
        description: RTCSessionDescriptionInit,
      ) => {
        if (finished) return;
        await peer.setRemoteDescription(description);
        for (const candidate of pending.get(peer)!.splice(0))
          await peer.addIceCandidate(candidate);
      };
      const channel = left.createDataChannel("hirelens-relay-check");
      channels.push(channel);
      right.ondatachannel = ({ channel: incoming }) => {
        channels.push(incoming);
        incoming.onmessage = ({ data }) => {
          if (data === "hirelens-check" && incoming.readyState === "open")
            incoming.send("hirelens-ok");
        };
      };
      channel.onopen = () => {
        if (!finished) channel.send("hirelens-check");
      };
      channel.onerror = fail;
      channel.onmessage = ({ data }) => {
        if (data === "hirelens-ok" && !finished) {
          finished = true;
          resolve();
        }
      };
      void (async () => {
        await left.setLocalDescription(await left.createOffer());
        await apply(right, left.localDescription!);
        if (finished) return;
        await right.setLocalDescription(await right.createAnswer());
        await apply(left, right.localDescription!);
      })().catch(fail);
    });
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    channels.forEach((channel) => channel.close());
    peers.forEach((peer) => {
      peer.onicecandidate = peer.ondatachannel = null;
      peer.close();
    });
  }
}
