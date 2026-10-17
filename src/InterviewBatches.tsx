import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Application, Job, Problem } from "../shared/types";
import { useAuth } from "./auth-context";
import { send, useResource, dateLabel } from "./api";
import { zonedTimeToUtc } from "../shared/time";
import { Panel, Field, ErrorBox, Submit, Notice } from "./ui";
export function InterviewBatches({
  job,
  applications,
  reload,
}: {
  job: Job;
  applications: Application[];
  reload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const requestId = useRef(crypto.randomUUID());
  const data = useResource<
    {
      _id: string;
      name: string;
      status: string;
      interviews: {
        _id: string;
        candidateName: string;
        scheduledAt: string;
        status: string;
      }[];
    }[]
  >(`/jobs/${job._id}/interview-batches`, []);
  const problems = useResource<Problem[]>("/problems", []);
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [mode, setMode] = useState<"video" | "in_person">("video");
  const eligible = applications.filter(
    (a) => a.status === "Shortlisted" && a.assignedHrId === user._id,
  );
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await send(`/jobs/${job._id}/interview-batches`, {
        ...v,
        requestId: requestId.current,
        applicationIds: selected,
        startsAt: zonedTimeToUtc(String(v.startsAt), zone),
        timezone: zone,
        duration: Number(v.duration),
        gap: Number(v.gap),
        mode,
        facilitator: mode === "in_person" ? "human" : v.facilitator,
      });
      requestId.current = crypto.randomUUID();
      setSelected([]);
      await reload();
      await data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Interview batches"
      description="Schedule your assigned candidates in consecutive appointments, with a private online room or an in-person meeting location."
    >
      <div className="panel-form">
        <ErrorBox message={error || data.error || problems.error} />
        {user.role === "hr" && (
          <form onSubmit={create}>
            <Field label="Batch name">
              <input
                name="name"
                required
                minLength={3}
                maxLength={100}
                placeholder="Java technical round — October"
              />
            </Field>
            <div className="form-grid">
              <Field label={`First interview starts (${zone})`}>
                <input type="datetime-local" name="startsAt" required />
              </Field>
              <Field label="Minutes per candidate">
                <input
                  type="number"
                  name="duration"
                  min={10}
                  max={180}
                  defaultValue={job.interviewInstructions.duration || 45}
                  required
                />
              </Field>
              <Field label="Break between candidates (minutes)">
                <input
                  type="number"
                  name="gap"
                  min={0}
                  max={60}
                  defaultValue={10}
                  required
                />
              </Field>
            </div>
            <Field label="Coding exercise">
              <select name="problemId" required>
                {problems.data.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Interview mode">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="video">Video interview</option>
                <option value="in_person">In person</option>
              </select>
            </Field>
            {mode === "in_person" && (
              <Field label="Meeting location">
                <input
                  name="venue"
                  required
                  minLength={5}
                  maxLength={500}
                  placeholder="Office address, floor and meeting room"
                />
              </Field>
            )}
            <Field label="Interview facilitator">
              <select name="facilitator" disabled={mode === "in_person"}>
                <option value="human">Human interviewer</option>
                <option value="ai">
                  AI-assisted interview (requires AI service)
                </option>
              </select>
            </Field>
            <fieldset>
              <legend>Shortlisted candidates</legend>
              {eligible.map((a) => (
                <label className="checkbox-field" key={a._id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(a._id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, a._id]
                          : ids.filter((id) => id !== a._id),
                      )
                    }
                  />
                  {a.candidateName}
                </label>
              ))}
            </fieldset>
            {!eligible.length && (
              <Notice>
                Check automatic screening results in Applications. Candidates
                handled by another interviewer are excluded.
              </Notice>
            )}
            <Submit busy={busy || !selected.length}>
              Schedule {selected.length} interviews
            </Submit>
          </form>
        )}
        {data.data.map((b) => (
          <section key={b._id}>
            <h3>
              {b.name} · {b.status}
            </h3>
            {user.role === "hr" && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await send(`/interview-batches/${b._id}/recover`);
                    requestId.current = crypto.randomUUID();
                    await data.reload();
                    await reload();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {b.status === "ready"
                  ? "Repair missing notifications"
                  : "Recover interrupted scheduling"}
              </button>
            )}
            {b.interviews.map((i) => (
              <p key={i._id}>
                {i.candidateName} · {dateLabel(i.scheduledAt)} · {i.status}{" "}
                <Link to="/interviews">View schedule</Link>
              </p>
            ))}
          </section>
        ))}
      </div>
    </Panel>
  );
}
