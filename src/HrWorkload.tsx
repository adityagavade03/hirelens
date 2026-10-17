import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Application } from "../shared/types";
import { send, useResource } from "./api";
import { Badge, Empty, ErrorBox, Field, Loading, Panel, Submit } from "./ui";

type Workload = {
  hrId: string;
  name: string;
  email: string;
  availability: "available" | "busy" | "unavailable";
  availabilityNote: string;
  capacity: number;
  activeCandidates: number;
  remainingCapacity: number;
  acceptedJobs: number;
};
export function HrAvailabilityPanel() {
  const record = useResource<Workload | null>("/hr/workload", null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await send(
        "/hr/workload-settings",
        {
          availability: data.get("availability"),
          interviewCapacity: Number(data.get("capacity")),
          availabilityNote: data.get("note"),
        },
        "PATCH",
      );
      await record.reload();
      setMessage(
        "Availability saved. Waiting candidates will be checked for assignment.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="My interview availability"
      description="Automatic assignment uses your accepted jobs, availability and current candidate workload."
    >
      <ErrorBox message={error || record.error} />
      {record.loading ? (
        <Loading />
      ) : record.data ? (
        <form
          className="panel-form"
          onSubmit={save}
          key={`${record.data.availability}-${record.data.capacity}-${record.data.availabilityNote}`}
        >
          <p>
            <strong>{record.data.activeCandidates}</strong> active candidates ·
            Capacity <strong>{record.data.capacity}</strong> ·{" "}
            {record.data.acceptedJobs} accepted jobs
          </p>
          <div className="form-grid">
            <Field label="Accept new assignments">
              <select
                name="availability"
                defaultValue={record.data.availability}
              >
                <option value="available">Available</option>
                <option value="busy">Busy — pause new assignments</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </Field>
            <Field label="Maximum active candidates">
              <input
                type="number"
                name="capacity"
                required
                min={1}
                max={500}
                defaultValue={record.data.capacity}
              />
            </Field>
          </div>
          <Field
            label="Availability note"
            hint="For example: on leave until Monday; existing appointments need rescheduling."
          >
            <input
              name="note"
              maxLength={500}
              defaultValue={record.data.availabilityNote}
            />
          </Field>
          <p className="muted">
            Existing appointments stay on your calendar. Reschedule them if your
            availability changes.
          </p>
          <Submit busy={busy}>Save availability</Submit>
          {message && <p role="status">{message}</p>}
        </form>
      ) : null}
    </Panel>
  );
}
export function CompanyWorkloadPanel() {
  const people = useResource<Workload[]>("/hr/workloads", []);
  const applications = useResource<Application[]>("/applications", []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void people.reload();
      void applications.reload();
    }, 20000);
    return () => clearInterval(timer);
  }, [people.reload, applications.reload]);
  const pending = applications.data.filter(
    (a) => a.status === "Shortlisted" && !a.assignedHrId,
  );
  return (
    <Panel
      title="HR workload and pending assignments"
      description="Candidates are allocated to available HRs who have accepted the job, with the lowest active workload first."
    >
      <ErrorBox message={people.error || applications.error} />
      <div className="panel-form">
        <p>
          <strong>{pending.length}</strong> shortlisted candidates waiting for
          an HR ·{" "}
          <strong>
            {
              people.data.filter(
                (p) =>
                  p.availability === "available" && p.remainingCapacity > 0,
              ).length
            }
          </strong>{" "}
          HRs with capacity
        </p>
        {people.loading ? (
          <Loading />
        ) : people.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>HR interviewer</th>
                  <th>Availability</th>
                  <th>Active candidates</th>
                  <th>Capacity</th>
                  <th>Accepted jobs</th>
                </tr>
              </thead>
              <tbody>
                {people.data.map((p) => (
                  <tr key={p.hrId}>
                    <td>
                      {p.name}
                      <small className="muted">
                        {p.availabilityNote ? ` · ${p.availabilityNote}` : ""}
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          p.availability === "available" ? "green" : "amber"
                        }
                      >
                        {p.availability}
                      </Badge>
                    </td>
                    <td>{p.activeCandidates}</td>
                    <td>{p.capacity}</td>
                    <td>{p.acceptedJobs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No HR interviewers yet"
            detail="Invite HR accounts to your company, then send them the relevant job assignments."
            action={
              <Link className="text-link" to="/team">
                Open hiring team
              </Link>
            }
          />
        )}
        {!!pending.length && (
          <div>
            <h3>Waiting for assignment</h3>
            {pending.slice(0, 10).map((a) => (
              <p key={a._id}>
                <Link className="text-link" to={`/jobs/${a.jobId}`}>
                  {a.candidateName} · {a.jobTitle}
                </Link>
              </p>
            ))}
            <p className="muted">
              Open the job to invite HRs, review availability or retry
              distribution.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
