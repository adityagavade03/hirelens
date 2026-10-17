import { ThemeSettings } from "./theme";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Upload,
  FileText,
  ArrowUpRight,
  ArrowLeft,
  Check,
  Users,
  Mail,
  Building2,
  Download,
  ShieldCheck,
  Sparkles,
  Code2,
  Mic,
  Video,
  ScanFace,
  ExternalLink,
} from "lucide-react";
import type {
  User,
  Company,
  Report,
  Interview,
  Application,
  Submission,
  MonitoringEvent,
  ServiceStatus,
} from "../shared/types";
import { useAuth } from "./auth-context";
import { api, send, useResource, csv, dateLabel } from "./api";
import {
  PageTitle,
  Panel,
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
import { AccountSecurityPanel } from "./AccountFeatures";
import { AssessmentPanel, PerformanceHistory } from "./Assessment";
import { CodeHistory } from "./CodeHistory";
import { MediaReview, SimilarityPanel } from "./InterviewMedia";
import type { IntegrityAnalysis } from "../shared/types";
import { ResumeProfile } from "./ResumeProfile";
import { HrAvailabilityPanel } from "./HrWorkload";
import { ProctoringSummary } from "./ProctoringSummary";
import { EventReviewControls } from "./MonitoringReview";
export function ProfilePage() {
  const { user } = useAuth();
  return user.role === "candidate" ? (
    <ResumeProfile />
  ) : (
    <ProfessionalProfile />
  );
}
function ProfessionalProfile() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formObject(e);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await send(
        "/profile",
        {
          ...v,
          skills: csv(String(v.skills)),
          preferredRoles: csv(String(v.preferredRoles || "")),
          experienceYears:
            v.experienceYears === "" || v.experienceYears == null
              ? null
              : Number(v.experienceYears),
        },
        "PATCH",
      );
      await refresh();
      setSuccess("Your profile is saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="TELL YOUR STORY"
        title="The person behind the profile."
        description="Bring your skills, experience, and ideas into focus."
      />
      <div className="profile-layout">
        <Panel className="profile-summary">
          <Avatar name={user.name} size="large" />
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge tone="green">
            {user.role === "hr" ? "HR / Interviewer" : user.role}
          </Badge>
          {user.sample && <Badge tone="amber">Sample account</Badge>}
          <div className="profile-summary-note">
            <ShieldCheck size={20} />
            <p>
              Your profile is shared with a company when you apply. Each
              application keeps a snapshot of what you submitted.
            </p>
          </div>
          {user.role === "candidate" && (
            <div className="resume-card">
              <FileText size={28} />
              <h3>Your résumé</h3>
              <p>
                PDF up to 5 MB. Scanned pages can be read when local OCR is
                enabled.
              </p>
              {user.profile.resumeId && (
                <a
                  href={`/api/resumes/${user.profile.resumeId}`}
                  className="text-link"
                >
                  Download current PDF <Download size={14} />
                </a>
              )}
              <label
                className={`btn secondary upload-label ${uploading ? "disabled" : ""}`}
              >
                <Upload size={15} />
                {uploading
                  ? "Reading PDF…"
                  : user.profile.resumeId
                    ? "Replace resume"
                    : "Upload resume"}
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    setError("");
                    setSuccess("");
                    const form = new FormData();
                    form.append("resume", file);
                    try {
                      const upload = await api<{ extractionMethod: string }>(
                        "/profile/resume",
                        {
                          method: "POST",
                          body: form,
                        },
                      );
                      await refresh();
                      setSuccess(
                        upload.extractionMethod === "local-ocr"
                          ? "Your scanned resume was read with local OCR. Please review the extracted evidence when applying; OCR can make mistakes."
                          : "Your resume has been uploaded and its text extracted.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          )}
        </Panel>
        <Panel
          title="Your profile"
          description="The details that help people understand your work."
        >
          <form className="panel-form" onSubmit={save}>
            <ErrorBox message={error} />
            {success && (
              <div role="status" className="notice success">
                <Check size={18} />
                {success}
              </div>
            )}
            <div className="form-grid">
              <Field label="Full name">
                <input
                  name="name"
                  required
                  minLength={2}
                  defaultValue={user.name}
                />
              </Field>
              <Field label="Phone">
                <input name="phone" defaultValue={user.profile.phone} />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Location">
                <input
                  name="location"
                  defaultValue={user.profile.location}
                  placeholder="City, country"
                />
              </Field>
              <Field label="Headline">
                <input
                  name="headline"
                  defaultValue={user.profile.headline}
                  placeholder="A short introduction to your work"
                />
              </Field>
            </div>
            <Field label="Skills" hint="Separate skills with commas.">
              <input
                name="skills"
                defaultValue={user.profile.skills.join(", ")}
                placeholder="React, Python, SQL"
              />
            </Field>
            <Field label="Education">
              <textarea
                name="education"
                rows={3}
                defaultValue={user.profile.education}
                placeholder="Degree, institution, and relevant coursework"
              />
            </Field>
            {user.role === "candidate" && (
              <>
                <Field
                  label="Preferred job roles"
                  hint="Separate roles with commas."
                >
                  <input
                    name="preferredRoles"
                    defaultValue={user.profile.preferredRoles?.join(", ")}
                    placeholder="Backend developer, Full-stack developer"
                  />
                </Field>
                <Field
                  label="Years of relevant professional experience"
                  hint="Leave empty if not applicable. This is self-reported evidence."
                >
                  <input
                    name="experienceYears"
                    type="number"
                    min={0}
                    max={80}
                    step="0.1"
                    defaultValue={user.profile.experienceYears ?? ""}
                  />
                </Field>
              </>
            )}
            <Field label="Experience">
              <textarea
                name="experience"
                rows={4}
                defaultValue={user.profile.experience}
                placeholder="Your role, responsibilities, and the outcomes of your work"
              />
            </Field>
            <Field label="Projects">
              <textarea
                name="projects"
                rows={4}
                defaultValue={user.profile.projects}
                placeholder="What you built, your contribution, and technical decisions"
              />
            </Field>
            <Field label="Certifications">
              <textarea
                name="certifications"
                rows={2}
                defaultValue={user.profile.certifications}
              />
            </Field>
            <Field label="Technical expertise / areas of interest">
              <textarea
                name="expertise"
                rows={2}
                defaultValue={user.profile.expertise}
              />
            </Field>
            <div className="form-actions">
              <Submit busy={busy}>Save profile</Submit>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}
interface Invitation {
  _id: string;
  companyName: string;
  email: string;
  status: string;
}
export function TeamPage() {
  const { user, refresh } = useAuth();
  const company = useResource<{ company: Company | null; members: User[] }>(
    "/company",
    { company: null, members: [] },
  );
  const invitations = useResource<Invitation[]>("/invitations", []);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formObject(e);
    setBusy(true);
    setError("");
    try {
      await send("/company", v, "PATCH");
      await company.reload();
      setSuccess("Company profile saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formObject(e);
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      await send("/invitations", v);
      await invitations.reload();
      form.reset();
      setSuccess(
        "Invitation is available in the HR account’s Hiring team page.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function respond(id: string, status: string) {
    setBusy(true);
    setError("");
    try {
      await send(`/invitations/${id}`, { status }, "PATCH");
      await refresh();
      await Promise.all([company.reload(), invitations.reload()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BETTER, TOGETHER"
        title="Good hiring is a team sport."
        description="Bring the right people into your hiring conversations."
      />
      <ErrorBox message={company.error || invitations.error || error} />
      {user.role === "hr" && <HrAvailabilityPanel />}
      {success && (
        <div className="notice success">
          <Check size={18} />
          {success}
        </div>
      )}
      {company.loading ? (
        <Loading />
      ) : (
        <div className="management-grid">
          <div>
            {company.data.company ? (
              <Panel
                title={company.data.company.name}
                description={`Company ID: ${company.data.company.identifier}`}
              >
                <div className="panel-form">
                  {user.role === "company" ? (
                    <>
                      <p>
                        Manage your verified company identity and public details
                        in Company profile.
                      </p>
                      <Link className="btn secondary" to="/company/profile">
                        Open company profile <ArrowUpRight size={16} />
                      </Link>
                    </>
                  ) : (
                    <>
                      <p>{company.data.company.description}</p>
                      <p>{company.data.company.location}</p>
                    </>
                  )}
                </div>
              </Panel>
            ) : (
              <Panel>
                <Empty
                  title="Find your team"
                  detail="Ask your company administrator to invite your registered HR email. Accept the invitation below to join."
                />
              </Panel>
            )}
            <Panel
              title="Team members"
              description="Authorized people in your company workspace."
            >
              {company.data.members.map((m) => (
                <div className="member-row" key={m._id}>
                  <Avatar name={m.name} />
                  <div>
                    <strong>{m.name}</strong>
                    <small>{m.email}</small>
                  </div>
                  <Badge>
                    {m.role === "company" ? "Owner" : "Interviewer"}
                  </Badge>
                </div>
              ))}
              {!company.data.members.length && (
                <Empty
                  title="No team yet"
                  detail="Accept a company invitation to see your team."
                />
              )}
            </Panel>
          </div>
          <div>
            {user.role === "company" && (
              <Panel
                title="Invite an interviewer"
                description="Invite an HR manager using their account email."
              >
                <form className="panel-form" onSubmit={invite}>
                  <Field label="HR email address">
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="interviewer@company.com"
                    />
                  </Field>
                  <Notice>
                    This is an in-app invitation. They can register as HR with
                    this email, then accept it from their Hiring team page.
                  </Notice>
                  <div className="form-actions">
                    <Submit busy={busy}>Create invitation</Submit>
                  </div>
                </form>
              </Panel>
            )}
            <Panel title="Company invitations">
              {invitations.data.length ? (
                invitations.data.map((i) => (
                  <div className="invitation-row" key={i._id}>
                    <div>
                      <strong>
                        {user.role === "company" ? i.email : i.companyName}
                      </strong>
                      <Status value={i.status} />
                    </div>
                    {user.role === "hr" && i.status === "pending" && (
                      <div className="form-actions">
                        <button
                          disabled={busy}
                          className="btn secondary"
                          onClick={() => respond(i._id, "rejected")}
                        >
                          Decline
                        </button>
                        <button
                          disabled={busy}
                          className="btn primary"
                          onClick={() => respond(i._id, "accepted")}
                        >
                          Join team
                          <Check size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <Empty
                  title="No pending invitations"
                  detail="New team invitations will appear here."
                />
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
export function ReportsPage() {
  const records = useResource<Report[]>("/reports", []);
  const interviews = useResource<Interview[]>("/interviews", []);
  const { user } = useAuth();
  return (
    <>
      <PageTitle
        eyebrow="EVIDENCE INTO UNDERSTANDING"
        title={
          user.role === "candidate"
            ? "Feedback for your next step."
            : "A clearer view of every conversation."
        }
        description={
          user.role === "candidate"
            ? "Your practice reports and feedback explicitly shared by hiring teams."
            : "Review technical evidence, add your perspective, and make the final decision."
        }
      />
      <ErrorBox message={records.error || interviews.error} />
      <PerformanceHistory />
      {records.loading ? (
        <Loading />
      ) : (
        <div className="report-grid">
          {records.data.map((r) => {
            const interview = interviews.data.find(
              (i) => i._id === r.interviewId,
            );
            return (
              <Panel key={r._id} className="report-card">
                <div className="report-card-top">
                  <span className="report-symbol">
                    <FileText size={23} />
                  </span>
                  <Badge tone={r.finalized ? "green" : "amber"}>
                    {r.finalized ? "Finalized" : "Draft"}
                  </Badge>
                </div>
                <h2>{interview?.jobTitle || "Interview report"}</h2>
                <p>
                  {interview?.type === "practice"
                    ? "Personal practice"
                    : interview?.candidateName}
                </p>
                <div className="report-facts">
                  <span>
                    {interview?.mode === "in_person"
                      ? "In-person interview"
                      : `${interview?.answers.length || 0} answers`}
                  </span>
                  <span>{interview?.duration || "—"} min session</span>
                </div>
                <div className="report-card-bottom">
                  <span>
                    {dateLabel(r.updatedAt, { month: "short", day: "numeric" })}
                  </span>
                  <Link to={`/reports/${r._id}`} className="text-link">
                    Open report
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      {!records.loading && !records.data.length && (
        <Empty
          title="Every conversation has something to teach"
          detail={
            user.role === "candidate"
              ? "Complete a practice session, or wait for a hiring team to release your interview feedback."
              : "End an interview to create its reviewable report."
          }
        />
      )}
    </>
  );
}
interface ReportData {
  integrity: IntegrityAnalysis | null;
  coding: { score: number; passed: number; total: number } | null;
  assessmentStale: boolean;
  report: Report;
  interview: Interview;
  application: Application | null;
  submissions: Submission[];
  events: MonitoringEvent[];
}
export function ReportPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const record = useResource<ReportData | null>(`/reports/${id}`, null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (record.loading) return <Loading />;
  if (!record.data) return <ErrorBox message={record.error} />;
  const { report, interview, application, submissions, events } = record.data;
  const inPerson = interview.mode === "in_person";
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formObject(e);
    setBusy(true);
    setError("");
    try {
      await send(
        `/reports/${id}`,
        {
          ...v,
          finalized: v.finalized === "on",
          released: v.released === "on",
          ratings: {
            technical: v.ratingTechnical ? Number(v.ratingTechnical) : null,
            communication: v.ratingCommunication
              ? Number(v.ratingCommunication)
              : null,
            problemSolving: v.ratingProblemSolving
              ? Number(v.ratingProblemSolving)
              : null,
          },
        },
        "PATCH",
      );
      await record.reload();
      setSuccess("Report saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to="/reports" className="back-link">
        <ArrowLeft size={16} />
        All reports
      </Link>
      <PageTitle
        eyebrow={
          interview.type === "practice"
            ? "PERSONAL PRACTICE REPORT"
            : "INTERVIEW ASSESSMENT"
        }
        title={interview.jobTitle}
        description={`${interview.candidateName} · ${dateLabel(interview.scheduledAt)}`}
        action={
          <a className="btn secondary" href={`/api/reports/${id}/pdf`}>
            <Download size={16} />
            Export PDF
          </a>
        }
      />
      <div className="detail-meta">
        <Badge tone={report.finalized ? "green" : "amber"}>
          {report.finalized ? "Finalized report" : "Draft report"}
        </Badge>
        <Badge>
          {report.released ? "Feedback released" : "Private review"}
        </Badge>
        {inPerson ? (
          <Badge>In-person interview</Badge>
        ) : (
          <Badge>{interview.answers.length} submitted answers</Badge>
        )}
      </div>
      {inPerson && (
        <Notice>
          This in-person assessment uses the interviewer’s observations, human
          ratings and submitted résumé.{" "}
          {interview.venue && `Venue: ${interview.venue}`}
        </Notice>
      )}
      {!inPerson && (
        <>
          <AssessmentPanel
            report={report}
            interview={interview}
            integrity={record.data.integrity}
            coding={record.data.coding}
            stale={record.data.assessmentStale}
            reload={record.reload}
          />
          <CodeHistory interviewId={interview._id} />
          {user.role !== "candidate" && interview.type !== "practice" && (
            <ProctoringSummary
              key={events.map((e) => e.review?.reviewedAt || e._id).join(",")}
              reportId={report._id}
              finalized={report.finalized}
            />
          )}
          <MediaReview
            interviewId={interview._id}
            locked={report.finalized}
            onChange={() => void record.reload()}
          />
          {user.role !== "candidate" && (
            <SimilarityPanel interviewId={interview._id} />
          )}
        </>
      )}
      <div
        className="report-layout"
        style={inPerson ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}
      >
        <div>
          <Panel
            title={inPerson ? "Interview question guide" : "The conversation"}
            description={
              inPerson
                ? "Planned questions and criteria used to guide the interviewer’s observations."
                : "Questions, submitted answers, and technical feedback."
            }
          >
            <div className="report-content">
              {interview.questions.map((q, i) => {
                const answer = interview.answers.find(
                  (a) => a.questionId === q.id,
                );
                return (
                  <article className="answer-report" key={q.id}>
                    <div className="question-number">
                      QUESTION {String(i + 1).padStart(2, "0")}{" "}
                      <Badge>
                        {q.source === "ai"
                          ? "AI generated"
                          : "Question template"}
                      </Badge>
                    </div>
                    <h3>{q.text}</h3>
                    <p className="rubric">Rubric: {q.rubric.join(" · ")}</p>
                    {(!inPerson || answer) && (
                      <blockquote>
                        {answer?.text || "No answer submitted."}
                      </blockquote>
                    )}
                    {answer && (
                      <Badge>
                        {answer.mode === "spoken"
                          ? "Spoken · transcript reviewed"
                          : "Typed answer"}
                      </Badge>
                    )}
                    {!inPerson &&
                      (answer?.feedback ? (
                        <div className="feedback-card">
                          <strong>AI advisory feedback</strong>
                          <p>{answer.feedback.feedback}</p>
                          <div className="tag-list">
                            <Badge>
                              Correctness:{" "}
                              {answer.feedback.correctness ?? "Uncertain"} / 5
                            </Badge>
                            <Badge>
                              Completeness:{" "}
                              {answer.feedback.completeness ?? "Uncertain"} / 5
                            </Badge>
                          </div>
                          <p>
                            Evidence:{" "}
                            {answer.feedback.evidence.join(" · ") ||
                              "No reliable evidence identified."}
                          </p>
                          <p>
                            Missing concepts:{" "}
                            {answer.feedback.missingConcepts.join(", ") ||
                              "None identified."}
                          </p>
                          <p>Follow-up: {answer.feedback.followUp}</p>
                          <small>
                            Uncertainty:{" "}
                            {answer.feedback.uncertainty ||
                              "No additional uncertainty stated by provider; human review is still required."}
                          </small>
                        </div>
                      ) : (
                        answer && (
                          <p className="muted">
                            No AI assessment has been generated for this answer.
                          </p>
                        )
                      ))}
                    {answer?.override && (
                      <div className="notice">
                        <ShieldCheck size={18} />
                        <span>Interviewer correction: {answer.override}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </Panel>
          {!inPerson && (
            <Panel
              title="Coding evidence"
              description="Results are saved from the configured execution service."
            >
              <div className="report-content">
                {submissions.length ? (
                  submissions.map((s) => (
                    <details className="submission-detail" key={s._id}>
                      <summary>
                        {s.language} ·{" "}
                        {s.mode === "submit"
                          ? `${s.passed}/${s.total} tests passed`
                          : "Custom input run"}{" "}
                        · {dateLabel(s.createdAt)}
                      </summary>
                      <pre>{s.code}</pre>
                      {s.results.map((r, i) => (
                        <div className="execution-line" key={i}>
                          <Status value={r.status} />
                          <span>
                            {r.hidden ? "Hidden test" : "Public / custom test"}{" "}
                            · {r.time ?? "—"} s · {r.memory ?? "—"} KB
                          </span>
                          {r.stdout && <pre>{r.stdout}</pre>}
                          {(r.stderr || r.compileOutput) && (
                            <pre>{r.stderr || r.compileOutput}</pre>
                          )}
                        </div>
                      ))}
                    </details>
                  ))
                ) : (
                  <p className="muted">
                    No coding submissions in this session.
                  </p>
                )}
              </div>
            </Panel>
          )}
          {!inPerson && user.role !== "candidate" && (
            <Panel
              title="Monitoring timeline"
              description="Context for human review. Kept separate from technical assessment."
            >
              <div className="report-content">
                <Notice>
                  Focus changes cannot identify external apps or prove cheating.
                  Browser events may be missing or manipulated. No automatic
                  rejection is performed.
                </Notice>
                {events.length ? (
                  events.map((e) => (
                    <div className="timeline-row" key={e._id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{e.kind.replaceAll("-", " ")}</strong>
                        <small>
                          {dateLabel(e.occurredAt)} ·{" "}
                          {(e.durationMs / 1000).toFixed(1)} seconds{" "}
                          {e.detail && `· ${e.detail}`}
                        </small>
                        <small>Event reference: {e._id}</small>
                        <EventReviewControls
                          interviewId={interview._id}
                          event={e}
                          readOnly={report.finalized}
                          onSaved={record.reload}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">No monitoring events recorded.</p>
                )}
              </div>
            </Panel>
          )}
        </div>
        <div style={inPerson ? { order: -1 } : undefined}>
          {application && (
            <Panel title="Résumé evidence">
              <div className="report-content">
                {application.resumeId && (
                  <a
                    className="text-link"
                    href={`/api/resumes/${application.resumeId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the submitted résumé <ArrowUpRight size={15} />
                  </a>
                )}
                <div className="coverage-number">
                  {application.match.score ?? "—"}
                  <small>% resume match</small>
                </div>
                <p>{application.match.method}</p>
                <div className="tag-list">
                  {application.match.matching.map((s) => (
                    <Badge tone="green" key={s}>
                      {s}
                    </Badge>
                  ))}
                  {application.match.missing.map((s) => (
                    <Badge tone="amber" key={s}>
                      {s}
                    </Badge>
                  ))}
                </div>
                {application.match.evidence.map((e) => (
                  <p key={e.skill}>
                    <strong>{e.skill}</strong> — {e.excerpt}
                  </p>
                ))}
              </div>
            </Panel>
          )}
          <Panel
            title={
              user.role !== "candidate" ? "Your assessment" : "Review summary"
            }
            description="The final decision belongs to people."
          >
            <div className="report-content">
              <ErrorBox message={error} />
              {success && (
                <div className="notice success">
                  <Check size={18} />
                  {success}
                </div>
              )}
              {user.role !== "candidate" ? (
                <form onSubmit={save}>
                  <Field label="Summary">
                    <textarea
                      name="summary"
                      rows={6}
                      defaultValue={report.summary}
                      placeholder="Summarize job-relevant evidence, strengths, and gaps."
                    />
                  </Field>
                  <p>
                    Round {(interview.roundIndex || 0) + 1} of{" "}
                    {interview.roundCount || 1}:{" "}
                    {interview.roundName || "Interview"}
                  </p>
                  <Field label="Human decision">
                    <select name="decision" defaultValue={report.decision}>
                      <option value="pending">Pending review</option>
                      <option value="selected">
                        {(interview.roundIndex || 0) + 1 <
                        (interview.roundCount || 1)
                          ? "Advance to next round"
                          : "Selected"}
                      </option>
                      <option value="rejected">Rejected</option>
                      <option value="hold">On hold</option>
                    </select>
                  </Field>
                  <div className="form-grid">
                    {(
                      [
                        ["Technical knowledge", "ratingTechnical", "technical"],
                        [
                          "Clarity of explanations",
                          "ratingCommunication",
                          "communication",
                        ],
                        [
                          "Problem solving",
                          "ratingProblemSolving",
                          "problemSolving",
                        ],
                      ] as const
                    ).map(([label, name, key]) => (
                      <Field key={key} label={`${label} (human rating)`}>
                        <select
                          name={name}
                          defaultValue={report.ratings?.[key] ?? ""}
                        >
                          <option value="">Not assessed</option>
                          <option value="1">1 — Major gaps</option>
                          <option value="2">2 — Partial</option>
                          <option value="3">3 — Meets expectations</option>
                          <option value="4">4 — Strong</option>
                          <option value="5">5 — Excellent</option>
                        </select>
                      </Field>
                    ))}
                  </div>
                  <Field label="Decision explanation">
                    <textarea
                      name="explanation"
                      defaultValue={report.explanation}
                      rows={4}
                      placeholder="Explain the evidence behind your decision."
                    />
                  </Field>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="finalized"
                      defaultChecked={report.finalized}
                    />
                    Finalize this report
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="released"
                      defaultChecked={report.released}
                    />
                    Release feedback to the candidate
                  </label>
                  <p className="muted small">
                    {inPerson
                      ? "Released feedback includes the summary, human ratings and decision. Private interviewer notes stay with your team."
                      : "Released feedback includes questions, answers, AI feedback, code, and the decision. Private notes and monitoring events stay with your team."}
                  </p>
                  <div className="form-actions">
                    <Submit busy={busy}>Save report</Submit>
                  </div>
                </form>
              ) : (
                <>
                  <Badge>
                    {report.decision === "pending"
                      ? "No hiring decision"
                      : report.decision}
                  </Badge>
                  <p className="prose-text">
                    {report.summary || "No review summary added."}
                  </p>
                  <p>{report.explanation}</p>
                  {report.ratings && (
                    <p>
                      Human ratings (out of 5): Technical{" "}
                      {report.ratings.technical ?? "not assessed"} · Clarity{" "}
                      {report.ratings.communication ?? "not assessed"} · Problem
                      solving {report.ratings.problemSolving ?? "not assessed"}
                    </p>
                  )}
                </>
              )}
              {user.role !== "candidate" && (
                <>
                  <h3>Private interviewer notes</h3>
                  <p className="prose-text">
                    {interview.notes || "No notes recorded."}
                  </p>
                  {user.role === "hr" && (
                    <Link className="text-link" to={`/room/${interview._id}`}>
                      Review session & feedback
                      <ArrowUpRight size={15} />
                    </Link>
                  )}
                </>
              )}
            </div>
          </Panel>
          {!inPerson && (
            <Notice>
              AI suggestions can be wrong. Technical content is assessed, never
              appearance, accent, emotion, or personal characteristics.
            </Notice>
          )}
        </div>
      </div>
    </>
  );
}
export function SettingsPage() {
  const { user } = useAuth();
  const services = useResource<ServiceStatus | null>("/services", null);
  const rows = [
    {
      key: "ocr",
      icon: FileText,
      title: "Scanned-resume OCR",
      description:
        "Read English scans locally; review extracted evidence for mistakes.",
      vars: "RESUME_OCR_ENABLED · OCR_LANGUAGE_PATH",
    },
    {
      key: "sms",
      icon: Mail,
      title: "Recruitment SMS",
      description: "Opt-in updates to verified phone numbers.",
      vars: "SMS_PROVIDER=twilio · TWILIO_* (or SMS_DELIVERY_URL + API key)",
    },
    {
      key: "multiServer",
      icon: Building2,
      title: "Multiple API servers",
      description:
        "Shared rate limits and interview signaling through private Redis.",
      vars: "REDIS_URL",
    },
    {
      key: "companyVerification",
      icon: Building2,
      title: "Company verification",
      description:
        "Check official company information with your configured verification service.",
      vars: "COMPANY_VERIFICATION_PROVIDER=cashfree · CASHFREE_* (or verification adapter)",
    },
    {
      key: "email",
      icon: Mail,
      title: "Company sign-in verification",
      description: "Deliver expiring sign-in codes through your email service.",
      vars: "EMAIL_FROM · OTP_HASH_SECRET · SMTP_HOST (or EMAIL_DELIVERY_URL + API key)",
    },
    {
      key: "ai",
      icon: Sparkles,
      title: "AI screening, questions & feedback",
      description:
        "Compare resumes with job descriptions, generate questions and evaluate answers.",
      vars: "LLM_BASE_URL · LLM_API_KEY · LLM_MODEL",
    },
    {
      key: "code",
      icon: Code2,
      title: "Isolated code execution",
      description: services.data?.codePublicDemo
        ? "Public Judge0 is limited to personal practice. Hiring assessments need a managed or self-hosted execution service."
        : "Run Java, Python, JavaScript, C, and C++ using Judge0.",
      vars: "JUDGE0_URL · JUDGE0_API_KEY",
    },
    {
      key: "transcription",
      icon: Mic,
      title: "Spoken-answer transcription",
      description:
        "Record explicitly, transcribe, then review your answer before submitting.",
      vars: "STT_BASE_URL · STT_API_KEY · STT_MODEL",
    },
    {
      key: "turn",
      icon: Video,
      title: "Video relay",
      description: "TURN helps participants connect across different networks.",
      vars: "TURN_PROVIDER=twilio · TWILIO_* (or TURN_URL + TURN_SECRET)",
    },
    {
      key: "face",
      icon: ScanFace,
      title: "Local face detection",
      description:
        "With consent, detect sustained no-face or multiple-face events locally.",
      vars: "FACE_MODEL_URL · MEDIAPIPE_WASM_URL",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE, CONNECTED"
        title="A few connections. More possibilities."
        description="Service configuration is managed securely on the server."
      />
      <ThemeSettings />
      <AccountSecurityPanel />
      {user.role !== "candidate" && (
        <p>
          <Link className="btn secondary" to="/coding-library">
            Manage coding questions
          </Link>
        </p>
      )}
      {user.role === "company" && (
        <p>
          <Link className="btn secondary" to="/governance">
            Audit log & retention
          </Link>
        </p>
      )}
      {services.data?.messagePreview && (
        <Notice>
          Local message preview is enabled. Email and SMS are saved to
          .data/messages; no external delivery occurs.
        </Notice>
      )}
      <ErrorBox message={services.error} />
      <Notice>
        Configured means credentials or URLs are present. Live provider
        availability is confirmed only when a request succeeds.
      </Notice>
      <Panel
        title="Integrations"
        description="Missing services are shown clearly. HireLens never invents results."
      >
        {services.loading ? (
          <Loading />
        ) : (
          rows.map((r) => (
            <div className="integration-row" key={r.key}>
              <span className="integration-icon">
                <r.icon size={22} />
              </span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.description}</p>
                <code>{r.vars}</code>
              </div>
              <Badge
                tone={
                  services.data?.[r.key as keyof ServiceStatus] &&
                  !(r.key === "code" && services.data.codePublicDemo)
                    ? "green"
                    : "amber"
                }
              >
                {services.data?.[r.key as keyof ServiceStatus]
                  ? services.data?.messagePreview &&
                    ["email", "sms"].includes(r.key)
                    ? "Local preview"
                    : r.key === "turn" && services.data.turnLocalDev
                      ? "Local test relay"
                      : r.key === "code" && services.data.codePublicDemo
                        ? "Public practice only"
                        : "Configured"
                  : "Setup needed"}
              </Badge>
            </div>
          ))
        )}
      </Panel>
      <div className="management-grid">
        <Panel title="Privacy & monitoring">
          <div className="report-content">
            <p>
              Monitoring requires candidate consent. Browser events and
              face-count metadata can be recorded during assessed sessions.
              Webcam frames are processed locally; raw webcam video is not
              stored.
            </p>
            <p>
              Microphone audio is sent to the configured speech provider only
              when you explicitly record and request transcription. Typed
              answers remain available.
            </p>
            <p>
              Resume files and application snapshots stay in MongoDB. The
              configured AI provider receives job-relevant resume text and the
              JD for screening, plus technical question and answer context for
              interviews. The local setup uses Ollama.
            </p>
          </div>
        </Panel>
        <Panel title="A student-friendly setup">
          <div className="report-content">
            <p>
              The project includes a README, Windows instructions, an API
              reference, a demonstration script, and a progress checklist.
            </p>
            <p>
              Copy <code>.env.example</code> to <code>.env</code>, configure
              services, and restart the API. Keys are never placed in the
              frontend.
            </p>
            <p>
              Use HTTPS for deployed camera and microphone access, and a TURN
              server for reliable calls between networks.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
