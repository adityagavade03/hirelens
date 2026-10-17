import { useState, type FormEvent } from "react";
import type { MonitoringEvent } from "../shared/types";
import { api, dateLabel } from "./api";
import { ErrorBox, Modal } from "./ui";

const reviewLabels = {
  reviewed: "Reviewed",
  explained: "Context recorded",
  follow_up: "Follow-up needed",
};
type ReviewStatus = keyof typeof reviewLabels;

/** Staff-only containers own access and refresh; the API enforces authorization. */
export function EventReviewControls({
  interviewId,
  event,
  readOnly = false,
  onSaved,
}: {
  interviewId: string;
  event: MonitoringEvent;
  readOnly?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ReviewStatus>("reviewed");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function submit(form: FormEvent) {
    form.preventDefault();
    if (busy || readOnly) return;
    const trimmed = note.trim();
    if (trimmed.length < 10 || trimmed.length > 2000) {
      setError("Add a review note between 10 and 2,000 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/interviews/${interviewId}/events/${event._id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: trimmed }),
        signal: AbortSignal.timeout(15000),
      });
      await onSaved();
      setOpen(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="monitoring-review">
      <p className="small">
        <strong>
          {event.review
            ? reviewLabels[event.review.status]
            : "Awaiting human review"}
        </strong>
        {event.review && <> · {dateLabel(event.review.reviewedAt)}</>}
      </p>
      {event.review && <p>{event.review.note}</p>}
      {!readOnly && (
        <button
          className="btn secondary"
          onClick={() => {
            setStatus(event.review?.status || "reviewed");
            setNote(event.review?.note || "");
            setError("");
            setOpen(true);
          }}
        >
          {event.review ? "Edit review" : "Review event"}
        </button>
      )}
      {open && (
        <Modal
          title="Review monitoring event"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            <strong>{event.kind.replaceAll("-", " ")}</strong> ·{" "}
            {dateLabel(event.occurredAt)}
            {event.durationMs
              ? ` · ${(event.durationMs / 1000).toFixed(1)} seconds`
              : ""}
          </p>
          <p>{event.detail}</p>
          <p>
            Record observable facts and the candidate’s explanation, including
            technical issues or accommodations. An event alone does not
            establish misconduct. This review does not change technical scores
            or make a hiring decision.
          </p>
          <form onSubmit={submit}>
            <label className="field">
              Review status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ReviewStatus)}
                disabled={busy || readOnly}
              >
                {Object.entries(reviewLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Review note
              <textarea
                rows={4}
                minLength={10}
                maxLength={2000}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy || readOnly}
                placeholder="Describe the observation, explanation and any follow-up needed."
              />
            </label>
            <ErrorBox message={error} />
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy || readOnly}>
                {busy ? "Saving…" : "Save review"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
