import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { Job, Application, Interview, User } from "../shared/types";
import { useAuth } from "./auth-context";
import { send, useResource, dateLabel } from "./api";
import {
  PageTitle,
  Panel,
  Field,
  Submit,
  ErrorBox,
  Loading,
  Empty,
  Status,
  Notice,
  Badge,
} from "./ui";
import { JobEditor } from "./workflows";
import { InterviewInstructions } from "./InterviewInstructions";
import { InterviewBatches } from "./InterviewBatches";

interface JobDetails {
  job: Job;
  applications: Application[];
  interviews: Interview[];
  recruitmentStatus: string;
  counts: {
    applications: number;
    shortlisted: number;
    distributed: number;
    pendingAssignments: number;
    accepted: number;
    pending: number;
    completed: number;
    active: number;
  };
}
export function JobDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const data = useResource<JobDetails | null>(`/jobs/${id}`, null);
  const [editing, setEditing] = useState(false);
  if (data.loading) return <Loading />;
  if (!data.data) return <ErrorBox message={data.error || "Job not found."} />;
  const { job, counts, applications, interviews, recruitmentStatus } =
    data.data;
  return (
    <>
      <PageTitle
        eyebrow={job.companyName}
        title={job.title}
        description={`${job.department || job.role || job.employment} · ${job.location} · ${job.workMode || ""}`}
        action={
          user.role === "company" && (
            <button className="btn secondary" onClick={() => setEditing(true)}>
              Edit job
            </button>
          )
        }
      />
      <ErrorBox message={data.error} />
      <div className="detail-meta">
        <Status value={job.status} />
        <Badge tone="green">{recruitmentStatus}</Badge>
      </div>
      <Panel title="Job description">
        <div className="panel-form">
          <p className="prose-text">{job.description}</p>
          <h3>Requirements</h3>
          <div className="tag-list">
            {job.skills.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
          <dl className="job-facts">
            <div>
              <dt>Difficulty</dt>
              <dd>{job.difficulty || "Intermediate"}</dd>
            </div>
            <div>
              <dt>Experience</dt>
              <dd>{job.experience || "Not specified"}</dd>
            </div>
            <div>
              <dt>Education</dt>
              <dd>{job.education || "Not specified"}</dd>
            </div>
            <div>
              <dt>Preferred skills</dt>
              <dd>{job.preferredSkills?.join(", ") || "Not specified"}</dd>
            </div>
            <div>
              <dt>Openings</dt>
              <dd>{job.openings || 1}</dd>
            </div>
            <div>
              <dt>Application deadline</dt>
              <dd>{job.deadline ? dateLabel(job.deadline) : "No deadline"}</dd>
            </div>
            <div>
              <dt>Annual salary</dt>
              <dd>
                {job.salaryMin != null || job.salaryMax != null
                  ? `${job.salaryCurrency} ${job.salaryMin?.toLocaleString() ?? "—"} – ${job.salaryMax?.toLocaleString() ?? "—"}`
                  : "Not specified"}
              </dd>
            </div>
          </dl>
          <p className="prose-text">{job.additionalRequirements}</p>
          <InterviewInstructions job={job} />
        </div>
      </Panel>
      <Panel
        title={
          user.role === "company"
            ? "Recruitment progress"
            : "My assigned candidates"
        }
      >
        <div className="panel-form">
          <div className="workload-stats">
            <span>
              <strong>{counts.applications}</strong>
              Applications
            </span>
            <span>
              <strong>{counts.shortlisted}</strong>Shortlisted (all stages)
            </span>
            <span>
              <strong>{counts.distributed}</strong>Candidates distributed
            </span>
            <span>
              <strong>{counts.pendingAssignments}</strong>Waiting for an
              interviewer
            </span>
            {user.role === "company" && (
              <span>
                <strong>
                  {counts.accepted} / {job.requiredHrCount}
                </strong>
                HRs accepted / requested target
              </span>
            )}
            <span>
              <strong>{counts.active}</strong>Scheduled / in progress
            </span>
            <span>
              <strong>{counts.completed}</strong>Interviews completed
            </span>
          </div>
          <div className="form-actions">
            {(user.role === "company" ||
              job.hrRequests.some(
                (r) => r.hrId === user._id && r.status === "accepted",
              )) && (
              <Link className="btn secondary" to={`/applications?jobId=${id}`}>
                {user.role === "company"
                  ? "View all applications"
                  : "Review candidates & schedule interviews"}
              </Link>
            )}
            {user.role === "company" && (
              <Link
                className="btn secondary"
                to={`/applications?jobId=${id}&status=Shortlisted`}
              >
                View shortlisted candidates
              </Link>
            )}
            <Link className="text-link" to="/reports">
              View results / feedback
            </Link>
          </div>
        </div>
      </Panel>
      {user.role === "company" ? (
        <CompanyDistribution
          key={job._id}
          details={data.data}
          reload={data.reload}
        />
      ) : (
        <Panel title="My assigned applicants for this job">
          {applications.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Status</th>
                    <th>Interview</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a._id}>
                      <td>{a.candidateName}</td>
                      <td>
                        <Status
                          value={
                            a.status === "Shortlisted" && a.assignedHrId
                              ? "Assigned to HR"
                              : a.status
                          }
                        />
                      </td>
                      <td>
                        {interviews.find((i) => i.applicationId === a._id)
                          ?.status || "Not scheduled"}
                      </td>
                      <td>
                        <Link
                          className="text-link"
                          to={`/applications?jobId=${id}&applicationId=${a._id}`}
                        >
                          Review & schedule
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No candidates distributed yet"
              detail="Accept this job from My assignments and set your availability to Available. Shortlisted candidates are assigned automatically when capacity is available."
            />
          )}
        </Panel>
      )}
      {(user.role === "company" ||
        job.hrRequests.some(
          (r) => r.hrId === user._id && r.status === "accepted",
        )) && (
        <InterviewBatches
          job={job}
          applications={applications}
          reload={data.reload}
        />
      )}
      {editing && (
        <JobEditor
          job={job}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void data.reload();
          }}
        />
      )}
    </>
  );
}

function CompanyDistribution({
  details,
  reload,
}: {
  details: JobDetails;
  reload: () => Promise<void>;
}) {
  const { job, applications, interviews } = details;
  const people = useResource<User[]>("/company/interviewers", []);
  const workloads = useResource<
    {
      hrId: string;
      activeCandidates: number;
      capacity: number;
      availability: string;
    }[]
  >("/hr/workloads", []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [selectedHrs, setSelectedHrs] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const accepted = job.hrRequests.filter((r) => r.status === "accepted");
  const shortlisted = applications.filter(
    (a) =>
      [
        "Shortlisted",
        "Interview Scheduled",
        "Interview Completed",
        "Selected",
      ].includes(a.status) || a.assignedHrId,
  );
  async function save(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      await reload();
      await workloads.reload();
      setSuccess(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function count(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const count = Number(new FormData(e.currentTarget).get("requiredHrCount"));
    void save(
      () =>
        send(`/jobs/${job._id}/hr-count`, { requiredHrCount: count }, "PATCH"),
      "Required HR count saved.",
    );
  }
  return (
    <>
      <ErrorBox message={error || people.error || workloads.error} />
      {success && (
        <div role="status" className="notice success">
          {success}
        </div>
      )}
      <Panel
        title="HR requests"
        description="Choose interviewers responsible for this job and send invitations. As each available HR accepts, shortlisted candidates are assigned automatically by workload. Other pending invitations do not block interviews."
      >
        <div className="panel-form">
          <form onSubmit={count}>
            <div className="form-grid">
              <Field label="Target number of HR interviewers">
                <input
                  key={job.requiredHrCount}
                  name="requiredHrCount"
                  type="number"
                  required
                  min={1}
                  max={100}
                  defaultValue={job.requiredHrCount}
                />
              </Field>
              <div className="form-actions">
                <Submit busy={busy}>Save HR count</Submit>
              </div>
            </div>
          </form>
          <p>
            {job.hrRequests.filter((r) => r.status === "pending").length}{" "}
            pending · {accepted.length} accepted ·{" "}
            {job.hrRequests.filter((r) => r.status === "declined").length}{" "}
            rejected
          </p>
          {people.loading ? (
            <Loading />
          ) : people.data.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>HR</th>
                    <th>Skills / experience</th>
                    <th>Availability</th>
                    <th>Request</th>
                    <th>This job / total workload</th>
                  </tr>
                </thead>
                <tbody>
                  {people.data.map((p) => {
                    const request = job.hrRequests.find(
                      (r) => r.hrId === p._id,
                    );
                    const disabled =
                      busy ||
                      p.profile.availability === "unavailable" ||
                      (!!request && request.status !== "declined");
                    return (
                      <tr key={p._id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Request ${p.name}`}
                            disabled={disabled}
                            checked={selectedHrs.includes(p._id)}
                            onChange={(e) =>
                              setSelectedHrs(
                                e.target.checked
                                  ? [...selectedHrs, p._id]
                                  : selectedHrs.filter((id) => id !== p._id),
                              )
                            }
                          />
                        </td>
                        <td>{p.name}</td>
                        <td>
                          {p.profile.skills.join(", ") ||
                            p.profile.expertise ||
                            "Not provided"}
                          <small className="muted">
                            {p.profile.experience}
                          </small>
                        </td>
                        <td>
                          <Status
                            value={p.profile.availability || "available"}
                          />
                        </td>
                        <td>
                          <Status
                            value={
                              request?.status === "declined"
                                ? "rejected"
                                : request?.status || "Not requested"
                            }
                          />
                        </td>
                        <td>
                          {
                            applications.filter((a) => a.assignedHrId === p._id)
                              .length
                          }{" "}
                          on this job
                          <small className="muted">
                            {workloads.data.find((h) => h.hrId === p._id)
                              ?.activeCandidates ?? "—"}{" "}
                            /{" "}
                            {workloads.data.find((h) => h.hrId === p._id)
                              ?.capacity ??
                              p.profile.interviewCapacity ??
                              20}{" "}
                            active candidates across jobs
                          </small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No HR members yet"
              detail="Invite HRs to your company through the existing team invitations."
              action={
                <Link to="/team" className="btn secondary">
                  Manage team
                </Link>
              }
            />
          )}
          <div className="form-actions">
            <button
              className="btn primary"
              disabled={busy || !selectedHrs.length}
              onClick={() =>
                void save(async () => {
                  await send(`/jobs/${job._id}/hr-requests`, {
                    hrIds: selectedHrs,
                  });
                  setSelectedHrs([]);
                }, "HR requests sent. Waiting for their responses.")
              }
            >
              Send requests ({selectedHrs.length})
            </button>
          </div>
        </div>
      </Panel>
      <Panel
        title="Automatic interviewer assignment"
        description="Available HRs who accepted this job receive candidates automatically, prioritising the lowest current workload across jobs and respecting capacity. Existing interviews stay with their interviewer. Manual reassignment is available before scheduling."
      >
        <div className="panel-form">
          {!accepted.length && (
            <Notice>
              No HR has accepted yet. Shortlisted candidates stay in the pending
              queue. Send invitations above; allocation starts as soon as an
              available interviewer accepts.
            </Notice>
          )}
          {shortlisted.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Application</th>
                    <th>Assigned HR</th>
                    <th>Interview</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlisted.map((a) => {
                    const interview = interviews.find(
                      (i) => i.applicationId === a._id,
                    );
                    const editable =
                      a.status === "Shortlisted" ||
                      (!a.assignedHrId &&
                        a.status === "Interview Scheduled" &&
                        interview?.status === "scheduled");
                    return (
                      <tr key={a._id}>
                        <td>
                          <Link
                            className="text-link"
                            to={`/applications?jobId=${job._id}&applicationId=${a._id}`}
                          >
                            {a.candidateName}
                          </Link>
                        </td>
                        <td>
                          <Status
                            value={
                              a.assignedHrId && a.status === "Shortlisted"
                                ? "Assigned to HR"
                                : a.status
                            }
                          />
                          {!a.assignedHrId && a.status === "Shortlisted" && (
                            <small className="muted">
                              {a.assignmentPendingReason ||
                                "Pending interviewer assignment"}
                            </small>
                          )}
                        </td>
                        <td>
                          {editable ? (
                            <select
                              aria-label={`Assign ${a.candidateName}`}
                              disabled={busy}
                              value={choices[a._id] ?? a.assignedHrId ?? ""}
                              onChange={(e) =>
                                setChoices({
                                  ...choices,
                                  [a._id]: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                Pending automatic assignment
                              </option>
                              {accepted
                                .filter(
                                  (r) =>
                                    !interview ||
                                    r.hrId === interview.interviewerId,
                                )
                                .map((r) => (
                                  <option
                                    key={r.hrId}
                                    value={r.hrId}
                                    disabled={
                                      r.hrId !== a.assignedHrId &&
                                      people.data.find((p) => p._id === r.hrId)
                                        ?.profile.availability !== "available"
                                    }
                                  >
                                    {people.data.find((p) => p._id === r.hrId)
                                      ?.name || "HR member"}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            people.data.find((p) => p._id === a.assignedHrId)
                              ?.name || "Not assigned"
                          )}
                        </td>
                        <td>
                          {interview ? (
                            <>
                              <Status value={interview.status} />
                              <p>{dateLabel(interview.scheduledAt)}</p>
                            </>
                          ) : (
                            "Not scheduled"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No shortlisted candidates"
              detail="AI shortlists candidates after screening. Check Applications for screening progress and results."
            />
          )}
          <div className="form-actions">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                void save(
                  () => send(`/jobs/${job._id}/auto-distribution`, {}),
                  "Assignment check completed. Candidates without available capacity remain in the pending queue.",
                )
              }
            >
              Retry pending assignments
            </button>
            <button
              className="btn primary"
              disabled={busy || !Object.keys(choices).length}
              onClick={() =>
                void save(async () => {
                  const assignments = Object.entries(choices)
                    .filter(
                      ([id, value]) =>
                        value !==
                        (applications.find((a) => a._id === id)?.assignedHrId ||
                          ""),
                    )
                    .map(([applicationId, hrId]) => ({
                      applicationId,
                      hrId: hrId || null,
                      expectedHrId:
                        applications.find((a) => a._id === applicationId)
                          ?.assignedHrId || null,
                    }));
                  if (assignments.length)
                    await send(
                      `/jobs/${job._id}/distribution`,
                      { assignments },
                      "PATCH",
                    );
                  setChoices({});
                }, "Candidate distribution saved. The affected HRs have been notified.")
              }
            >
              Save manual reassignments
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}
