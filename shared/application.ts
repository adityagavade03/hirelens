import { z } from "zod";

export const resumeMaxBytes = 5 * 1024 * 1024;
const text = (max: number) => z.string().trim().max(max);
export const applicationInputSchema = z.object({
  name: text(100).min(2, "Enter your full name."),
  email: z
    .email("Enter a valid application email address.")
    .max(254)
    .transform((v) => v.toLowerCase()),
  phone: text(40).refine(
    (v) =>
      /^\+?[\d\s().-]+$/.test(v) &&
      v.replace(/\D/g, "").length >= 7 &&
      v.replace(/\D/g, "").length <= 15,
    "Enter a phone number with 7–15 digits, including country code where needed.",
  ),
  city: text(100).min(1, "Enter your current city."),
  state: text(100).min(1, "Enter your state or region."),
  education: text(4000).min(2, "Describe your educational qualifications."),
  experience: text(6000).default(""),
  experienceYears: z.number().min(0).max(80).nullable().default(null),
  skills: z
    .array(text(100).min(1))
    .min(1, "Add at least one relevant skill.")
    .max(30),
  projects: text(6000).default(""),
  certifications: text(4000).default(""),
  achievements: text(4000).default(""),
  additionalInformation: text(6000).default(""),
  resumeId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Choose the PDF resume for this application."),
  resumeConfirmed: z.literal(true, {
    error: "Confirm the resume you want to submit for this job.",
  }),
  detailsConfirmed: z.literal(true, {
    error: "Review and confirm your application details.",
  }),
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;
