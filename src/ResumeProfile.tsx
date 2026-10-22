import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Upload, FileText, Check, Sparkles } from "lucide-react";
import { useAuth } from "./auth-context";
import { api, csv } from "./api";
import { send } from "./api";
import { PageTitle, Panel, Field, Submit, ErrorBox, formObject } from "./ui";
import type { Profile } from "../shared/types";
import "./resume.css";

type Row = Record<string, string | boolean>;
type Input = {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  max?: number;
  wide?: boolean;
};
type Section = {
  key:
    | "educationEntries"
    | "experienceEntries"
    | "projectEntries"
    | "certificationEntries";
  id: string;
  title: string;
  singular: string;
  legacy: "education" | "experience" | "projects" | "certifications";
  description: string;
  fields: Input[];
  limit: number;
};
const sections: Section[] = [
  {
    key: "educationEntries",
    id: "education",
    title: "Education",
    singular: "education",
    legacy: "education",
    limit: 10,
    description:
      "Add qualifications and relevant coursework. Include an expected completion year if you are studying.",
    fields: [
      {
        key: "qualification",
        label: "Qualification",
        placeholder: "B.Tech, B.Sc., diploma",
        max: 150,
      },
      {
        key: "field",
        label: "Field of study",
        placeholder: "Computer Science",
        max: 150,
      },
      {
        key: "institution",
        label: "Institution",
        placeholder: "College or university",
        max: 200,
        wide: true,
      },
      {
        key: "startYear",
        label: "Start year",
        placeholder: "2022",
        type: "year",
        max: 4,
      },
      {
        key: "endYear",
        label: "Completion year",
        placeholder: "2026",
        type: "year",
        max: 4,
      },
      {
        key: "details",
        label: "Relevant coursework or details",
        placeholder: "Databases, data structures, software engineering",
        type: "textarea",
        max: 4000,
        wide: true,
      },
    ],
  },
  {
    key: "experienceEntries",
    id: "experience",
    title: "Work experience",
    singular: "experience",
    legacy: "experience",
    limit: 15,
    description:
      "Include jobs and internships. New to work? Leave this section empty and describe your projects below.",
    fields: [
      {
        key: "role",
        label: "Role or job title",
        placeholder: "Backend Developer Intern",
        max: 150,
      },
      {
        key: "company",
        label: "Company or organization",
        placeholder: "Where you worked",
        max: 200,
      },
      { key: "start", label: "Start month", type: "month" },
      { key: "end", label: "End month", type: "month" },
      {
        key: "current",
        label: "I currently work here",
        type: "checkbox",
        wide: true,
      },
      {
        key: "details",
        label: "Responsibilities, tools and results",
        placeholder:
          "Built REST APIs with Spring Boot and MySQL; reduced response time by 20%.",
        type: "textarea",
        max: 6000,
        wide: true,
      },
    ],
  },
  {
    key: "projectEntries",
    id: "projects",
    title: "Projects",
    singular: "project",
    legacy: "projects",
    limit: 15,
    description:
      "Explain what you built, the technologies you used and your own contribution. Academic and personal projects count.",
    fields: [
      {
        key: "name",
        label: "Project name",
        placeholder: "Library Management API",
        max: 200,
      },
      {
        key: "technologies",
        label: "Technologies (comma separated)",
        placeholder: "Java, Spring Boot, MySQL",
        max: 1000,
      },
      {
        key: "details",
        label: "Your contribution and outcome",
        placeholder:
          "Designed the database and implemented authenticated REST endpoints with tests.",
        type: "textarea",
        max: 6000,
        wide: true,
      },
      {
        key: "url",
        label: "Repository or live link (optional)",
        placeholder: "https://github.com/you/project",
        type: "url",
        max: 500,
        wide: true,
      },
    ],
  },
  {
    key: "certificationEntries",
    id: "certifications",
    title: "Certifications",
    singular: "certification",
    legacy: "certifications",
    limit: 15,
    description:
      "Add relevant certificates if you have them. This section is optional; a certificate is only assessed when the JD requests it.",
    fields: [
      {
        key: "name",
        label: "Certification name",
        placeholder: "Oracle Certified Java Programmer",
        max: 200,
      },
      {
        key: "issuer",
        label: "Issuing organization",
        placeholder: "Oracle",
        max: 200,
      },
      {
        key: "year",
        label: "Award year",
        placeholder: "2025",
        type: "year",
        max: 4,
      },
      {
        key: "url",
        label: "Credential link (optional)",
        placeholder: "https://…",
        type: "url",
        max: 500,
      },
      {
        key: "details",
        label: "Credential details (optional)",
        placeholder: "Relevant topics, credential ID, or expiry",
        type: "textarea",
        max: 4000,
        wide: true,
      },
    ],
  },
];
const blank = (s: Section): Row =>
  Object.fromEntries(
    s.fields.map((f) => [f.key, f.type === "checkbox" ? false : ""]),
  );
function initialRows(profile: Profile) {
  return Object.fromEntries(
    sections.map((s) => {
      const entries = profile[s.key];
      const rows =
        entries !== undefined
          ? entries.map((entry) =>
              Object.fromEntries(
                Object.entries(entry).map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.join(", ") : value,
                ]),
              ),
            )
          : profile[s.legacy]
            ? [{ ...blank(s), details: profile[s.legacy] }]
            : [];
      return [s.key, rows];
    }),
  ) as Record<Section["key"], Row[]>;
}
export function ResumeProfile() {
  const { user, refresh } = useAuth();
  const [rows, setRows] = useState(() => initialRows(user.profile));
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  function update(
    key: Section["key"],
    index: number,
    field: string,
    value: string | boolean,
  ) {
    setRows((p) => ({
      ...p,
      [key]: p[key].map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    }));
    setDirty(true);
    setSuccess("");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const entries = Object.fromEntries(
        sections.map((s) => [
          s.key,
          rows[s.key]
            .filter((r) =>
              Object.values(r).some((v) => typeof v === "string" && v.trim()),
            )
            .map((r) => ({
              ...r,
              ...(s.key === "projectEntries"
                ? { technologies: csv(String(r.technologies)) }
                : {}),
            })),
        ]),
      );
      await send(
        "/profile",
        {
          ...values,
          ...entries,
          education: "",
          experience: "",
          projects: "",
          certifications: "",
          expertise: user.profile.expertise || "",
          skills: csv(String(values.skills)),
          preferredRoles: csv(String(values.preferredRoles || "")),
          experienceYears:
            values.experienceYears === ""
              ? null
              : Number(values.experienceYears),
        },
        "PATCH",
      );
      await refresh();
      setDirty(false);
      setSuccess(
        "Resume details saved. Future applications will use these details and your uploaded PDF.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR CANDIDATE PROFILE"
        title="Your resume, clearly."
        description="Tell us what you know and what you have built. Save your details, upload your PDF, then apply."
      />
      <div className="resume-layout">
        <aside className="resume-guide">
          <nav aria-label="Resume sections">
            {[
              ["personal", "Personal information"],
              ["skills", "Technical skills"],
              ...sections.map((s) => [s.id, s.title]),
              ["achievements", "Achievements"],
              ["upload", "Resume PDF"],
            ].map(([id, title], i) => (
              <a key={id} href={`#resume-${id}`}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {title}
              </a>
            ))}
          </nav>
          <div className="resume-ai-note">
            <Sparkles size={20} />
            <strong>Automatic AI screening</strong>
            <p>
              After you apply, AI compares your saved resume with the job
              description. Applications whose validated overall score meets the
              company’s threshold are automatically shortlisted. Missing skills
              lower the score and remain visible for HR review.
            </p>
            <Link to="/applications" className="text-link">
              Track your applications
            </Link>
          </div>
        </aside>
        <form
          className="resume-form"
          onSubmit={save}
          onChange={() => {
            setDirty(true);
            setSuccess("");
          }}
        >
          <ErrorBox message={error} />
          {success && (
            <div role="status" className="notice success">
              <Check size={18} />
              {success}
            </div>
          )}
          <fieldset disabled={busy || uploading}>
            <section id="resume-personal">
              <Panel
                title="Personal information"
                description="Contact details help the hiring team reach you. They are not scoring criteria."
              >
                <div className="form-grid">
                  <Field label="Full name">
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      defaultValue={user.name}
                    />
                  </Field>
                  <Field
                    label="Email"
                    hint="Your account email. Verification options are in Settings."
                  >
                    <input type="email" value={user.email} readOnly />
                  </Field>
                  <Field label="Phone (optional)">
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                      defaultValue={user.profile.phone}
                      placeholder="+91 …"
                    />
                  </Field>
                  <Field label="Location (optional)">
                    <input
                      name="location"
                      autoComplete="address-level2"
                      maxLength={150}
                      defaultValue={user.profile.location}
                      placeholder="City, country"
                    />
                  </Field>
                </div>
                <Field
                  label="Professional headline"
                  hint="A short introduction, not a full biography."
                >
                  <input
                    name="headline"
                    maxLength={200}
                    defaultValue={user.profile.headline}
                    placeholder="Java developer building reliable backend APIs"
                  />
                </Field>
              </Panel>
            </section>
            <section id="resume-skills">
              <Panel
                title="Technical skills"
                description="List skills you can explain or demonstrate. Use commas between technologies."
              >
                <Field
                  label="Your skills"
                  hint="Example: Java, Spring Boot, MySQL, REST APIs, Git"
                >
                  <input
                    name="skills"
                    required
                    maxLength={3000}
                    defaultValue={user.profile.skills.join(", ")}
                    placeholder="Java, Spring Boot, MySQL, REST APIs"
                  />
                </Field>
                <div className="form-grid">
                  <Field
                    label="Relevant professional experience (years)"
                    hint="Use 0 if you are a fresher. Leave empty if you are unsure."
                  >
                    <input
                      name="experienceYears"
                      type="number"
                      min={0}
                      max={80}
                      step="0.1"
                      defaultValue={user.profile.experienceYears ?? ""}
                      placeholder="e.g. 3"
                    />
                  </Field>
                  <Field
                    label="Preferred job roles (optional)"
                    hint="Used to describe your interests, not to award match points."
                  >
                    <input
                      name="preferredRoles"
                      defaultValue={user.profile.preferredRoles?.join(", ")}
                      maxLength={3000}
                      placeholder="Backend Developer, Java Developer"
                    />
                  </Field>
                </div>
              </Panel>
            </section>
            {sections.map((s) => (
              <section key={s.key} id={`resume-${s.id}`}>
                <Panel title={s.title} description={s.description}>
                  {rows[s.key].length === 0 && (
                    <p className="muted">No {s.singular} added yet.</p>
                  )}
                  {rows[s.key].map((row, index) => (
                    <fieldset className="resume-entry" key={index}>
                      <legend>
                        {s.title} {index + 1}
                      </legend>
                      <div className="form-grid">
                        {s.fields.map((f) => (
                          <div
                            className={f.wide ? "resume-wide" : ""}
                            key={f.key}
                          >
                            {f.type === "checkbox" ? (
                              <label className="checkbox-field">
                                <input
                                  type="checkbox"
                                  checked={!!row[f.key]}
                                  onChange={(e) =>
                                    update(
                                      s.key,
                                      index,
                                      f.key,
                                      e.target.checked,
                                    )
                                  }
                                />
                                {f.label}
                              </label>
                            ) : (
                              <Field label={f.label}>
                                {f.type === "textarea" ? (
                                  <textarea
                                    rows={3}
                                    maxLength={f.max}
                                    placeholder={f.placeholder}
                                    value={String(row[f.key] || "")}
                                    onChange={(e) =>
                                      update(
                                        s.key,
                                        index,
                                        f.key,
                                        e.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  <input
                                    type={
                                      f.type === "year"
                                        ? "text"
                                        : f.type || "text"
                                    }
                                    inputMode={
                                      f.type === "year" ? "numeric" : undefined
                                    }
                                    pattern={
                                      f.type === "year"
                                        ? "(19|20)[0-9]{2}"
                                        : undefined
                                    }
                                    maxLength={f.max}
                                    placeholder={f.placeholder}
                                    value={String(row[f.key] || "")}
                                    disabled={f.key === "end" && !!row.current}
                                    onChange={(e) =>
                                      update(
                                        s.key,
                                        index,
                                        f.key,
                                        e.target.value,
                                      )
                                    }
                                  />
                                )}
                              </Field>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Remove ${s.singular} ${index + 1}`}
                        onClick={() => {
                          setRows((p) => ({
                            ...p,
                            [s.key]: p[s.key].filter((_, i) => i !== index),
                          }));
                          setDirty(true);
                        }}
                      >
                        <Trash2 size={15} />
                        Remove entry
                      </button>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={rows[s.key].length >= s.limit}
                    onClick={() => {
                      setRows((p) => ({
                        ...p,
                        [s.key]: [...p[s.key], blank(s)],
                      }));
                      setDirty(true);
                    }}
                  >
                    <Plus size={16} />
                    Add {s.singular}
                  </button>
                </Panel>
              </section>
            ))}
            <section id="resume-achievements">
              <Panel
                title="Achievements"
                description="Optional: include relevant awards, hackathons, open-source contributions or published work."
              >
                <Field label="Achievement details">
                  <textarea
                    name="achievements"
                    rows={3}
                    maxLength={4000}
                    defaultValue={user.profile.achievements}
                    placeholder="Won a campus hackathon by building an accessible booking app; implemented the backend and tests."
                  />
                </Field>
              </Panel>
            </section>
          </fieldset>
          <section id="resume-upload">
            <Panel
              title="Resume PDF"
              description="Upload one current PDF, up to 5 MB. It is read alongside the details above; uploading does not fill or replace your form."
            >
              <div className="resume-upload">
                <FileText size={30} />
                <div>
                  <strong>
                    {user.profile.resumeId
                      ? "Your resume is uploaded"
                      : "Add your resume PDF"}
                  </strong>
                  <p>
                    Keep dates, skills and experience consistent with your form.
                  </p>
                  {user.profile.resumeId && (
                    <a
                      className="text-link"
                      href={`/api/resumes/${user.profile.resumeId}`}
                    >
                      Download current PDF
                    </a>
                  )}
                </div>
              </div>
              <Field
                label={
                  user.profile.resumeId
                    ? "Replace resume PDF"
                    : "Upload resume PDF"
                }
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy || uploading}
                  onChange={async (e) => {
                    const input = e.currentTarget,
                      file = input.files?.[0];
                    if (!file) return;
                    setError("");
                    setSuccess("");
                    if (file.size > 5 * 1024 * 1024) {
                      setError("Choose a PDF smaller than 5 MB.");
                      input.value = "";
                      return;
                    }
                    setUploading(true);
                    const data = new FormData();
                    data.append("resume", file);
                    try {
                      await api("/profile/resume", {
                        method: "POST",
                        body: data,
                      });
                      await refresh();
                      setSuccess(
                        "PDF uploaded. Save any edited form details before applying.",
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setUploading(false);
                      input.value = "";
                    }
                  }}
                />
              </Field>
              {uploading && (
                <p role="status">
                  <Upload size={16} /> Reading your PDF…
                </p>
              )}
            </Panel>
          </section>
          <div className="resume-save">
            <span>
              {dirty
                ? "You have unsaved form changes."
                : "Each application keeps a copy of your submitted details."}
            </span>
            <Submit busy={busy || uploading}>Save resume details</Submit>
          </div>
          <p className="muted">
            Password, verification and notification preferences are in{" "}
            <Link to="/settings">Settings</Link>.
          </p>
        </form>
      </div>
    </>
  );
}
