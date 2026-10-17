import { useEffect, useRef, useState } from "react";
import { mediaError } from "./media-errors";
import { requestMedia } from "./media-request";

export function useInterviewDevices(
  record: (kind: string, duration?: number, detail?: string) => void,
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState(false);
  const [mic, setMic] = useState(false);
  const [message, setMessage] = useState(
    "Camera and microphone have not been checked.",
  );
  const current = useRef<MediaStream | null>(null);
  const display = useRef<MediaStream | null>(null);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true),
    request = useRef(0);
  const recordRef = useRef(record);
  recordRef.current = record;
  function stopScreen() {
    if (!display.current) return;
    display.current.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    display.current = null;
    setScreen(null);
    recordRef.current("screen-share-stopped");
  }
  function stop() {
    ++request.current;
    pending.current?.abort();
    stopScreen();
    current.current?.getTracks().forEach((t) => {
      t.onended = t.onmute = t.onunmute = null;
      t.stop();
    });
    current.current = null;
    setStream(null);
    setCamera(false);
    setMic(false);
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
  async function check(
    audioOnly = false,
    selected?: { camera?: string; microphone?: string },
  ) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera and microphone need HTTPS or localhost. Open the secure interview link in a supported browser.",
      );
    const version = ++request.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setMessage("Waiting for your browser’s camera and microphone permission…");
    try {
      const next = await requestMedia(
        navigator.mediaDevices.getUserMedia({
          video: audioOnly
            ? false
            : {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24, max: 30 },
                ...(selected?.camera
                  ? { deviceId: { exact: selected.camera } }
                  : {}),
              },
          audio: {
            ...(selected?.microphone
              ? { deviceId: { exact: selected.microphone } }
              : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
        controller.signal,
      );
      if (!alive.current || version !== request.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      const previous = current.current;
      current.current = next;
      setStream(next);
      setCamera(next.getVideoTracks().length > 0);
      setMic(next.getAudioTracks().length > 0);
      setMessage(
        audioOnly
          ? "Microphone ready. Camera and face monitoring are unavailable in audio-only mode."
          : "Camera and microphone are ready.",
      );
      for (const track of next.getTracks()) {
        const video = track.kind === "video";
        recordRef.current(video ? "camera-on" : "microphone-on");
        track.onended = () => {
          if (current.current !== next) return;
          (video ? setCamera : setMic)(false);
          setMessage(
            `${video ? "Camera" : "Microphone"} disconnected. Select Check devices to recover.`,
          );
          recordRef.current(
            video ? "camera-off" : "microphone-off",
            0,
            "Device track ended",
          );
        };
        track.onmute = () => {
          if (current.current === next) {
            if (video) {
              setCamera(false);
              recordRef.current(
                "camera-off",
                0,
                "Camera temporarily unavailable",
              );
            }
            setMessage(
              `${video ? "Camera" : "Microphone"} temporarily unavailable. Check the device if it does not recover.`,
            );
            recordRef.current(
              "monitoring-unavailable",
              0,
              `${video ? "Camera" : "Microphone"} track temporarily muted by browser`,
            );
          }
        };
        track.onunmute = () => {
          if (current.current === next) {
            if (video) {
              setCamera(track.enabled);
              recordRef.current("camera-on", 0, "Camera recovered");
            }
            setMessage("Device connection restored.");
          }
        };
      }
      previous?.getTracks().forEach((t) => {
        t.onended = t.onmute = t.onunmute = null;
        t.stop();
      });
    } catch (error) {
      if (alive.current && version === request.current) {
        const text = mediaError(error);
        setMessage(text);
        recordRef.current(
          "monitoring-unavailable",
          0,
          "Device permission or capture failed",
        );
        throw new Error(text);
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  async function shareScreen(entireScreen = false) {
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw new Error(
        "Screen sharing is unavailable in this browser. Try a desktop browser using the secure interview link.",
      );
    const version = request.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const next = await requestMedia(
        navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 10, max: 15 } },
          audio: false,
        }),
        controller.signal,
      );
      if (!alive.current || version !== request.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      const surface = next.getVideoTracks()[0]?.getSettings().displaySurface;
      if (entireScreen && surface && surface !== "monitor") {
        next.getTracks().forEach((t) => t.stop());
        throw new Error(
          "This interview requires your entire screen. Select Entire Screen in the browser sharing dialog.",
        );
      }
      if (entireScreen && !surface) {
        next.getTracks().forEach((t) => t.stop());
        throw new Error(
          "This browser cannot verify entire-screen sharing. Use a supported desktop browser or ask HR to adjust the policy.",
        );
      }
      stopScreen();
      display.current = next;
      setScreen(next);
      next.getVideoTracks()[0].onended = stopScreen;
      recordRef.current(
        "screen-share-started",
        0,
        `Shared ${next.getVideoTracks()[0].getSettings().displaySurface || "selected surface"}`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("This interview") ||
          error.message.startsWith("This browser cannot"))
      )
        throw error;
      throw new Error(mediaError(error, true));
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  function toggle(kind: "video" | "audio") {
    const tracks =
      current.current
        ?.getTracks()
        .filter((t) => t.kind === kind && t.readyState === "live") || [];
    if (!tracks.length) {
      setMessage(
        "Select Check devices to enable a working camera and microphone.",
      );
      return;
    }
    const enabled = !tracks[0].enabled;
    tracks.forEach((t) => {
      t.enabled = enabled;
    });
    (kind === "video" ? setCamera : setMic)(enabled);
    recordRef.current(
      `${kind === "video" ? "camera" : "microphone"}-${enabled ? "on" : "off"}`,
    );
  }
  return {
    stream,
    screen,
    camera,
    mic,
    message,
    check,
    shareScreen,
    stopScreen,
    stop,
    toggle,
    cancelRequest: () => pending.current?.abort(),
  };
}
