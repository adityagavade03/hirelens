import type { Match, Profile } from "../shared/types.js";
export function matchResume(
  skills: string[],
  profile: Pick<Profile, "skills" | "experience" | "projects"> &
    Partial<Profile>,
  text: string,
  requirements?: {
    experience?: string | null;
    education?: string | null;
    preferredSkills?: string[] | null;
  },
): Match {
  const unique = [...new Set(skills.map((s) => s.trim()).filter(Boolean))];
  const matching: string[] = [];
  const missing: string[] = [];
  const evidence: Match["evidence"] = [];
  for (const skill of unique) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    const index = text.search(expression);
    if (index >= 0) {
      matching.push(skill);
      evidence.push({
        skill,
        source: "Resume text",
        excerpt: text
          .slice(Math.max(0, index - 70), index + skill.length + 110)
          .replace(/\s+/g, " "),
      });
    } else if (
      profile.skills.some((s) => s.toLowerCase() === skill.toLowerCase())
    ) {
      matching.push(skill);
      evidence.push({
        skill,
        source: "Self-reported profile",
        excerpt: `Listed in submitted profile: ${skill}`,
      });
    } else missing.push(skill);
  }
  const skillScore = unique.length
    ? Math.round((matching.length / unique.length) * 100)
    : null;
  const minimum = requirements?.experience?.match(
    /(\d+(?:\.\d+)?)\s*(?:[–-]\s*\d+(?:\.\d+)?\s*)?\+?\s*years?/i,
  );
  const experienceScore =
    minimum && profile.experienceYears != null
      ? Math.round(
          Math.min(
            1,
            Number(minimum[1]) === 0
              ? 1
              : profile.experienceYears / Number(minimum[1]),
          ) * 100,
        )
      : null;
  const educationWords = [
    ...new Set(
      (requirements?.education || "").toLowerCase().match(/[a-z]{3,}/g) || [],
    ),
  ].filter(
    (w) =>
      ![
        "the",
        "and",
        "with",
        "required",
        "degree",
        "equivalent",
        "from",
        "in",
        "or",
      ].includes(w),
  );
  const educationText = `${profile.education || ""}`.toLowerCase();
  const educationScore =
    educationWords.length && educationText.trim()
      ? Math.round(
          (100 *
            educationWords.filter((w) =>
              new RegExp(`\\b${w}\\b`, "i").test(educationText),
            ).length) /
            educationWords.length,
        )
      : null;
  const preferred = requirements?.preferredSkills || [];
  const preferredMatch = preferred.length
    ? matchResume(preferred, profile, text)
    : null;
  const components = [
    {
      name: "Required skills",
      score: skillScore,
      weight: 60,
      evidence: `${matching.length} of ${unique.length} required skill mentions found.`,
    },
    {
      name: "Experience",
      score: experienceScore,
      weight: 20,
      evidence:
        experienceScore == null
          ? "Insufficient structured evidence; review the resume and experience details."
          : `${profile.experienceYears} self-reported years; minimum ${minimum![1]} years parsed from the job requirement.`,
    },
    {
      name: "Education",
      score: educationScore,
      weight: 15,
      evidence:
        educationScore == null
          ? "No comparable education information. Review manually."
          : "Keyword overlap with the submitted education field. This does not verify a qualification or equivalence.",
    },
    {
      name: "Preferred skills",
      score: preferredMatch?.score ?? null,
      weight: 5,
      evidence: preferredMatch
        ? `${preferredMatch.matching.length} of ${preferred.length} preferred skill mentions found.`
        : "No preferred skills specified.",
    },
  ];
  const measured = components.filter((c) => c.score != null);
  return {
    score: requirements
      ? measured.length
        ? Math.round(
            measured.reduce((n, c) => n + c.score! * c.weight, 0) /
              measured.reduce((n, c) => n + c.weight, 0),
          )
        : null
      : skillScore,
    ...(requirements ? { components } : {}),
    method: requirements
      ? "Evidence coverage weighted by required skills (60), experience (20), education keywords (15), and preferred skills (5). Unknown criteria are excluded and weights renormalized. This is a screening aid, not verified competence or a hiring probability."
      : "Required-skill coverage: matched distinct required skills ÷ distinct required skills × 100. A keyword match is evidence to review, not verified proficiency or a hiring probability.",
    matching,
    missing,
    evidence,
    limitations: [
      "Other evaluation criteria, equivalent qualifications, and project quality need human review. Missing evidence is not a failure. Scores are not comparable when different criteria have evidence.",
      "Experience and project quality require human review. Skill mentions and self-reported profile entries are not verified proficiency.",
      ...(missing.length
        ? [
            "Missing means not found in submitted text; it does not prove lack of ability.",
          ]
        : []),
      ...(!unique.length
        ? ["No required skills were defined; a score cannot be calculated."]
        : []),
    ],
  };
}
