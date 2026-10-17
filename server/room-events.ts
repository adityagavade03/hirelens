import type { Server } from "socket.io";
let channel: Server | undefined;
export function setRoomChannel(io: Server) {
  channel = io;
}
// Only invalidation metadata travels on this channel. Every subsequent read is authorized.
export function roomChanged(id: string, kind: string) {
  channel
    ?.to(`watch:interview:${id}`)
    .emit("room:update", { interviewId: id, kind });
}
export const humanRoom = (i: any) =>
  i.type !== "practice" && i.facilitator !== "ai" && i.mode !== "in_person";
export function admitted(i: any) {
  return !humanRoom(i) || !!i.admittedAt;
}

// HireLens negotiates audio, webcam, then candidate screen. Never authorize an
// outbound second video track for HR, including implicit SDP sendrecv defaults.
export function validateRoomSdp(sdp: string, candidate: boolean) {
  const sections = sdp.split(/\r?\nm=/);
  if (!sections[0].startsWith("v=0") || sections.length !== 4)
    throw new Error("Unsupported interview media layout.");
  const sessionDirection =
    sections[0].match(
      /(?:^|\n)a=(sendrecv|sendonly|recvonly|inactive)(?:\r?$)/m,
    )?.[1] || "sendrecv";
  if (
    (
      sections[0].match(
        /(?:^|\n)a=(?:sendrecv|sendonly|recvonly|inactive)(?:\r?$)/gm,
      ) || []
    ).length > 1
  )
    throw new Error("Ambiguous media direction.");
  for (let n = 1; n < sections.length; n++) {
    if (!sections[n].startsWith(n === 1 ? "audio " : "video "))
      throw new Error("Unsupported interview media layout.");
    const direction =
      sections[n].match(
        /(?:^|\n)a=(sendrecv|sendonly|recvonly|inactive)(?:\r?$)/m,
      )?.[1] || sessionDirection;
    if (
      (
        sections[n].match(
          /(?:^|\n)a=(?:sendrecv|sendonly|recvonly|inactive)(?:\r?$)/gm,
        ) || []
      ).length > 1
    )
      throw new Error("Ambiguous media direction.");
    if (n === 3 && !candidate && !["recvonly", "inactive"].includes(direction))
      throw new Error("Only the candidate can publish screen media.");
    if (n === 3 && candidate && !["sendonly", "inactive"].includes(direction))
      throw new Error("Candidate screen media must be send-only.");
  }
}
