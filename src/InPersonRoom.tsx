import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Interview, Report } from "../shared/types";
import { dateLabel, send, useResource } from "./api";
import { useAuth } from "./auth-context";
import {
  ErrorBox,
  Field,
  Loading,
  Notice,
  PageTitle,
  Panel,
  Status,
} from "./ui";
import "./in-person-room.css";

export default function InPersonRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const record = useResource<Interview | null>(`/interviews/${id}`, null);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const interview = record.data;
  const manager = user.role === "hr" && interview?.interviewerId === user._id;
  useEffect(() => {
    if (!dirty) setNotes(interview?.notes || "");
  }, [interview?.notes, dirty]);
  useEffect(() => {
    const timer = window.setInterval(record.reload, 15000);
    return () => clearInterval(timer);
  }, [record.reload]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (record.loading) return <Loading />;
  if (!interview)
    return <ErrorBox message={record.error || "Interview unavailable."} />;
  return (
    <main className="in-person-room" id="main-content">
      <Link to="/interviews" className="back-link">
        Back to interviews
      </Link>
      <PageTitle
        title={interview.jobTitle}
        description={`${interview.candidateName} · In-person interview`}
      />
      <ErrorBox message={error || record.error} />
      <Panel title="Appointment details">
        <div className="panel-form">
          <Status value={interview.status} />
          <p>
            <strong>When:</strong> {dateLabel(interview.scheduledAt)} ·{" "}
            {interview.duration} minutes
          </p>
          <p>
            <strong>Where:</strong>{" "}
            {interview.venue ||
              "Contact the assigned HR for the meeting location."}
          </p>
          <p>
            <strong>Round:</strong> {interview.roundName || "Interview"}
          </p>
          <Notice>
            This appointment takes place in person. Contact the hiring team if
            you need accessibility support or a different arrangement.
          </Notice>
          {manager && interview.status === "scheduled" && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await send(`/interviews/${id}/start`);
                  await record.reload();
                })
              }
            >
              Start in-person interview
            </button>
          )}
          {manager && interview.status === "live" && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (dirty)
                    await send(`/interviews/${id}/notes`, { notes }, "PATCH");
                  const report = await send<Report>(`/interviews/${id}/end`);
                  navigate(`/reports/${report._id}`);
                })
              }
            >
              Complete interview and write feedback
            </button>
          )}
          {interview.status === "completed" && (
            <Link className="btn secondary" to="/reports">
              View available feedback
            </Link>
          )}
        </div>
      </Panel>
      {manager && ["scheduled", "live"].includes(interview.status) && (
        <Panel
          title="Interview notes"
          description="Private notes for the hiring team. Add ratings and a decision after completing the interview."
        >
          <form
            className="panel-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await send(`/interviews/${id}/notes`, { notes }, "PATCH");
                setDirty(false);
                setSaved(true);
                await record.reload();
              });
            }}
          >
            <Field label="Job-relevant observations">
              <textarea
                rows={8}
                maxLength={12000}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </Field>
            <button className="btn secondary" disabled={busy}>
              Save notes
            </button>
            {saved && <p role="status">Notes saved.</p>}
          </form>
        </Panel>
      )}
    </main>
  );
}
