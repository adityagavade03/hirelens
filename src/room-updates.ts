import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
export function useRoomUpdates(id: string, onUpdate: (kind: string) => void) {
  const latest = useRef(onUpdate);
  latest.current = onUpdate;
  const [status, setStatus] = useState("Connecting room updates…");
  useEffect(() => {
    const socket = io({ withCredentials: true, autoConnect: false });
    let disposed = false;
    socket.on("connect", async () => {
      try {
        const result = await socket
          .timeout(10000)
          .emitWithAck("room:watch", { interviewId: id });
        if (disposed) return;
        setStatus(result?.ok ? "Room updates connected" : "Room access denied");
        if (result?.ok) latest.current("refresh");
      } catch {
        if (!disposed) setStatus("Room updates interrupted · retrying");
      }
    });
    socket.on("room:update", (event: { interviewId: string; kind: string }) => {
      if (event.interviewId === id) latest.current(event.kind);
    });
    socket.on("disconnect", () =>
      setStatus("Room updates interrupted · reconnecting"),
    );
    socket.on("connect_error", () =>
      setStatus("Room updates unavailable · retrying"),
    );
    socket.connect();
    const fallback = setInterval(() => latest.current("refresh"), 10000);
    return () => {
      disposed = true;
      clearInterval(fallback);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [id]);
  return status;
}
