import { useState, type FormEvent } from "react";
import type { Application, Job, User } from "../shared/types";
import { applicationInputSchema, resumeMaxBytes } from "../shared/application";
import { api, csv, send } from "./api";
import { ErrorBox, Field, Modal, Notice, Submit, formObject } from "./ui";
import "./application-form.css";

export function ApplicationForm({
  job,
  user,
  onClose,
  onSubmitted,
}: {
  job: Job;
  user: User;
  onClose: () => void;
  onSubmitted: (application: Application) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resumeMode, setResumeMode] = useState<"upload" | "saved">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [resumeRevision, setResumeRevision] = useState(0);
  const [uploaded, setUploaded] = useState<{
    file: File;
    resumeId: string;
  } | null>(null);
  const profile = user.profile;
  const [city = "", ...region] = profile.location
    .split(",")
    .map((v) => v.trim());

  function changeResumeMode(mode: "upload" | "saved") {
    setResumeMode(mode);
    setFile(null);
    setUploaded(null);
    setResumeRevision((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = formObject(event);
    setError("");
    const chosen =
      resumeMode === "saved" ? profile.resumeId : uploaded?.resumeId;
    // Validate all details before uploading a file. The real ID is checked again below.
    const parsed = applicationInputSchema.safeParse({
      ...fields,
      skills: csv(String(fields.skills || "")),
      experienceYears:
        fields.experienceYears === "" ? null : Number(fields.experienceYears),
      resumeId: chosen || "000000000000000000000000",
      resumeConfirmed: fields.resumeConfirmed === "on",
      detailsConfirmed: fields.detailsConfirmed === "on",
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    if (resumeMode === "upload" && !file) {
      setError("Select the PDF resume you want to submit for this job.");
      return;
    }
    if (
      file &&
      resumeMode === "upload" &&
      (!/\.pdf$/i.test(file.name) ||
        (file.type && file.type !== "application/pdf") ||
        file.size > resumeMaxBytes ||
        file.size === 0)
    ) {
      setError("Choose a non-empty PDF resume up to 5 MB.");
      return;
    }
    setBusy(true);
    try {
      let resumeId = chosen;
      if (resumeMode === "upload" && file && uploaded?.file !== file) {
        const body = new FormData();
        body.append("resume", file);
        const result = await api<{ resumeId: string }>(
          `/jobs/${job._id}/application-resume`,
          { method: "POST", body },
        );
        resumeId = result.resumeId;
        setUploaded({ file, resumeId });
      }
      const input = applicationInputSchema.parse({ ...parsed.data, resumeId });
      const result = await send<Application>(`/jobs/${job._id}/apply`, input);
      onSubmitted(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Apply for ${job.title}`} onClose={onClose} wide>
      <p>
        <strong>{job.companyName}</strong> · {job.location} · {job.employment}
      </p>
      <Notice>
        Review the details below and choose a resume for this job. Your
        application is saved separately from your profile. AI compares this
        submission with the job requirements; the shortlist threshold is{" "}
        {job.shortlistThreshold ?? 80}%. A validated overall score at or above
        this threshold can qualify even with missing skills; gaps remain visible
        for HR review.
      </Notice>
      <form onSubmit={submit} className="application-form">
        <fieldset disabled={busy} className="application-fields">
          <legend>Your contact details</legend>
          <div className="form-grid">
            <Field label="Full name">
              <input
                name="name"
                autoComplete="name"
                defaultValue={user.name}
                required
                minLength={2}
                maxLength={100}
              />
            </Field>
            <Field
              label="Email address"
              hint="For this application. Your verified sign-in email and notification settings stay unchanged."
            >
              <input
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={user.email}
                required
                maxLength={254}
              />
            </Field>
            <Field
              label="Phone number"
              hint="Include country code, e.g. +91 98765 43210."
            >
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={profile.phone}
                required
                maxLength={40}
              />
            </Field>
            <Field label="Current city">
              <input
                name="city"
                autoComplete="address-level2"
                defaultValue={city}
                required
                maxLength={100}
              />
            </Field>
            <Field label="State or region">
              <input
                name="state"
                autoComplete="address-level1"
                defaultValue={region.join(", ")}
                required
                maxLength={100}
              />
            </Field>
          </div>
        </fieldset>
        <fieldset disabled={busy} className="application-fields">
          <legend>Your qualifications for this role</legend>
          <Field
            label="Educational qualifications"
            hint="Include your qualification, subject, institution and graduation year, or current studies."
          >
            <textarea
              name="education"
              rows={3}
              defaultValue={profile.education}
              required
              minLength={2}
              maxLength={4000}
            />
          </Field>
          <Field
            label="Relevant skills"
            hint="Separate skills with commas. Include only skills you can explain or demonstrate."
          >
            <input
              name="skills"
              defaultValue={profile.skills.join(", ")}
              required
              maxLength={3030}
              placeholder="Java, Spring Boot, SQL, REST APIs"
            />
          </Field>
          <Field
            label="Years of relevant experience"
            hint="Enter 0 if you are a fresher. Leave blank if not applicable."
          >
            <input
              name="experienceYears"
              type="number"
              min={0}
              max={80}
              step="0.1"
              defaultValue={profile.experienceYears ?? ""}
            />
          </Field>
          <Field
            label="Relevant work experience"
            hint="Optional. Describe roles, dates, responsibilities and results; internships are welcome."
          >
            <textarea
              name="experience"
              rows={4}
              defaultValue={profile.experience}
              maxLength={6000}
            />
          </Field>
          <Field
            label="Relevant projects"
            hint="Optional. Explain your contribution, technologies used and outcomes."
          >
            <textarea
              name="projects"
              rows={3}
              defaultValue={profile.projects}
              maxLength={6000}
            />
          </Field>
          <div className="form-grid">
            <Field label="Certifications (optional)">
              <textarea
                name="certifications"
                rows={3}
                defaultValue={profile.certifications}
                maxLength={4000}
              />
            </Field>
            <Field label="Achievements (optional)">
              <textarea
                name="achievements"
                rows={3}
                defaultValue={profile.achievements}
                maxLength={4000}
              />
            </Field>
          </div>
          {job.additionalRequirements && (
            <div className="screening-banner">
              <strong>Additional job requirements</strong>
              <p className="prose-text">{job.additionalRequirements}</p>
            </div>
          )}
          <Field
            label="Additional information for this job"
            hint="Optional. Add relevant evidence or answer the additional job requirements above."
          >
            <textarea name="additionalInformation" rows={3} maxLength={6000} />
          </Field>
        </fieldset>
        <fieldset disabled={busy} className="application-fields">
          <legend>Choose the resume for this application</legend>
          <label className="application-choice">
            <input
              type="radio"
              name="resumeMode"
              value="upload"
              checked={resumeMode === "upload"}
              onChange={() => changeResumeMode("upload")}
            />
            Upload a PDF for this job
          </label>
          {profile.resumeId && (
            <label className="application-choice">
              <input
                type="radio"
                name="resumeMode"
                value="saved"
                checked={resumeMode === "saved"}
                onChange={() => changeResumeMode("saved")}
              />
              Use my saved profile resume after reviewing it
            </label>
          )}
          {resumeMode === "upload" ? (
            <Field
              label="PDF resume"
              hint="PDF only · maximum 5 MB · maximum 30 pages. Text must be readable."
            >
              <input
                name="resume"
                type="file"
                accept=".pdf,application/pdf"
                required={!file}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setUploaded(null);
                  setResumeRevision((v) => v + 1);
                }}
              />
            </Field>
          ) : (
            <p>
              <a
                href={`/api/resumes/${profile.resumeId}`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Open my saved PDF to review it
              </a>
            </p>
          )}
          <label
            className="application-choice"
            key={`${resumeMode}-${resumeRevision}`}
          >
            <input type="checkbox" name="resumeConfirmed" required />I have
            reviewed and chosen this resume for {job.title}.
          </label>
          <label className="application-choice">
            <input type="checkbox" name="detailsConfirmed" required />I confirm
            these application details are accurate and may be shared with this
            company for AI resume screening and recruitment.
          </label>
        </fieldset>
        <ErrorBox message={error} />
        {busy && (
          <p role="status">
            Saving your application and reading the selected resume…
          </p>
        )}
        <div className="form-actions">
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <Submit busy={busy}>Submit application</Submit>
        </div>
      </form>
    </Modal>
  );
}
