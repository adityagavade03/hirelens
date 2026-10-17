import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { testRelay, type CallStats } from "./rtc-diagnostics";
import type { ServiceStatus } from "../shared/types";

export function RoomDiagnostics({
  id,
  services,
  stats,
  connection,
}: {
  id: string;
  services: ServiceStatus | null;
  stats: CallStats | null;
  connection: string;
}) {
  const [relay, setRelay] = useState(
    "Relay has not been tested on this device.",
  );
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  async function checkRelay() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setChecking(true);
    setRelay("Testing a data connection through the relay…");
    try {
      const configuration = await api<RTCConfiguration>(
        `/interviews/${id}/ice`,
        {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        },
      );
      await testRelay(configuration, request.signal);
      if (live.current)
        setRelay(
          "Relay data check passed on this device. A two-device camera/audio check on separate networks is still required.",
        );
    } catch (e) {
      if (live.current) setRelay((e as Error).message);
    } finally {
      controller.current = null;
      if (live.current) setChecking(false);
    }
  }
  async function checkCode() {
    setCheckingCode(true);
    try {
      const rows = await api<{ key: string }[]>("/languages", {
        signal: AbortSignal.timeout(10000),
      });
      if (live.current)
        setCode(
          services?.codePublicDemo
            ? "Public Judge0 API is reachable for personal practice only. Hiring code execution needs a managed or self-hosted service."
            : `Execution API reachable · languages: ${rows.map((r) => r.key).join(", ") || "none supported"}. Run a program in Coding to verify the worker.`,
        );
    } catch (e) {
      if (live.current) setCode((e as Error).message);
    } finally {
      if (live.current) setCheckingCode(false);
    }
  }
  return (
    <section className="meeting-diagnostics" aria-label="Connection checks">
      <h3>Connection checks</h3>
      <dl>
        <dt>Camera / microphone support</dt>
        <dd>
          {globalThis.isSecureContext &&
          typeof navigator.mediaDevices?.getUserMedia === "function"
            ? "Available · use Check selected devices for permission"
            : "Requires HTTPS or localhost and a supported browser"}
        </dd>
        <dt>Screen capture support</dt>
        <dd>
          {typeof navigator.mediaDevices?.getDisplayMedia === "function"
            ? "Available · selection is required when sharing"
            : "Unavailable in this browser; use a supported desktop browser"}
        </dd>
        <dt>Video connection</dt>
        <dd>{connection}</dd>
        <dt>Current route</dt>
        <dd>
          {stats?.route === "relay"
            ? "TURN relay in use"
            : stats?.route === "direct"
              ? "Direct connection"
              : "Not measured"}
        </dd>
        <dt>Round-trip time</dt>
        <dd>
          {stats?.roundTripMs === undefined
            ? "Not measured"
            : `${stats.roundTripMs} ms`}
        </dd>
        <dt>Media traffic</dt>
        <dd>
          {stats
            ? `${Math.round(stats.sentBytes / 1024)} KB sent · ${Math.round(stats.receivedBytes / 1024)} KB received`
            : "Not measured"}
        </dd>
      </dl>
      {!services?.turn && (
        <p>
          TURN is not configured. Calls on restricted or separate networks may
          fail.
        </p>
      )}
      {services?.turn && services.turnLocalDev && (
        <p>
          A local test relay is configured for this computer. Calls between
          different internet connections still require a public TURN relay.
        </p>
      )}
      <button
        className="btn secondary"
        disabled={checking}
        onClick={() => void checkRelay()}
      >
        {checking ? "Checking relay…" : "Test relay connection"}
      </button>
      {checking && (
        <button
          className="btn secondary"
          onClick={() => controller.current?.abort()}
        >
          Cancel check
        </button>
      )}
      <p role="status">{relay}</p>
      <button
        className="btn secondary"
        disabled={checkingCode}
        onClick={() => void checkCode()}
      >
        {checkingCode ? "Checking execution API…" : "Check code service"}
      </button>
      <p role="status">
        {code ||
          (services?.codePublicDemo
            ? "Public practice runner only. Hiring code execution needs a managed or self-hosted service."
            : services?.code
              ? "Execution is configured but has not been tested here."
              : "Judge0 execution needs setup. Code editing and saving are available.")}
      </p>
      <p className="muted">
        These checks do not record your camera or microphone. Traffic counters
        show received data, not confirmation that the other participant can hear
        or see it.
      </p>
    </section>
  );
}
