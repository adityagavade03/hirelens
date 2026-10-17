import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2,
  Plus,
  ArrowUpRight,
  Users,
  Check,
  ShieldCheck,
  Upload,
  BriefcaseBusiness,
  CalendarDays,
  Search,
} from "lucide-react";
import type {
  Company,
  Job,
  Application,
  User,
  Notification,
} from "../shared/types";
import { useAuth } from "./auth-context";
import { api, send, useResource, dateLabel } from "./api";
import {
  PageTitle,
  Panel,
  Badge,
  Status,
  Avatar,
  Field,
  Submit,
  ErrorBox,
  Notice,
  Empty,
  Loading,
  Modal,
  formObject,
} from "./ui";
import { CompanyIdentityFields } from "./company-fields";
import { CompanyWorkloadPanel } from "./HrWorkload";

type Overview = {
  company: Company;
  jobs: Record<string, number>;
  applications: Record<string, number>;
  interviews: Record<string, number>;
  hrCount: number;
  recentApplications: Application[];
  recentJobs: Job[];
  proctoringReviews?: Record<string, number>;
};
export function CompanyDashboard() {
  const overview = useResource<Overview | null>("/company/overview", null);
  if (overview.loading) return <Loading />;
  if (!overview.data) return <ErrorBox message={overview.error} />;
  const d = overview.data,
    sum = (v: Record<string, number>) =>
      Object.values(v).reduce((a, b) => a + b, 0);
  const total = sum(d.applications);
  const stats = [
    ["Total jobs", sum(d.jobs), "/jobs"],
    ["Active jobs", d.jobs.published || 0, "/jobs"],
    ["Applications", total, "/applications"],
    [
      "Shortlisted",
      d.applications.Shortlisted || 0,
      "/applications?status=Shortlisted",
    ],
    ["Scheduled", d.interviews.scheduled || 0, "/interviews"],
    ["Completed", d.interviews.completed || 0, "/interviews"],
    ["Selected", d.applications.Selected || 0, "/applications?status=Selected"],
    ["Not shortlisted / rejected", d.applications.Rejected || 0, "/applications?status=Rejected"],
  ] as const;
  return (
    <div className="company-dashboard">
      <PageTitle
        eyebrow="COMPANY WORKSPACE"
        title="Your recruitment, in focus."
        description="Move from an open role to the right hire with a clear view of every step."
        action={
          <Link className="btn primary" to="/jobs/new">
            <Plus size={17} /> Create job
          </Link>
        }
      />
      <ErrorBox message={overview.error} />
      <section className="company-banner">
        <div className="company-banner-brand">
          {d.company.hasLogo ? (
            <img src="/api/company/logo" alt={`${d.company.name} logo`} />
          ) : (
            <span>
              <Building2 size={29} />
            </span>
          )}
          <div>
            <h2>{d.company.name}</h2>
            <p>
              {[d.company.industry, d.company.location]
                .filter(Boolean)
                .join(" · ") ||
                "Complete your company profile to introduce your team."}
            </p>
            <Badge
              tone={
                d.company.verification?.status === "verified"
                  ? "green"
                  : "amber"
              }
            >
              {d.company.sample
                ? "Sample company · not verified"
                : d.company.verification?.status === "verified"
                  ? "Verified company"
                  : d.company.localDevelopment
                    ? "Local development · unverified"
                    : "Verification required"}
            </Badge>
          </div>
        </div>
        <Link to="/company/profile" className="btn secondary">
          Company profile <ArrowUpRight size={16} />
        </Link>
      </section>
      {!d.company.sample && d.company.verification?.status !== "verified" && (
        <Notice>
          {d.company.localDevelopment
            ? "This company is unverified. Job publishing and recruitment are available for local development while local setup is enabled. Complete official verification before public use. "
            : "Complete company verification before publishing jobs. Your existing records and draft jobs remain available. "}
          <Link to="/company/profile" className="text-link">
            Company verification details
          </Link>
        </Notice>
      )}
      <div className="company-stats">
        {stats.map(([label, value, href]) => (
          <Link key={label} to={href}>
            <span>{label}</span>
            <strong>{value}</strong>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </div>
      <div className="company-main-grid">
        <Panel
          title="Recruitment pipeline"
          description="Application stages across your company."
          action={
            <Link className="text-link" to="/applications">
              View applications <ArrowUpRight size={15} />
            </Link>
          }
        >
          <div className="recruitment-pipeline">
            {[
              "Applied",
              "Under Review",
              "Shortlisted",
              "Interview Scheduled",
              "Interview Completed",
              "Selected",
              "Rejected",
            ].map((stage) => (
              <Link
                to={`/applications?status=${encodeURIComponent(stage)}`}
                key={stage}
              >
                <span>{stage}</span>
                <div className="pipeline-track">
                  <i
                    style={{
                      width: `${total ? ((d.applications[stage] || 0) / total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{d.applications[stage] || 0}</strong>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel
          title="Keep recruitment moving"
          description="A clear next step for your team."
        >
          <div className="company-next">
            <Link to="/jobs/new">
              <BriefcaseBusiness size={21} />
              <span>
                <strong>Define your next role</strong>
                <small>Create a draft or publish a job description.</small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
            <Link to="/applications">
              <Users size={21} />
              <span>
                <strong>Review your candidates</strong>
                <small>
                  View AI screening results and automatically shortlisted
                  candidates.
                </small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
            <Link to="/interviewers">
              <CalendarDays size={21} />
              <span>
                <strong>Choose your interviewers</strong>
                <small>
                  {d.hrCount} HR {d.hrCount === 1 ? "member" : "members"} in
                  your company team.
                </small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </Panel>
      </div>
      <CompanyWorkloadPanel />
      <Panel title="Monitoring review" description="Observed events require context and human review; they never decide selection automatically.">
        <div className="panel-form"><p>{d.proctoringReviews?.pending || 0} awaiting review · {d.proctoringReviews?.reviewed || 0} reviewed · {d.proctoringReviews?.explained || 0} explained · {d.proctoringReviews?.follow_up || 0} need follow-up</p>
          <Link className="text-link" to="/reports">Open interview reports and event timelines</Link>
        </div>
      </Panel>
      <div className="company-main-grid">
        <Panel
          title="Recent applications"
          action={
            <Link to="/applications" className="text-link">
              View all <ArrowUpRight size={15} />
            </Link>
          }
        >
          {d.recentApplications.length ? (
            d.recentApplications.map((a) => (
              <Link
                to={`/applications?jobId=${a.jobId}`}
                className="company-record"
                key={a._id}
              >
                <Avatar name={a.candidateName} />
                <span>
                  <strong>{a.candidateName}</strong>
                  <small>{a.jobTitle}</small>
                </span>
                <Status value={a.status} />
              </Link>
            ))
          ) : (
            <Empty
              title="Your candidate pipeline starts here"
              detail="Publish a job to start receiving applications."
            />
          )}
        </Panel>
        <Panel
          title="Your latest roles"
          action={
            <Link to="/jobs" className="text-link">
              Manage jobs <ArrowUpRight size={15} />
            </Link>
          }
        >
          {d.recentJobs.length ? (
            d.recentJobs.map((j) => (
              <Link
                to={`/jobs/${j._id}`}
                className="company-record"
                key={j._id}
              >
                <BriefcaseBusiness size={20} />
                <span>
                  <strong>{j.title}</strong>
                  <small>{j.department || j.location}</small>
                </span>
                <Status value={j.status} />
              </Link>
            ))
          ) : (
            <Empty
              title="Make space for your next hire"
              detail="Create a job description and save your first draft."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

export function CompanyProfilePage() {
  const { user } = useAuth();
  const options = useResource<{ companyVerification: boolean } | null>(
    "/auth/options",
    null,
  );
  const resource = useResource<{ company: Company | null }>("/company", {
    company: null,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [verifying, setVerifying] = useState(false),
    [logoVersion, setLogoVersion] = useState(0);
  const company = resource.data.company;
  async function save(e: FormEvent<HTMLFormElement>, verify = false) {
    e.preventDefault();
    const values = formObject(e);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await send(
        verify ? "/company/verify" : "/company",
        verify
          ? { ...values, country: String(values.country).toUpperCase() }
          : values,
        verify ? "POST" : "PATCH",
      );
      await resource.reload();
      setVerifying(false);
      setSuccess(
        verify ? "Company verified successfully." : "Company profile saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading) return <Loading />;
  if (!company)
    return (
      <ErrorBox message={resource.error || "Company profile unavailable."} />
    );
  const verified = company.verification?.status === "verified";
  return (
    <>
      <PageTitle
        eyebrow="YOUR ORGANIZATION"
        title="Company profile"
        description="Your company identity, contact details, and verification status."
      />
      <ErrorBox message={resource.error || options.error || error} />
      {success && (
        <div role="status" className="notice success">
          <Check size={18} />
          {success}
        </div>
      )}
      {company.localDevelopment && !verified && (
        <Notice>
          This is an unverified company for local development. You can test job
          publishing and recruitment while local setup is enabled. Complete
          official verification before public use.
        </Notice>
      )}
      {options.data && !options.data.companyVerification && (
        <Notice>
          Official company verification is not connected yet. Your administrator
          can connect a verification service to verify this company later.
        </Notice>
      )}
      <div className="profile-layout">
        <Panel className="company-profile-summary">
          {company.hasLogo ? (
            <img
              src={`/api/company/logo?v=${logoVersion}`}
              alt="Company logo"
            />
          ) : (
            <div className="company-logo-placeholder">
              <Building2 size={42} />
            </div>
          )}
          <h2>{company.name}</h2>
          <p>{company.identifier}</p>
          <Badge tone={verified ? "green" : "amber"}>
            {verified
              ? "Verified company"
              : company.sample
                ? "Sample · not verified"
                : company.localDevelopment
                  ? "Local development · unverified"
                  : "Verification required"}
          </Badge>
          {company.verification?.verifiedAt && (
            <p className="small">
              Verified {dateLabel(company.verification.verifiedAt)}
            </p>
          )}
          <label className="btn secondary upload-label">
            <Upload size={16} /> Upload logo
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const input = e.target;
                setBusy(true);
                setError("");
                try {
                  const data = new FormData();
                  data.append("logo", file);
                  await api("/company/logo", { method: "POST", body: data });
                  await resource.reload();
                  setLogoVersion((v) => v + 1);
                  setSuccess("Company logo updated.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  input.value = "";
                  setBusy(false);
                }
              }}
            />
          </label>
          <p className="small">PNG or JPEG · up to 1 MB</p>
          {options.data?.companyVerification && (
            <button
              className="btn secondary"
              onClick={() => {
                setError("");
                setVerifying(true);
              }}
            >
              <ShieldCheck size={16} />
              {verified ? "Update verified identity" : "Verify company"}
            </button>
          )}
          <dl className="company-identity">
            <dt>Official email</dt>
            <dd>{company.officialEmail || user.email}</dd>
            <dt>Registration code</dt>
            <dd>{company.registrationNumber || "Not provided"}</dd>
            <dt>Country</dt>
            <dd>{company.country || "Not provided"}</dd>
          </dl>
        </Panel>
        <Panel
          title="Company information"
          description={
            verified
              ? "Legal name and website changes require a new verification."
              : company.localDevelopment
                ? "Update your company details for local recruitment testing."
                : "Complete your profile and verify your company before publishing."
          }
        >
          <form
            className="panel-form"
            onSubmit={save}
            key={company.name + company.website}
          >
            <Field label="Company name">
              <input
                name="name"
                required
                minLength={2}
                defaultValue={company.name}
                readOnly={verified}
              />
            </Field>
            <Field label="Company description">
              <textarea
                name="description"
                rows={4}
                maxLength={6000}
                defaultValue={company.description}
                placeholder="Introduce your company, work, and team."
              />
            </Field>
            <div className="form-grid">
              <Field label="Industry">
                <input
                  name="industry"
                  maxLength={120}
                  defaultValue={company.industry}
                />
              </Field>
              <Field label="Company type">
                <input
                  name="companyType"
                  maxLength={100}
                  defaultValue={company.companyType}
                />
              </Field>
            </div>
            <Field label="Website">
              <input
                name="website"
                type="url"
                defaultValue={company.website}
                readOnly={verified}
              />
            </Field>
            <Field label="Company address">
              <textarea
                name="address"
                rows={2}
                maxLength={600}
                defaultValue={company.address}
              />
            </Field>
            <div className="form-grid">
              <Field label="Location">
                <input
                  name="location"
                  maxLength={200}
                  defaultValue={company.location}
                />
              </Field>
              <Field label="Contact number">
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={company.phone}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Submit busy={busy}>Save company profile</Submit>
            </div>
          </form>
        </Panel>
      </div>
      {verifying && (
        <Modal
          title={
            verified ? "Verify updated company identity" : "Verify your company"
          }
          onClose={() => !busy && setVerifying(false)}
          wide
        >
          <form onSubmit={(e) => save(e, true)}>
            <ErrorBox message={error} />
            <CompanyIdentityFields company={company} email={user.email} />
            <div className="form-actions">
              <Submit busy={busy}>Verify official details</Submit>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

type Interviewer = User & {
  assignedJobs: number;
  upcomingInterviews: number;
  completedInterviews: number;
};
export function InterviewersPage() {
  const people = useResource<Interviewer[]>("/company/interviewers", []),
    jobs = useResource<Job[]>("/jobs", []);
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(
      params.get("assigned") ? "assigned" : "all",
    ),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Interviewer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const shown = people.data.filter(
    (p) =>
      (filter === "all" ||
        (filter === "assigned" && p.assignedJobs > 0) ||
        (filter === "available" && p.profile.availability !== "unavailable")) &&
      `${p.name} ${p.profile.expertise} ${p.profile.skills.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { jobId } = formObject(e);
    setBusy(true);
    setError("");
    try {
      await send(`/jobs/${jobId}/hr-requests`, { hrIds: [selected!._id] });
      setSuccess(`${selected!.name} has been requested and notified.`);
      setSelected(null);
      await Promise.all([people.reload(), jobs.reload()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR HIRING TEAM"
        title="The right people for every interview."
        description="Review your company’s interviewers, availability, and current workload."
        action={
          <Link className="btn secondary" to="/team">
            <Plus size={16} /> Invite interviewer
          </Link>
        }
      />
      <ErrorBox
        message={people.error || jobs.error || (!selected ? error : "")}
      />
      {success && (
        <div role="status" className="notice success">
          <Check size={18} />
          {success}
        </div>
      )}
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Filter interviewers">
          {[
            ["all", "All interviewers"],
            ["available", "Available"],
            ["assigned", "Assigned"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search interviewers"
            placeholder="Name, skill, or specialization"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {people.loading ? (
        <Loading />
      ) : shown.length ? (
        <div className="interviewer-grid">
          {shown.map((p) => (
            <Panel key={p._id} className="interviewer-card">
              <div className="interviewer-heading">
                <Avatar name={p.name} />
                <div>
                  <h2>{p.name}</h2>
                  <p>{p.profile.headline || "HR / Interviewer"}</p>
                </div>
                <Badge
                  tone={
                    p.profile.availability === "unavailable"
                      ? "red"
                      : p.profile.availability === "busy"
                        ? "amber"
                        : "green"
                  }
                >
                  {p.profile.availability || "available"}
                </Badge>
              </div>
              <p>{p.profile.expertise || "No specialization added yet."}</p>
              <div className="tag-list">
                {p.profile.skills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <p className="interviewer-experience">
                {p.profile.experience || "No experience details provided."}
              </p>
              {p.profile.availabilityNote && (
                <p className="small">
                  Availability: {p.profile.availabilityNote}
                </p>
              )}
              <div className="workload-stats">
                <span>
                  <strong>{p.assignedJobs}</strong>Active assignments
                </span>
                <span>
                  <strong>{p.upcomingInterviews}</strong>Upcoming interviews
                </span>
                <span>
                  <strong>{p.completedInterviews}</strong>Completed
                </span>
              </div>
              <div className="assignment-list">
                {jobs.data
                  .filter((j) => j.hrRequests?.some((r) => r.hrId === p._id))
                  .map((j) => (
                    <div key={j._id}>
                      <Link to={`/jobs/${j._id}`}>{j.title}</Link>
                      <Status
                        value={
                          j.hrRequests.find((r) => r.hrId === p._id)?.status ===
                          "declined"
                            ? "rejected"
                            : j.hrRequests.find((r) => r.hrId === p._id)
                                ?.status || "pending"
                        }
                      />
                    </div>
                  ))}
              </div>
              <button
                className="btn secondary"
                disabled={p.profile.availability === "unavailable"}
                onClick={() => {
                  setSelected(p);
                  setError("");
                }}
              >
                Request for a job <ArrowUpRight size={15} />
              </button>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty
          title="No matching interviewers"
          detail="Invite an HR account to your company. They’ll appear here after accepting your invitation."
          action={
            <Link to="/team" className="btn secondary">
              Manage invitations
            </Link>
          }
        />
      )}
      {selected && (
        <Modal
          title={`Request ${selected.name}`}
          onClose={() => !busy && setSelected(null)}
        >
          <form onSubmit={assign}>
            <ErrorBox message={error} />
            <Notice>
              Choose HR for a published job. Once accepted, the HR can review
              applicants, review AI shortlists and manage interviews.
            </Notice>
            <Field label="Recruitment job">
              <select
                name="jobId"
                required
                defaultValue={params.get("jobId") || ""}
              >
                <option value="" disabled>
                  Select a job
                </option>
                {jobs.data
                  .filter(
                    (j) =>
                      j.status === "published" &&
                      !j.hrRequests.some(
                        (r) =>
                          r.hrId === selected._id && r.status !== "declined",
                      ),
                  )
                  .map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.title}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-actions">
              <Submit busy={busy}>Send HR request</Submit>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function AssignmentsPage() {
  const { user, refresh } = useAuth();
  const assignments = useResource<Job[]>("/hr/assignments", []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [declining, setDeclining] = useState<Job | null>(null);
  async function respond(job: Job, status: string) {
    setBusy(true);
    setError("");
    try {
      await send(`/hr/assignments/${job._id}`, { status }, "PATCH");
      await assignments.reload();
      setDeclining(null);
      setSuccess(`Assignment ${status}. Your company has been notified.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="INTERVIEWER WORKSPACE"
        title="Your recruitment assignments"
        description="Accept your company’s assignments and keep your availability up to date."
      />
      <ErrorBox message={assignments.error || error} />
      {success && (
        <div role="status" className="notice success">
          <Check size={18} />
          {success}
        </div>
      )}
      <Panel
        title="Your availability"
        description="Shared with your company when choosing interviewers."
      >
        <form
          className="panel-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const values = formObject(e);
            setBusy(true);
            setError("");
            try {
              await send("/hr/availability", values, "PATCH");
              await refresh();
              setSuccess("Availability updated.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Availability">
              <select
                name="availability"
                defaultValue={user.profile.availability || "available"}
              >
                <option value="available">Available</option>
                <option value="busy">Busy · limited capacity</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </Field>
            <Field label="Availability details">
              <input
                name="availabilityNote"
                maxLength={500}
                defaultValue={user.profile.availabilityNote}
                placeholder="e.g. Weekdays, 2–5 pm IST"
              />
            </Field>
          </div>
          <div className="form-actions">
            <Submit busy={busy}>Update availability</Submit>
          </div>
        </form>
      </Panel>
      <Panel title="Assigned roles">
        {assignments.loading ? (
          <Loading />
        ) : assignments.data.length ? (
          assignments.data.map((j) => (
            <div className="assignment-row" key={j._id}>
              <div>
                <h3>{j.title}</h3>
                <p>
                  {j.companyName} · {j.location}
                </p>
                <p>
                  Expected candidates: {j.myRequest?.expectedCandidates ?? 0}{" "}
                  (current estimate) · Assigned: {j.assignedCandidateCount ?? 0}
                </p>
                <div className="tag-list">
                  <Status value={j.status} />
                  <Status
                    value={
                      j.myRequest?.status === "declined"
                        ? "rejected"
                        : j.myRequest?.status || "pending"
                    }
                  />
                </div>
              </div>
              <div className="form-actions">
                <Link className="text-link" to={`/jobs/${j._id}`}>
                  View job & instructions
                </Link>
                {j.myRequest?.status === "pending" ? (
                  <>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => setDeclining(j)}
                    >
                      Reject
                    </button>
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() => respond(j, "accepted")}
                    >
                      Accept request
                    </button>
                  </>
                ) : (
                  j.myRequest?.status === "accepted" && (
                    <Link
                      className="btn secondary"
                      to={`/applications?jobId=${j._id}`}
                    >
                      Review job applicants <ArrowUpRight size={15} />
                    </Link>
                  )
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty
            title="Your next assignment will appear here"
            detail="Join your company through Hiring team, then ask your administrator to assign a role."
            action={
              <Link to="/team" className="btn secondary">
                Hiring team
              </Link>
            }
          />
        )}
      </Panel>
      {declining && (
        <Modal
          title="Reject this request?"
          onClose={() => !busy && setDeclining(null)}
        >
          <p>
            Your company will be notified that you cannot manage recruitment for{" "}
            {declining.title}.
          </p>
          <ErrorBox message={error} />
          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() => setDeclining(null)}
            >
              Keep pending
            </button>
            <button
              className="btn danger-outline"
              disabled={busy}
              onClick={() => respond(declining, "declined")}
            >
              Reject request
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function HrRequestsSummary() {
  const requests = useResource<Job[]>("/hr/assignments", []);
  const pending = requests.data.filter(
    (j) => j.myRequest?.status === "pending",
  );
  return (
    <Panel
      title={`Interview requests${requests.loading ? "" : ` (${pending.length} pending)`}`}
      action={
        <Link className="text-link" to="/assignments">
          Review requests
        </Link>
      }
    >
      <ErrorBox message={requests.error} />
      {requests.loading ? (
        <Loading />
      ) : pending.length ? (
        pending.map((j) => (
          <div className="assignment-row" key={j._id}>
            <div>
              <h3>{j.title}</h3>
              <p>
                {j.companyName} · Expected candidates:{" "}
                {j.myRequest?.expectedCandidates ?? 0} (estimate)
              </p>
              <Status value="pending" />
            </div>
            <Link className="btn secondary" to="/assignments">
              View instructions & respond
            </Link>
          </div>
        ))
      ) : (
        <p className="panel-form">
          No pending requests. Accepted jobs and assigned candidates appear in
          your workspace.
        </p>
      )}
    </Panel>
  );
}
export function NotificationsPage() {
  const records = useResource<Notification[]>("/notifications", []);
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE UPDATES"
        title="Notifications"
        description="Applications, assignments, and interview updates in one place."
        action={
          <button
            className="btn secondary"
            onClick={() =>
              send("/notifications/read", {}, "PATCH")
                .then(() => records.reload())
                .catch((e) => setError(e.message))
            }
          >
            Mark all read
          </button>
        }
      />
      <ErrorBox message={records.error || error} />
      <Panel>
        {records.loading ? (
          <Loading />
        ) : records.data.length ? (
          records.data.map((n) => (
            <Link className="company-record" key={n._id} to={n.href}>
              <Badge tone={n.read ? "neutral" : "green"}>
                {n.read ? "Read" : "New"}
              </Badge>
              <span>
                <strong>{n.message}</strong>
                <small>{dateLabel(n.createdAt)}</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
          ))
        ) : (
          <Empty
            title="You’re all caught up"
            detail="Updates will appear here as recruitment moves forward."
          />
        )}
      </Panel>
    </>
  );
}
