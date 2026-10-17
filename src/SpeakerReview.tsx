import { useEffect, useState } from "react";
import { api, send } from "./api";
import type { SpeakerResult } from "../shared/speaker-analysis";
import "./gaze.css";
type Analysis = {
  state: string;
  result?: SpeakerResult;
  error?: string;
} | null;
export function SpeakerReview({
  clipId,
  owner,
  locked = false,
}: {
  clipId: string;
  owner: boolean;
  locked?: boolean;
}) {
  const [analysis, setAnalysis] = useState<Analysis>(null),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [capability, setCapability] = useState<{
    speakerAnalysis: boolean;
    processing: string;
  } | null>(null);
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      api<Analysis>(`/media/${clipId}/speakers`),
      api<{ speakerAnalysis: boolean; processing: string }>(
        "/proctoring/capabilities",
      ),
    ])
      .then(([result, status]) => {
        if (!disposed) {
          setAnalysis(result);
          setCapability(status);
        }
      })
      .catch(() => {
        if (!disposed) setError("Speaker analysis status could not be loaded.");
      });
    return () => {
      disposed = true;
    };
  }, [clipId]);
  useEffect(() => {
    if (analysis?.state !== "processing") return;
    let disposed = false,
      attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > 30) {
        clearInterval(timer);
        setError(
          "Automatic status checks stopped. Refresh the analysis status; an expired request can be retried.",
        );
        return;
      }
      void api<Analysis>(`/media/${clipId}/speakers`)
        .then((result) => {
          if (!disposed) setAnalysis(result);
        })
        .catch(() => {
          if (!disposed) {
            clearInterval(timer);
            setError(
              "Status checks lost connection. Refresh the analysis status when connected.",
            );
          }
        });
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [clipId, analysis?.state]);
  return (
    <section className="gaze-preview" aria-label="Optional speaker analysis">
      <h4>Optional speaker analysis</h4>
      <p>
        Estimates sustained speaker clusters in this saved clip. Interviewer
        playback, noise and model errors can create extra clusters. It does not
        identify people or change any score.
      </p>
      {error && <p role="alert">{error}</p>}
      {analysis?.state === "processing" && (
        <p role="status">
          Speaker analysis is running. This page checks its status every five
          seconds.
        </p>
      )}
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={async () => {
          setError("");
          try {
            setAnalysis(await api<Analysis>(`/media/${clipId}/speakers`));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Refresh analysis status
      </button>
      {analysis?.result && (
        <>
          <p>{analysis.result.message}</p>
          <p>
            {analysis.result.estimatedSpeakers} sustained estimated cluster(s) ·{" "}
            {analysis.result.duration.toFixed(1)} seconds analyzed
          </p>
          <details>
            <summary>Estimated speaker timeline and limitations</summary>
            <p>{analysis.result.limitations}</p>
            <p>Model: {analysis.result.model}</p>
            <ol>
              {analysis.result.segments.map((s, index) => (
                <li key={index}>
                  {s.start.toFixed(1)}–{s.end.toFixed(1)} seconds:{" "}
                  {s.speaker.replace("speaker_", "Cluster ")}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {analysis?.state === "failed" && <p role="status">{analysis.error}</p>}
      {owner && (
        <>
          {!capability?.speakerAnalysis && (
            <p>
              Connect the local speaker service to enable this optional
              analysis.
            </p>
          )}
          {locked && (
            <p>
              This report is finalized; a new analysis cannot be added. You can
              still remove an existing optional result.
            </p>
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || locked}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I consent to sending this saved clip to the{" "}
            {capability?.processing || "configured speaker service"} for speaker
            clustering. Authorized interview reviewers can see the result for up
            to seven days.
          </label>
          <button
            type="button"
            className="btn secondary"
            disabled={
              !consent ||
              !capability?.speakerAnalysis ||
              busy ||
              locked ||
              analysis?.state === "processing"
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setAnalysis(
                  await send<Analysis>(`/media/${clipId}/speakers`, {
                    accepted: true,
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Analyzing saved clip…" : "Analyze this clip"}
          </button>
          {analysis && (
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api(`/media/${clipId}/speakers`, { method: "DELETE" });
                  setAnalysis(null);
                  setConsent(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove optional analysis
            </button>
          )}
        </>
      )}
      {!owner && !analysis && (
        <p>No candidate-consented speaker result is available for this clip.</p>
      )}
    </section>
  );
}
