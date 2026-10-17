// Explicit live check. Synthetic data only; no application or account is created.
import { analyzeResume } from "../server/screening.js";
import type { Profile } from "../shared/types.js";
import { writeFile } from "node:fs/promises";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const copy = await response
    .clone()
    .json()
    .catch(() => null);
  if (copy?.choices?.[0]?.message?.content)
    await writeFile(
      ".data/runtime/resume-live-ai-response.json",
      copy.choices[0].message.content,
    );
  return response;
};
const profile: Profile = {
  phone: "",
  location: "",
  headline: "Backend developer",
  education: "B.Tech in Computer Science",
  skills: ["Java", "Spring Boot", "MySQL", "REST APIs"],
  experienceYears: 3,
  experience:
    "3 years of professional experience developing Java backend services with Spring Boot, MySQL and REST APIs.",
  projects:
    "Built a library-management REST API with Java, Spring Boot and MySQL. Implemented SQL queries and integration tests.",
  certifications: "",
  expertise: "",
  achievements: "",
};
const result = await analyzeResume(
  {
    title: "Java Backend Developer",
    description:
      "Develop Java backend services with Spring Boot, SQL and REST API development. At least 2 years of relevant professional experience required. No specific education or certification is mandatory.",
    skills: ["Java", "Spring Boot", "SQL", "REST API"],
    preferredSkills: [],
    experience: "At least 2 years",
    education: "",
    additionalRequirements: "",
    shortlistThreshold: 80,
  },
  profile,
  `${profile.education}\nSkills: ${profile.skills.join(", ")}\n${profile.experience}\nProjects: ${profile.projects}`,
);
console.log(
  JSON.stringify(
    {
      score: result.match.score,
      outcome: result.outcome,
      criteria: result.criteria.map(({ label, status, explanation }) => ({
        label,
        status,
        explanation,
      })),
    },
    null,
    2,
  ),
);
if (result.outcome !== "shortlisted")
  throw new Error(
    "The configured LLM did not recognize the synthetic Java/SQL/REST and experience match. Inspect the criterion explanations.",
  );
console.log(
  "Passed: configured LLM recognized MySQL/SQL, REST APIs/REST API and 3 years against a 2-year requirement. No real recruitment data changed.",
);
