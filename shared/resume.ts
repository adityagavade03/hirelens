import { z } from "zod";

const text = (max = 1000) => z.string().trim().max(max);
const year = text(4).refine(
  (v) => !v || /^(19|20)\d{2}$/.test(v),
  "Use a four-digit year.",
);
const month = text(7).refine(
  (v) => !v || /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
  "Use year and month.",
);
const link = text(500).refine(
  (v) => !v || /^https?:\/\/[^\s]+$/i.test(v),
  "Use a full http or https link.",
);
export const educationEntry = z
  .object({
    qualification: text(150),
    field: text(150),
    institution: text(200),
    startYear: year,
    endYear: year,
    details: text(4000),
  })
  .refine(
    (v) => !v.startYear || !v.endYear || v.endYear >= v.startYear,
    "End year must follow start year.",
  );
export const experienceEntry = z
  .object({
    role: text(150),
    company: text(200),
    start: month,
    end: month,
    current: z.boolean(),
    details: text(6000),
  })
  .refine(
    (v) => v.current || !v.start || !v.end || v.end >= v.start,
    "End date must follow start date.",
  );
export const projectEntry = z.object({
  name: text(200),
  technologies: z.array(text(100).min(1)).max(30),
  details: text(6000),
  url: link,
});
export const certificationEntry = z.object({
  name: text(200),
  issuer: text(200),
  year,
  url: link,
  details: text(4000),
});
export const resumeFields = {
  educationEntries: z.array(educationEntry).max(10).optional(),
  experienceEntries: z.array(experienceEntry).max(15).optional(),
  projectEntries: z.array(projectEntry).max(15).optional(),
  certificationEntries: z.array(certificationEntry).max(15).optional(),
  achievements: text(4000).optional(),
};
export type EducationEntry = z.infer<typeof educationEntry>;
export type ExperienceEntry = z.infer<typeof experienceEntry>;
export type ProjectEntry = z.infer<typeof projectEntry>;
export type CertificationEntry = z.infer<typeof certificationEntry>;

/** Keep existing interview/report consumers compatible with the structured resume. */
export function resumeTextFields(p: {
  educationEntries?: EducationEntry[];
  experienceEntries?: ExperienceEntry[];
  projectEntries?: ProjectEntry[];
  certificationEntries?: CertificationEntry[];
}) {
  const join = (rows: string[][]) =>
    rows.map((r) => r.filter(Boolean).join(" · ")).join("\n\n");
  return {
    ...(p.educationEntries
      ? {
          education: join(
            p.educationEntries.map((e) => [
              e.qualification,
              e.field,
              e.institution,
              [e.startYear, e.endYear].filter(Boolean).join("–"),
              e.details,
            ]),
          ),
        }
      : {}),
    ...(p.experienceEntries
      ? {
          experience: join(
            p.experienceEntries.map((e) => [
              e.role,
              e.company,
              [e.start, e.current ? "Present" : e.end]
                .filter(Boolean)
                .join("–"),
              e.details,
            ]),
          ),
        }
      : {}),
    ...(p.projectEntries
      ? {
          projects: join(
            p.projectEntries.map((e) => [
              e.name,
              e.technologies.join(", "),
              e.details,
              e.url,
            ]),
          ),
        }
      : {}),
    ...(p.certificationEntries
      ? {
          certifications: join(
            p.certificationEntries.map((e) => [
              e.name,
              e.issuer,
              e.year,
              e.details,
              e.url,
            ]),
          ),
        }
      : {}),
  };
}
