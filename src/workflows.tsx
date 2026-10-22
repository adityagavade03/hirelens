import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  MapPin,
  ArrowUpRight,
  BriefcaseBusiness,
  Clock,
  Check,
  Code2,
  Sparkles,
  Video,
  FileText,
  CalendarDays,
  ArrowRight,
  Layers,
  MessagesSquare,
} from "lucide-react";
import type {
  Job,
  Application,
  Interview,
  User,
  Problem,
} from "../shared/types";
import { useAuth } from "./auth-context";
import { wallTime, zonedTimeToUtc } from "../shared/time";
import { api, send, useResource, csv, dateLabel } from "./api";
import {
  PageTitle,
  Panel,
  Modal,
  Field,
  Submit,
  ErrorBox,
  Empty,
  Loading,
  Badge,
  Status,
  Avatar,
  Notice,
  formObject,
} from "./ui";

import { InterviewRounds } from "./InterviewRounds";
import { InterviewInstructions } from "./InterviewInstructions";
import { ResumeScreening, ScreeningScore } from "./ResumeScreening";
import { ApplicationForm } from "./ApplicationForm";

export function JobsPage({ create = false }: { create?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const jobs = useResource<Job[]>("/jobs", []);
  const applications = useResource<Application[]>("/applications", []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Job | true | null>(
    create ? true : null,
  );
  useEffect(() => {
    if (create) setEditing(true);
  }, [create]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [applying, setApplying] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All jobs");
  const [success, setSuccess] = useState("");
  const filtered = jobs.data
    .filter((j) =>
      `${j.title} ${j.companyName} ${j.skills.join(" ")} ${j.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter((j) => filter === "All jobs" || j.status === filter);
  return (
    <>
      <PageTitle
        eyebrow="FIND THE RIGHT FIT"
        title={
          user.role === "candidate"
            ? "A world of possibilities."
            : "Make space for great talent."
        }
        description={
          user.role === "candidate"
            ? "Explore roles that bring out your best. Your next chapter starts here."
            : "Create opportunities, define the skills, and find your next team member."
        }
        action={
          user.role === "company" && (
            <button className="btn primary" onClick={() => setEditing(true)}>
              <Plus size={17} />
              Create a job
            </button>
          )
        }
      />
      <ErrorBox message={jobs.error || error} />
      {success && (
        <div className="notice success" role="status">
          <Check size={18} />
          {success}
        </div>
      )}
      {applying && (
        <ApplicationForm
          job={applying}
          user={user}
          onClose={() => setApplying(null)}
          onSubmitted={() => {
            setApplying(null);
            void applications.reload();
            setSuccess(
              "Application submitted. AI screening is queued for your selected resume and reviewed details. Track your match score, assigned HR and interview schedule in Applications.",
            );
          }}
        />
      )}
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Filter jobs by status">
          {(user.role === "candidate"
            ? ["All jobs"]
            : ["All jobs", "published", "draft", "closed"]
          ).map((f) => (
            <button
              type="button"
              className={filter === f ? "active" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              key={f}
            >
              {f === "published"
                ? "Published"
                : f === "draft"
                  ? "Drafts"
                  : f === "closed"
                    ? "Closed"
                    : f}
              <span>
                {f === "All jobs"
                  ? jobs.data.length
                  : jobs.data.filter((j) => j.status === f).length}
              </span>
            </button>
          ))}
        </div>
        <div className="search-input">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles, skills, or location"
            aria-label="Search jobs"
          />
        </div>
      </div>
      {jobs.loading ? (
        <Loading />
      ) : (
        <div className="job-grid">
          {filtered.map((j) => (
            <article className="job-card" key={j._id}>
              <div className="job-card-top">
                <span className="company-monogram">{j.companyName?.[0]}</span>
                <div>
                  <strong>{j.companyName}</strong>
                  <small>
                    {j.sample
                      ? "Sample opportunity"
                      : dateLabel(j.createdAt, {
                          month: "short",
                          day: "numeric",
                        })}
                  </small>
                </div>
                <Status value={j.status} />
              </div>
              <h2>{j.title}</h2>
              <div className="job-meta">
                <span>
                  <MapPin size={14} />
                  {j.location}
                </span>
                <span>
                  <BriefcaseBusiness size={14} />
                  {j.employment}
                </span>
              </div>
              <p className="job-description">{j.description}</p>
              <div className="tag-list">
                {j.skills.slice(0, 5).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <div className="job-card-bottom">
                <span>{j.experience || "All experience levels"}</span>
                <button
                  className="text-link"
                  onClick={() => {
                    setSelected(j);
                    setError("");
                  }}
                >
                  View role <ArrowUpRight size={17} />
                </button>
              </div>
              {user.role !== "candidate" && (
                <div className="job-management-links">
                  <Link
                    className="text-link"
                    to={`/applications?jobId=${j._id}`}
                  >
                    {applications.data.filter((a) => a.jobId === j._id).length}{" "}
                    applications <ArrowUpRight size={14} />
                  </Link>
                  {user.role === "company" && (
                    <Link className="text-link" to={`/jobs/${j._id}`}>
                      Job details & HR requests
                    </Link>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!jobs.loading && !filtered.length && (
        <Empty
          title="A little space for something new"
          detail={
            user.role === "company"
              ? "Create your first job to start building a candidate pipeline."
              : "No matching jobs yet. Try a different search."
          }
        />
      )}{" "}
      {editing && (
        <JobEditor
          job={editing === true ? undefined : editing}
          onClose={() => {
            setEditing(null);
            if (create) navigate("/jobs");
          }}
          onSaved={() => {
            setEditing(null);
            void jobs.reload();
            setSuccess("Job saved successfully.");
            if (create) navigate("/jobs");
          }}
        />
      )}
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)} wide>
          <div className="detail-meta">
            <Badge tone="green">{selected.companyName}</Badge>
            <Badge>{selected.location}</Badge>
            <Badge>{selected.employment}</Badge>
            {selected.sample && <Badge tone="amber">Sample data</Badge>}
          </div>
          <h3>About the opportunity</h3>
          <p className="prose-text">{selected.description}</p>
          <h3>Skills we’re looking for</h3>
          <div className="tag-list">
            {selected.skills.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
          <h3>Experience</h3>
          <p>{selected.experience || "Open to all experience levels."}</p>
          <div className="job-facts">
            {[
              ["Job role", selected.role],
              ["Department", selected.department],
              ["Work mode", selected.workMode],
              ["Education", selected.education],
              ["Openings", selected.openings],
              [
                "Application deadline",
                selected.deadline
                  ? dateLabel(selected.deadline)
                  : "No deadline",
              ],
              [
                "Annual salary",
                selected.salaryMin != null || selected.salaryMax != null
                  ? `${selected.salaryCurrency || "INR"} ${selected.salaryMin?.toLocaleString() ?? "—"} – ${selected.salaryMax?.toLocaleString() ?? "—"}`
                  : "Not specified",
              ],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <p>{value}</p>
                </div>
              ))}
          </div>
          {!!selected.preferredSkills?.length && (
            <>
              <h3>Preferred skills</h3>
              <div className="tag-list">
                {selected.preferredSkills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </>
          )}
          {!!selected.rounds?.length && (
            <>
              <h3>Interview rounds</h3>
              <ol className="round-list">
                {selected.rounds.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </>
          )}
          {selected.additionalRequirements && (
            <>
              <h3>Additional requirements</h3>
              <p className="prose-text">{selected.additionalRequirements}</p>
            </>
          )}
          <h3>Interview criteria</h3>
          <p className="prose-text">
            {selected.criteria ||
              "The hiring team will share interview instructions."}
          </p>
          {user.role !== "candidate" && (
            <Link className="btn secondary" to={`/jobs/${selected._id}`}>
              Job details & instructions
            </Link>
          )}
          <ErrorBox message={error} />
          <div className="form-actions">
            {user.role === "candidate" ? (
              applications.data.some((a) => a.jobId === selected._id) ? (
                <Badge tone="green">
                  <Check size={14} /> Application submitted
                </Badge>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => {
                    setApplying(selected);
                    setSelected(null);
                  }}
                >
                  Apply now
                  <ArrowRight size={17} />
                </button>
              )
            ) : (
              user.role === "company" && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setEditing(selected);
                    setSelected(null);
                  }}
                >
                  Edit this job
                </button>
              )
            )}
          </div>
          {user.role === "candidate" && (
            <small className="muted">
              Review your application details and choose a PDF on the next step.
              AI compares that submission with this JD. Candidates whose
              validated score meets the {selected.shortlistThreshold ?? 80}%
              match threshold are automatically shortlisted. Your submission is
              preserved. Confirmed skill gaps lower the score; uncertain evidence
              needs review.
            </small>
          )}
        </Modal>
      )}
    </>
  );
}
export function JobEditor({
  job,
  onClose,
  onSaved,
}: {
  job?: Job;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e);
    if (
      values.status !== (job?.status || "draft") &&
      ["published", "closed", "draft"].includes(String(values.status)) &&
      !window.confirm(
        values.status === "published"
          ? "Publish this job so candidates can apply?"
          : values.status === "closed"
            ? "Close this job to new applications? Existing applications will be preserved."
            : "Unpublish this job and return it to draft? Existing applications will be preserved.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await send(
        job ? `/jobs/${job._id}` : "/jobs",
        {
          ...values,
          shortlistThreshold: Number(values.shortlistThreshold),
          criteria: String(values.hrCriteria || ""),
          skills: csv(String(values.skills)),
          preferredSkills: csv(String(values.preferredSkills || "")),
          rounds: csv(String(values.rounds || "")),
          interviewInstructions: {
            type: values.interviewType,
            skills: csv(String(values.evaluateSkills || "")),
            topics: csv(String(values.focusTopics || "")),
            criteria: values.hrCriteria,
            duration: Number(values.interviewDuration),
            special: values.specialInstructions,
          },
          openings: Number(values.openings),
          salaryMin: values.salaryMin ? Number(values.salaryMin) : null,
          salaryMax: values.salaryMax ? Number(values.salaryMax) : null,
          deadline: values.deadline
            ? zonedTimeToUtc(
                String(values.deadline),
                Intl.DateTimeFormat().resolvedOptions().timeZone,
              )
            : null,
        },
        job ? "PATCH" : "POST",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={job ? "Edit opportunity" : "Create an opportunity"}
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <ErrorBox message={error} />
        <Field label="Job title">
          <input
            name="title"
            defaultValue={job?.title}
            required
            minLength={3}
            placeholder="e.g. Frontend Engineer"
          />
        </Field>
        <div className="form-grid">
          <Field label="Job role">
            <input
              name="role"
              defaultValue={job?.role}
              maxLength={150}
              placeholder="e.g. Software engineering"
            />
          </Field>
          <Field label="Department">
            <input
              name="department"
              defaultValue={job?.department}
              maxLength={100}
              placeholder="e.g. Product & engineering"
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Location">
            <input
              name="location"
              defaultValue={job?.location || "Remote"}
              required
            />
          </Field>
          <Field label="Employment">
            <select
              name="employment"
              defaultValue={job?.employment || "Full-time"}
            >
              {["Full-time", "Part-time", "Internship", "Contract"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Job description">
          <textarea
            name="description"
            defaultValue={job?.description}
            required
            minLength={20}
            rows={5}
            placeholder="Describe the role, responsibilities, and team."
          />
        </Field>
        <Field
          label="Required skills"
          hint="Separate the job's main skills with commas. AI weighs each skill, including equivalent technologies. Missing skills lower the overall score rather than automatically blocking a shortlist."
        >
          <input
            name="skills"
            defaultValue={job?.skills.join(", ")}
            required
            placeholder="React, TypeScript, Node.js"
          />
        </Field>
        <Field label="Experience">
          <input
            name="experience"
            defaultValue={job?.experience || ""}
            placeholder="e.g. 0–2 years, or equivalent project experience"
          />
        </Field>
        <Field label="Interview difficulty">
          <select
            name="difficulty"
            defaultValue={job?.difficulty || "Intermediate"}
          >
            {["Beginner", "Intermediate", "Advanced"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Preferred skills"
          hint="Separate optional skills with commas."
        >
          <input
            name="preferredSkills"
            defaultValue={job?.preferredSkills?.join(", ")}
          />
        </Field>
        <Field label="Education requirements">
          <textarea
            name="education"
            rows={2}
            maxLength={2000}
            defaultValue={job?.education}
          />
        </Field>
        <div className="screening-banner">
          <h3>Automatic AI shortlisting</h3>
          <p>
            Every new application is screened against this JD. Candidates are
            shortlisted automatically when their validated match score meets the
            threshold below, even if some required skills are missing. Gaps stay
            visible for HR review. Uncertain or conflicting evidence needs review
            before automatic shortlisting.
          </p>
          <Field
            label="Minimum AI match score (%)"
            hint="Default: 80%. New applications use this threshold; existing screening results keep their original criteria."
          >
            <input
              name="shortlistThreshold"
              type="number"
              required
              min={1}
              max={100}
              step={1}
              defaultValue={job?.shortlistThreshold ?? 80}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Work mode">
            <select name="workMode" defaultValue={job?.workMode || "Remote"}>
              {["Remote", "Hybrid", "On-site"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Number of openings">
            <input
              name="openings"
              type="number"
              required
              min={1}
              max={10000}
              defaultValue={job?.openings || 1}
            />
          </Field>
        </div>
        <div className="salary-fields">
          <Field label="Minimum annual salary">
            <input
              name="salaryMin"
              type="number"
              min={0}
              step="0.01"
              defaultValue={job?.salaryMin ?? ""}
            />
          </Field>
          <Field label="Maximum annual salary">
            <input
              name="salaryMax"
              type="number"
              min={0}
              step="0.01"
              defaultValue={job?.salaryMax ?? ""}
            />
          </Field>
          <Field label="Currency">
            <input
              name="salaryCurrency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue={job?.salaryCurrency || "INR"}
            />
          </Field>
        </div>
        <Field
          label="Application deadline"
          hint={`Optional · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
        >
          <input
            name="deadline"
            type="datetime-local"
            defaultValue={
              job?.deadline
                ? wallTime(
                    new Date(job.deadline),
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                  )
                : ""
            }
          />
        </Field>
        <Field
          label="Required interview rounds"
          hint="Separate rounds with commas, in order."
        >
          <input
            name="rounds"
            defaultValue={job?.rounds?.join(", ")}
            placeholder="HR conversation, Technical interview, Final discussion"
          />
        </Field>
        <div className="form-grid">
          <Field label="Status">
            <select name="status" defaultValue={job?.status || "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
        </div>
        <h3>Interview instructions for HR</h3>
        <div className="form-grid">
          <Field label="Interview type">
            <select
              name="interviewType"
              defaultValue={job?.interviewInstructions?.type || "technical"}
            >
              <option value="technical">Technical</option>
              <option value="behavioral">Behavioral</option>
            </select>
          </Field>
          <Field label="Expected duration (minutes)">
            <input
              name="interviewDuration"
              type="number"
              min={10}
              max={180}
              required
              defaultValue={job?.interviewInstructions?.duration || 45}
            />
          </Field>
        </div>
        <Field label="Skills to evaluate" hint="Separate skills with commas.">
          <input
            name="evaluateSkills"
            defaultValue={
              job?.interviewInstructions?.skills?.join(", ") ||
              job?.skills.join(", ")
            }
          />
        </Field>
        <Field label="Topics to focus on" hint="Separate topics with commas.">
          <input
            name="focusTopics"
            defaultValue={job?.interviewInstructions?.topics?.join(", ")}
          />
        </Field>
        <Field label="Questions and criteria for HR">
          <textarea
            name="hrCriteria"
            rows={3}
            maxLength={4000}
            defaultValue={job?.interviewInstructions?.criteria || job?.criteria}
          />
        </Field>
        <Field label="Special instructions for HR">
          <textarea
            name="specialInstructions"
            rows={3}
            maxLength={6000}
            defaultValue={job?.interviewInstructions?.special}
          />
        </Field>
        <Field label="Additional requirements">
          <textarea
            name="additionalRequirements"
            rows={2}
            maxLength={4000}
            defaultValue={job?.additionalRequirements}
          />
        </Field>
        <div className="form-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <Submit busy={busy}>Save opportunity</Submit>
        </div>
      </form>
    </Modal>
  );
}
export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const records = useResource<Application[]>("/applications", []);
  const [selected, setSelected] = useState<Application | null>(null);
  useEffect(() => {
    const id = params.get("applicationId");
    if (id) setSelected(records.data.find((a) => a._id === id) || null);
    else
      setSelected((previous) =>
        previous
          ? records.data.find((a) => a._id === previous._id) || previous
          : null,
      );
  }, [params, records.data]);
  useEffect(() => {
    if (
      !records.data.some(
        (a) =>
          a.screening && ["queued", "processing"].includes(a.screening.state),
      )
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden) void records.reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [records.data, records.reload]);
  const [schedule, setSchedule] = useState<Application | null>(null);
  const [search, setSearch] = useState("");
  const status = params.get("status") || "All stages";
  const [minimumMatch, setMinimumMatch] = useState(0);
  const jobs = useResource<Job[]>("/jobs", []);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = records.data
    .filter(
      (a) =>
        minimumMatch === 0 ||
        (a.match?.score != null && a.match.score >= minimumMatch),
    )
    .filter((a) => !params.get("jobId") || a.jobId === params.get("jobId"))
    .filter((a) =>
      `${a.candidateName} ${a.jobTitle} ${a.companyName} ${a.snapshot.skills.join(" ")} ${a.snapshot.experience} ${a.snapshot.education}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (a) =>
        status === "All stages" ||
        (status === "Assigned to HR" ? !!a.assignedHrId : a.status === status),
    );
  async function change(a: Application, status: string) {
    if (
      status === "Rejected" &&
      !window.confirm(
        `Reject ${a.candidateName}’s application for ${a.jobTitle}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const updated = await send<Application>(
        `/applications/${a._id}/status`,
        { status },
        "PATCH",
      );
      setSelected(updated);
      await records.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE & POSSIBILITIES"
        title={
          user.role === "candidate"
            ? "Your next chapter, in motion."
            : "Meet your future team."
        }
        description={
          user.role === "candidate"
            ? "Track automatic AI screening, shortlist results and interview updates."
            : "AI screens each resume against the JD and automatically shortlists matching candidates. Review the evidence and arrange interviews."
        }
      />
      <div className="toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search applications"
            placeholder="Search people or roles"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Field
          label="Filter by match score"
          hint="This filters the list; it does not change the job’s shortlist threshold."
        >
          <input
            type="number"
            min={0}
            max={100}
            value={minimumMatch}
            onChange={(e) =>
              setMinimumMatch(
                Math.max(0, Math.min(100, Number(e.target.value))),
              )
            }
          />
        </Field>
        <select
          aria-label="Filter applications by job"
          value={params.get("jobId") || ""}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            e.target.value
              ? next.set("jobId", e.target.value)
              : next.delete("jobId");
            setParams(next);
          }}
        >
          <option value="">All jobs</option>
          {[
            ...new Map([
              ...jobs.data.map((j) => [j._id, j.title] as const),
              ...records.data.map((a) => [a.jobId, a.jobTitle] as const),
            ]).entries(),
          ].map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter application status"
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set("status", e.target.value);
            setParams(next);
          }}
        >
          {[
            "All stages",
            "Applied",
            "Under Review",
            "Shortlisted",
            "Assigned to HR",
            "Interview Scheduled",
            "Interview Completed",
            "Selected",
            "Rejected",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorBox message={records.error || error} />
      <Panel>
        {records.loading ? (
          <Loading />
        ) : filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{user.role === "candidate" ? "Company" : "Candidate"}</th>
                  <th>Opportunity</th>
                  <th>AI screening</th>
                  <th>Stage</th>
                  <th>Applied</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a._id}>
                    <td>
                      <div className="person-cell">
                        <Avatar
                          name={
                            user.role === "candidate"
                              ? a.companyName
                              : a.candidateName
                          }
                        />
                        <div>
                          <strong>
                            {user.role === "candidate"
                              ? a.companyName
                              : a.candidateName}
                          </strong>
                          {a.sample && (
                            <small className="muted">Sample applicant</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{a.jobTitle}</td>
                    <td>
                      <ScreeningScore application={a} />
                    </td>
                    <td>
                      <Status
                        value={
                          a.assignedHrId && a.status === "Shortlisted"
                            ? "Assigned to HR"
                            : a.status
                        }
                      />
                      {(a.assignedHrName || a.assignmentPendingReason) && (
                        <small className="application-stage-detail muted">
                          {a.assignedHrName
                            ? `HR: ${a.assignedHrName}`
                            : `Awaiting HR assignment: ${a.assignmentPendingReason}`}
                        </small>
                      )}
                    </td>
                    <td className="muted">
                      {dateLabel(a.createdAt, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>
                      <button
                        className="text-link"
                        onClick={() => {
                          setSelected(a);
                          setError("");
                        }}
                      >
                        Review
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="The next opportunity is out there"
            detail={
              user.role === "candidate"
                ? "Browse jobs and send your first application."
                : "Applications will appear when candidates apply to your published jobs."
            }
            action={
              <Link to="/jobs" className="btn secondary">
                Explore jobs
                <ArrowRight size={16} />
              </Link>
            }
          />
        )}
      </Panel>
      {selected && (
        <Modal
          title={
            user.role === "candidate"
              ? selected.jobTitle
              : selected.candidateName
          }
          onClose={() => setSelected(null)}
          wide
        >
          <div className="detail-meta">
            <Badge>{selected.jobTitle}</Badge>
            <Status value={selected.status} />
            <a
              className="text-link"
              href={`/api/resumes/${selected.resumeId}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={15} />
              Submitted resume
            </a>
          </div>
          <ResumeScreening
            application={selected}
            busy={busy}
            retry={async () => {
              setBusy(true);
              setError("");
              try {
                const updated = await send<Application>(
                  `/applications/${selected._id}/screening/retry`,
                );
                setSelected(updated);
                await records.reload();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          {selected.status === "Shortlisted" && (
            <Notice>
              {selected.assignedHrName
                ? user.role === "candidate"
                  ? `${selected.assignedHrName} is assigned to your application. Your interview schedule will appear below once arranged.`
                  : `${selected.assignedHrName} is assigned to interview ${selected.candidateName}. The interview schedule will appear below once arranged.`
                : selected.assignmentPendingReason ||
                  (user.role === "candidate"
                    ? "Your application is shortlisted. The company is arranging an available HR interviewer."
                    : `${selected.candidateName} is shortlisted and awaiting an available HR interviewer.`)}
            </Notice>
          )}
          <ErrorBox message={error} />
          {user.role !== "candidate" &&
            (user.role === "company" ||
              !selected.assignedHrId ||
              selected.assignedHrId === user._id) && (
              <div className="form-actions">
                {["Applied", "Under Review"].includes(selected.status) &&
                  (user.role === "company" ||
                    selected.assignedHrId === user._id) && (
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() => change(selected, "Shortlisted")}
                    >
                      Shortlist after review
                    </button>
                  )}
                {selected.status === "Rejected" &&
                  selected.screening?.outcome === "not_shortlisted" &&
                  (user.role === "company" ||
                    selected.assignedHrId === user._id) && (
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => change(selected, "Under Review")}
                    >
                      Reopen for review
                    </button>
                  )}
                {["Applied", "Under Review", "Shortlisted"].includes(
                  selected.status,
                ) && (
                  <button
                    disabled={busy}
                    className="btn danger-outline"
                    onClick={() => change(selected, "Rejected")}
                  >
                    Reject application
                  </button>
                )}
                {selected.status === "Shortlisted" && (
                  <>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => change(selected, "Under Review")}
                    >
                      Remove from shortlist
                    </button>
                    {user.role === "company" && (
                      <Link
                        className="btn primary"
                        to={`/jobs/${selected.jobId}`}
                      >
                        Manage interviewers
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}
          <InterviewRounds
            application={selected}
            onSchedule={() => {
              setSchedule(selected);
              setSelected(null);
            }}
          />
        </Modal>
      )}
      {schedule && (
        <ScheduleEditor
          application={schedule}
          onClose={() => setSchedule(null)}
          onSaved={() => {
            setSchedule(null);
            void records.reload();
          }}
        />
      )}
    </>
  );
}
export function ScheduleEditor({
  application,
  interview,
  onClose,
  onSaved,
}: {
  application?: Application;
  interview?: Interview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const codingProblems = useResource<Problem[]>("/problems", []);
  const assignedJobs = useResource<Job[]>("/jobs", []);
  const job = assignedJobs.data.find((j) => j._id === application?.jobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timezone, setTimezone] = useState(interview?.timezone || localZone);
  const [mode, setMode] = useState<"video" | "in_person">(
    interview?.mode || "video",
  );
  const initialDate = interview
    ? wallTime(new Date(interview.scheduledAt), timezone)
    : "";
  const timezones = [
    ...new Set(
      [
        localZone,
        interview?.timezone,
        "Asia/Kolkata",
        "UTC",
        "Europe/London",
        "America/New_York",
        "America/Los_Angeles",
        "Asia/Singapore",
        "Asia/Tokyo",
        "Australia/Sydney",
      ].filter(Boolean),
    ),
  ] as string[];
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formObject(e);
    setBusy(true);
    setError("");
    try {
      await send(
        interview ? `/interviews/${interview._id}/schedule` : "/interviews",
        {
          ...v,
          applicationId: application?._id,
          scheduledAt: zonedTimeToUtc(String(v.scheduledAt), timezone),
          timezone,
          mode,
          venue: mode === "in_person" ? String(v.venue || "") : "",
          facilitator: mode === "in_person" ? "human" : v.facilitator,
          duration: Number(v.duration),
          topics: csv(String(v.topics)),
        },
        interview ? "PATCH" : "POST",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={interview ? "Reschedule interview" : "Set up a great conversation"}
      onClose={onClose}
    >
      {assignedJobs.loading || codingProblems.loading ? (
        <Loading />
      ) : (
        <form onSubmit={save} key={job?._id || "schedule"}>
          {job && <InterviewInstructions job={job} />}
          <p className="muted">
            {application?.candidateName || interview?.candidateName} ·{" "}
            {application?.jobTitle || interview?.jobTitle}
          </p>
          <ErrorBox message={error} />
          <Field label="Interview mode">
            <select
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "video" | "in_person")}
            >
              <option value="video">Online video interview</option>
              <option value="in_person">In-person interview</option>
            </select>
          </Field>
          {mode === "in_person" && (
            <Field
              label="Interview venue"
              hint="Give the full address and arrival instructions. The candidate will see this in their schedule."
            >
              <textarea
                name="venue"
                required
                maxLength={2000}
                rows={3}
                defaultValue={interview?.venue}
              />
            </Field>
          )}
          <Field
            label="Date and time"
            hint={`Enter the time in ${timezone}. It will be stored as UTC.`}
          >
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={initialDate}
              required
            />
          </Field>
          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Duration">
              <select
                name="duration"
                defaultValue={
                  interview?.duration ||
                  job?.interviewInstructions?.duration ||
                  45
                }
              >
                {[
                  ...new Set([
                    15,
                    30,
                    45,
                    60,
                    90,
                    120,
                    job?.interviewInstructions?.duration || 45,
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <option key={v} value={v}>
                      {v} minutes
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Interview type">
              <select
                name="type"
                defaultValue={
                  interview?.type ||
                  job?.interviewInstructions?.type ||
                  "technical"
                }
              >
                <option value="technical">Technical</option>
                <option value="behavioral">Behavioral</option>
              </select>
            </Field>
          </div>
          <Field label="Interviewer">
            <select
              name="interviewerId"
              defaultValue={interview?.interviewerId || user._id}
              required
            >
              <option value={user._id}>{user.name}</option>
            </select>
          </Field>
          {mode === "video" && (
            <Field label="Interview facilitator">
              <select
                name="facilitator"
                defaultValue={interview?.facilitator || "human"}
              >
                <option value="human">Human interviewer</option>
                <option value="ai">AI-assisted interviewer</option>
              </select>
            </Field>
          )}
          <Field label="Topics, separated by commas">
            <input
              name="topics"
              defaultValue={
                interview?.topics.join(", ") ||
                job?.interviewInstructions?.topics?.join(", ") ||
                job?.skills.join(", ") ||
                "Problem solving"
              }
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Difficulty">
              <select
                name="difficulty"
                defaultValue={
                  interview?.difficulty || job?.difficulty || "Intermediate"
                }
              >
                {["Beginner", "Intermediate", "Advanced"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Coding question">
              <select
                name="problemId"
                defaultValue={interview?.problemId || "sum-pairs"}
              >
                {codingProblems.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.difficulty}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <Submit busy={busy}>
              {interview ? "Save schedule" : "Schedule interview"}
            </Submit>
          </div>
        </form>
      )}
    </Modal>
  );
}
export function InterviewsPage() {
  const { user } = useAuth();
  const records = useResource<Interview[]>("/interviews", []);
  const [filter, setFilter] = useState("Upcoming");
  const [editing, setEditing] = useState<Interview | null>(null);
  const [cancelling, setCancelling] = useState<Interview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = records.data
    .filter((i) => i.type !== "practice")
    .filter(
      (i) =>
        filter === "All interviews" ||
        (filter === "Upcoming"
          ? ["scheduled", "live"].includes(i.status)
          : i.status === "completed"),
    );
  return (
    <>
      <PageTitle
        eyebrow="GOOD CONVERSATIONS START HERE"
        title={
          user.role === "company"
            ? "Interview progress"
            : "Let’s get to know each other."
        }
        description={
          user.role === "company"
            ? "Monitor HR interviews and review the results."
            : "Prepare, connect, and make the most of every interview."
        }
        action={
          <Link
            className="btn secondary"
            to={user.role === "candidate" ? "/practice" : "/applications"}
          >
            {user.role === "candidate" ? (
              <Sparkles size={16} />
            ) : (
              <Plus size={16} />
            )}{" "}
            {user.role === "candidate"
              ? "Practice first"
              : user.role === "company"
                ? "View applications"
                : "Schedule from applications"}
          </Link>
        }
      />
      <div className="toolbar">
        <div
          className="tabs"
          role="group"
          aria-label="Filter interviews by status"
        >
          {["Upcoming", "Completed", "All interviews"].map((f) => (
            <button
              type="button"
              key={f}
              className={filter === f ? "active" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <Badge>
          <Clock size={13} />
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </Badge>
      </div>
      <ErrorBox message={records.error || error} />
      {records.loading ? (
        <Loading />
      ) : (
        <div className="interview-cards">
          {rows.map((i) => (
            <Panel key={i._id} className="interview-card">
              <div className="interview-card-heading">
                <Avatar name={i.candidateName} />
                <Status value={i.status} />
              </div>
              <h2>{i.jobTitle}</h2>
              <p>
                {user.role === "candidate" ? i.companyName : i.candidateName}
              </p>
              <div className="schedule-details">
                <span>
                  <MapPin size={16} />
                  {i.mode === "in_person"
                    ? `In person · ${i.venue}`
                    : "Online video interview"}
                </span>
                <span>
                  <CalendarDays size={16} />
                  {dateLabel(i.scheduledAt)}
                </span>
                <span>
                  <Clock size={16} />
                  {i.duration} minutes · {i.difficulty}
                </span>
              </div>
              <div className="tag-list">
                {i.topics.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <p className="interview-instructions">
                {user.role === "company"
                  ? "The assigned HR manages this interview. Results appear after the HR records feedback."
                  : i.mode === "in_person"
                    ? "Attend at the venue above. Contact your assigned HR if you need directions or accommodations."
                    : "Join from a quiet space with camera and microphone access. The room opens 15 minutes before your interview."}
              </p>
              <div className="form-actions">
                {user.role === "hr" && i.status === "scheduled" && (
                  <>
                    <button
                      className="text-button"
                      onClick={() => setCancelling(i)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => setEditing(i)}
                    >
                      Reschedule
                    </button>
                  </>
                )}
                <Link
                  className="btn primary"
                  to={
                    user.role === "company"
                      ? i.status === "completed"
                        ? "/reports"
                        : `/applications?applicationId=${i.applicationId}`
                      : `/room/${i._id}`
                  }
                >
                  <Video size={16} />
                  {user.role === "company"
                    ? i.status === "completed"
                      ? "View results"
                      : "View application"
                    : i.status === "completed"
                      ? "View session"
                      : "Open interview"}
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
      {!records.loading && !rows.length && (
        <Empty
          title="Good conversations are on the horizon"
          detail="Your interviews will appear here when they’re scheduled."
        />
      )}
      {editing && (
        <ScheduleEditor
          interview={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void records.reload();
          }}
        />
      )}
      {cancelling && (
        <Modal
          title="Cancel this interview?"
          onClose={() => setCancelling(null)}
        >
          <p>
            {cancelling.candidateName} will receive an in-app notification.
            Their application will return to Shortlisted so you can schedule
            again.
          </p>
          <ErrorBox message={error} />
          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() => setCancelling(null)}
            >
              Keep interview
            </button>
            <button
              disabled={busy}
              className="btn danger"
              onClick={async () => {
                setBusy(true);
                try {
                  await send(`/interviews/${cancelling._id}/cancel`);
                  setCancelling(null);
                  await records.reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel interview
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
const practiceTracks = [
  {
    title: "Frontend engineering",
    topics: "React, JavaScript, Accessibility",
    icon: Layers,
    color: "green",
    description: "From components to considered user experiences.",
  },
  {
    title: "Backend engineering",
    topics: "Node.js, API design, Databases",
    icon: Code2,
    color: "purple",
    description: "Build your confidence in systems that scale.",
  },
  {
    title: "Problem solving",
    topics: "Algorithms, Data structures, Testing",
    icon: Sparkles,
    color: "orange",
    description: "Think clearly. Explain your approach. Find your flow.",
  },
  {
    title: "Project deep dive",
    topics: "Project architecture, Trade-offs, Collaboration",
    icon: MessagesSquare,
    color: "blue",
    description: "Tell the technical story behind your best work.",
  },
];
export function PracticePage() {
  const records = useResource<Interview[]>("/interviews", []);
  const [track, setTrack] = useState<(typeof practiceTracks)[number] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const sessions = records.data.filter((i) => i.type === "practice");
  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formObject(e);
    setBusy(true);
    setError("");
    try {
      const result = await send<Interview>("/practice", {
        ...v,
        topics: csv(String(v.topics)),
        duration: Number(v.duration),
      });
      navigate(`/room/${result._id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR PERSONAL PRACTICE STUDIO"
        title="A little practice. A lot of possibility."
        description="Try a question, find your voice, and get one step closer to ready."
      />
      <section className="practice-intro">
        <div>
          <Badge tone="green">
            <Sparkles size={12} /> YOUR SPACE TO GROW
          </Badge>
          <h2>
            Show up as your
            <br />
            <em>most prepared self.</em>
          </h2>
          <p>
            Focused technical questions, a real coding editor, and feedback you
            can put into practice. Go at your own pace.
          </p>
        </div>
        <div className="practice-orbit" aria-hidden="true">
          <div>
            <AudioIcon />
          </div>
          <span className="practice-orbit-tag">
            <Check size={16} /> One step closer.
          </span>
        </div>
      </section>
      <div className="section-label">
        <h2>What would you like to work on?</h2>
        <span>Choose your focus. Make it yours.</span>
      </div>
      <div className="practice-grid">
        {practiceTracks.map((t) => (
          <button
            className="practice-track"
            key={t.title}
            onClick={() => {
              setTrack(t);
              setError("");
            }}
          >
            <span className={`track-icon ${t.color}`}>
              <t.icon size={24} />
            </span>
            <h3>{t.title}</h3>
            <p>{t.description}</p>
            <span className="text-link">
              Start a session <ArrowUpRight size={17} />
            </span>
          </button>
        ))}
      </div>
      <Panel
        title="Your practice journal"
        description="Small steps are still steps forward."
        action={<Badge>{sessions.length} sessions</Badge>}
      >
        <ErrorBox message={records.error} />
        {records.loading ? (
          <Loading />
        ) : sessions.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Practice focus</th>
                  <th>Difficulty</th>
                  <th>Questions answered</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions
                  .slice()
                  .reverse()
                  .map((s) => (
                    <tr key={s._id}>
                      <td>
                        <strong>{s.jobTitle}</strong>
                        <small className="muted">
                          {dateLabel(s.scheduledAt)}
                        </small>
                      </td>
                      <td>{s.difficulty}</td>
                      <td>
                        {s.answers.length} / {s.questions.length}
                      </td>
                      <td>
                        <Status value={s.status} />
                      </td>
                      <td>
                        <Link to={`/room/${s._id}`} className="text-link">
                          Open session
                          <ArrowUpRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your first practice is a fresh start"
            detail="Pick a focus above. Your sessions and submitted work will be saved here."
          />
        )}
      </Panel>
      {track && (
        <Modal title="Make this session yours" onClose={() => setTrack(null)}>
          <form onSubmit={start}>
            <ErrorBox message={error} />
            <Field label="Target role or focus">
              <input
                name="jobTitle"
                defaultValue={track.title}
                required
                minLength={3}
              />
            </Field>
            <Field label="Topics, separated by commas">
              <input name="topics" defaultValue={track.topics} required />
            </Field>
            <Field label="Practice mode">
              <select name="facilitator">
                <option value="human">Self-guided question templates</option>
                <option value="ai">
                  Adaptive AI interviewer (requires AI service)
                </option>
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Difficulty">
                <select name="difficulty">
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </Field>
              <Field label="Session length">
                <select name="duration">
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                </select>
              </Field>
            </div>
            <Field label="Coding exercise">
              <select name="problemId">
                <option value="sum-pairs">Pair sum · Easy</option>
                <option value="unique-count">Distinct values · Medium</option>
              </select>
            </Field>
            <Notice>
              Start with clearly labeled question templates. Generate tailored
              questions and answer feedback when your AI provider is configured.
              Practice stays separate from hiring.
            </Notice>
            <div className="form-actions">
              <Submit busy={busy}>Let’s practice</Submit>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function AudioIcon() {
  return (
    <div className="big-wave">
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          style={{ height: `${20 + Math.sin(i * 0.9) ** 2 * 55}px` }}
        />
      ))}
    </div>
  );
}
