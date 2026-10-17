import { createAdapter } from "@socket.io/redis-streams-adapter";
import { redis } from "./scaling.js";
import type { User } from "../shared/types.js";
import { Server } from "socket.io";
import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from "node:http";
import { z } from "zod";
import { config, allowedOrigins } from "./config.js";
import {
  privatePreviewSocketAllowed,
  trackPrivatePreviewSocket,
  privatePreviewConfigured,
  privatePreviewEnabled,
} from "./private-preview.js";
import { admitted, setRoomChannel, validateRoomSdp } from "./room-events.js";
import {
  userForToken,
  accessibleInterview,
  mustAttendInterview,
} from "./security.js";
export function attachRealtime(server: HttpServer) {
  const io = new Server(server, {
    serveClient: false,
    cors: { origin: [...allowedOrigins], credentials: true },
    maxHttpBufferSize: 64000,
    allowRequest: (req, callback) =>
      callback(
        null,
        privatePreviewSocketAllowed(req) &&
          (!req.headers.origin || allowedOrigins.has(req.headers.origin)),
      ),
  });
  // Engine.IO polling requests otherwise bypass Express and allowRequest only
  // runs for the initial handshake. Protect every polling/upgrade request.
  io.engine.use(
    (
      req: IncomingMessage,
      res: ServerResponse,
      next: (error?: Error) => void,
    ) => {
      if (privatePreviewSocketAllowed(req)) return next();
      res.writeHead(
        privatePreviewConfigured() && !privatePreviewEnabled() ? 410 : 403,
        {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      );
      res.end(JSON.stringify({ error: "Private preview access is required." }));
    },
  );
  if (redis) io.adapter(createAdapter(redis));
  setRoomChannel(io);
  const localAuth = new Map<string, { user: User; token?: string }>();
  io.use(async (socket, next) => {
    try {
      if (!privatePreviewSocketAllowed(socket.request))
        return next(new Error("Private preview access is required."));
      const token = socket.request.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("hirelens_session="))
        ?.slice("hirelens_session=".length);
      const user = await userForToken(token);
      if (!user) return next(new Error("Please sign in."));
      localAuth.set(socket.id, { user, token });
      socket.data.userId = user._id;
      next();
    } catch {
      next(new Error("Authentication unavailable."));
    }
  });
  io.on("connection", (socket) => {
    const auth = localAuth.get(socket.id)!;
    socket.on("disconnect", () => localAuth.delete(socket.id));
    trackPrivatePreviewSocket(socket);
    let count = 0;
    let windowStart = Date.now();
    socket.use(async (_packet, next) => {
      try {
        if (Date.now() - windowStart > 60000) {
          windowStart = Date.now();
          count = 0;
        }
        if (++count > 180) throw new Error("Too many room events.");
        const user = await userForToken(auth.token);
        if (!user) {
          socket.disconnect(true);
          return;
        }
        auth.user = user;
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error("Unauthorized"));
      }
    });
    socket.on("room:watch", async (payload, ack) => {
      try {
        const { interviewId } = z
          .object({ interviewId: z.string() })
          .parse(payload);
        const interview = await accessibleInterview(auth.user, interviewId);
        await mustAttendInterview(auth.user, interview);
        for (const old of socket.rooms)
          if (old.startsWith("watch:")) await socket.leave(old);
        await socket.join(`watch:interview:${interviewId}`);
        if (typeof ack === "function") ack({ ok: true });
      } catch {
        if (typeof ack === "function")
          ack({ ok: false, error: "Room access denied." });
      }
    });
    socket.on("room:join", async (payload, ack) => {
      try {
        const { interviewId } = z
          .object({ interviewId: z.string() })
          .parse(payload);
        const interview = await accessibleInterview(auth.user, interviewId);
        await mustAttendInterview(auth.user, interview);
        if (interview.mode === "in_person")
          throw new Error(
            "Online media is not enabled for an in-person appointment.",
          );
        if (interview.status !== "live")
          throw new Error("Start the interview before joining.");
        if (auth.user.role === "candidate" && !admitted(interview))
          throw new Error("Wait for the interviewer to admit you.");
        if (
          ![interview.candidateId, interview.interviewerId].includes(
            auth.user._id,
          )
        )
          throw new Error("Only assigned participants can join.");
        if (
          auth.user.role === "candidate" &&
          interview.type !== "practice" &&
          !interview.consentAt
        )
          throw new Error("Consent is required.");
        const room = `interview:${interviewId}`;
        for (const old of socket.rooms)
          if (old.startsWith("interview:")) await socket.leave(old);
        const peers = await io.in(room).fetchSockets();
        for (const peer of peers)
          if (peer.data.userId === auth.user._id) peer.disconnect(true);
        await socket.join(room);
        socket.data.interviewId = interviewId;
        socket.to(room).emit("peer:joined", { userId: auth.user._id });
        if (typeof ack === "function")
          ack({
            ok: true,
            peers: peers
              .filter((p) => p.data.userId !== auth.user._id)
              .map((p) => ({
                userId: p.data.userId,
                media: p.data.mediaState,
              })),
          });
      } catch (error) {
        if (typeof ack === "function")
          ack({
            ok: false,
            error: error instanceof Error ? error.message : "Unable to join",
          });
      }
    });
    socket.on("signal", async (payload, ack) => {
      try {
        const input = z
          .object({
            interviewId: z.string(),
            description: z
              .object({
                type: z.enum(["offer", "answer"]),
                sdp: z.string().max(50000),
              })
              .optional(),
            candidate: z
              .object({
                candidate: z.string().max(4000),
                sdpMid: z.string().nullable().optional(),
                sdpMLineIndex: z.number().nullable().optional(),
                usernameFragment: z.string().nullable().optional(),
              })
              .optional(),
          })
          .refine(
            (value) => !!value.description !== !!value.candidate,
            "Send one description or candidate.",
          )
          .parse(payload);
        if (socket.data.interviewId !== input.interviewId)
          throw new Error("Join the authorized room first.");
        const interview = await accessibleInterview(
          auth.user,
          input.interviewId,
        );
        await mustAttendInterview(auth.user, interview);
        if (interview.mode === "in_person")
          throw new Error(
            "Online media is not enabled for an in-person appointment.",
          );
        if (interview.status !== "live") throw new Error("Interview ended.");
        if (!admitted(interview))
          throw new Error("The candidate has not been admitted.");
        if (input.description)
          validateRoomSdp(
            input.description.sdp,
            auth.user.role === "candidate",
          );
        socket
          .to(`interview:${input.interviewId}`)
          .emit("signal", { ...input, from: auth.user._id });
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function")
          ack({
            ok: false,
            error:
              error instanceof Error ? error.message : "Signaling rejected",
          });
      }
    });
    socket.on("media:state", async (payload, ack) => {
      try {
        const input = z
          .object({
            interviewId: z.string(),
            camera: z.boolean(),
            microphone: z.boolean(),
            screen: z.boolean(),
          })
          .parse(payload);
        if (socket.data.interviewId !== input.interviewId)
          throw new Error("Join the authorized room first.");
        const interview = await accessibleInterview(
          auth.user,
          input.interviewId,
        );
        await mustAttendInterview(auth.user, interview);
        if (interview.mode === "in_person")
          throw new Error(
            "Online media is not enabled for an in-person appointment.",
          );
        if (interview.status !== "live") throw new Error("Interview ended.");
        if (auth.user.role !== "candidate" && input.screen)
          throw new Error("Only the candidate can publish screen media.");
        socket.data.mediaState = {
          camera: input.camera,
          microphone: input.microphone,
          screen: input.screen,
        };
        socket
          .to(`interview:${input.interviewId}`)
          .emit("media:state", { ...input, from: auth.user._id });
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function")
          ack({
            ok: false,
            error:
              error instanceof Error ? error.message : "Media state rejected",
          });
      }
    });
    socket.on("disconnecting", () => {
      for (const room of socket.rooms)
        if (room.startsWith("interview:")) socket.to(room).emit("peer:left");
    });
  });
  return io;
}
