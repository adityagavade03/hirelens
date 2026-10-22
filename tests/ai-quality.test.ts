import { afterEach, expect, it, vi } from "vitest";
import { config } from "../server/config";
import { assessInterviewEvidence } from "../server/assessment";
import { InterviewModel, ReportModel } from "../server/models";
import {
  resumeQualityCases,
  reportQualityCases,
} from "../scripts/ai-quality-cases";

const original = { ...config };
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, original);
});
function modelResult(override: Record<string, unknown> = {}) {
  Object.assign(config, {
    llmUrl: "https://synthetic.example.test/v1",
    llmKey: "synthetic",
    llmModel: "synthetic",
  });
  const metric = {
    score: 4,
    explanation: "The answer states the expected complexity.",
    evidenceRefs: ["answer:hash"],
  };
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Synthetic regression response.",
                technical: metric,
                problemSolving: metric,
                communication: metric,
                strengths: ["Explains the algorithm"],
                weaknesses: [],
                improvements: [],
                recommendation: "Strong Candidate",
                recommendationReason: "Subject to human evidence review.",
                limitations: ["Small synthetic example."],
                ...override,
              }),
            },
          },
        ],
      }),
      { status: 200 },
    ),
  );
}
it("keeps benchmark fixtures synthetic and covers distinct required qualification failures", () => {
  expect(resumeQualityCases.length).toBeGreaterThanOrEqual(12);
  expect(new Set(resumeQualityCases.map((c) => c.id)).size).toBe(
    resumeQualityCases.length,
  );
  for (const id of [
    "insufficient-years",
    "unknown-years",
    "conflicting-years",
    "unrelated-degree",
    "missing-certification",
    "resume-injection",
  ])
    expect(resumeQualityCases.find((c) => c.id === id)?.expected).toBe(
      "needs_review",
    );
  const missingSpring = resumeQualityCases.find(
    (c) => c.id === "missing-spring",
  )!;
  expect(missingSpring.expected).toEqual(["shortlisted", "needs_review"]);
  expect(missingSpring.job.shortlistThreshold).toBe(10);
  expect(missingSpring.criteria["skill-1"]).toEqual([
    "partial",
    "missing",
    "unknown",
  ]);
  const javascript = resumeQualityCases.find(
    (c) => c.id === "javascript-not-java",
  )!;
  expect(javascript.expected).toEqual(["not_shortlisted", "needs_review"]);
  expect(javascript.criteria["skill-0"]).toEqual([
    "partial",
    "missing",
    "unknown",
  ]);
  expect(reportQualityCases.length).toBeGreaterThanOrEqual(4);
});
it("assesses report evidence without any database query or mutation", async () => {
  modelResult();
  const query = vi.spyOn(InterviewModel, "findById");
  const write = vi.spyOn(ReportModel, "updateOne");
  const c = JSON.parse(JSON.stringify(reportQualityCases[0]));
  const output = await assessInterviewEvidence(
    c.interview,
    c.submissions,
    c.transcript,
  );
  expect(output.technical.evidenceRefs).toEqual(["answer:hash"]);
  expect(output.coding).toEqual({
    score: 75,
    passed: 3,
    total: 4,
    ref: "submission:synthetic-code-1",
  });
  expect(output.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(query).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
it("forces a sparse report to further evaluation even if a provider recommends it strongly", async () => {
  modelResult({
    summary: "Invented collision strategy and O(1) knowledge.",
    strengths: ["Invented collision strategy"],
  });
  const c = JSON.parse(JSON.stringify(reportQualityCases[1]));
  const output = await assessInterviewEvidence(c.interview, [], []);
  expect(output.recommendation).toBe("Needs Further Evaluation");
  expect(output.limitations.join()).toContain("Incomplete assessment");
  expect(output.technical.score).toBeNull();
  expect(output.problemSolving.score).toBeNull();
  expect(output.communication.score).toBeNull();
  expect(output.strengths).toEqual([]);
  expect(JSON.stringify(output)).not.toContain("Invented collision strategy");
  expect(output.limitations.join()).toContain("160-character evidence floor");
});
it("rejects fabricated report references and absent evidence before persistence", async () => {
  const request = modelResult({
    technical: {
      score: 5,
      explanation: "Invented",
      evidenceRefs: ["answer:invented"],
    },
  });
  const c = JSON.parse(JSON.stringify(reportQualityCases[0]));
  await expect(
    assessInterviewEvidence(c.interview, c.submissions, []),
  ).rejects.toThrow("invalid assessment");
  request.mockClear();
  await expect(
    assessInterviewEvidence({ ...c.interview, answers: [] }, [], []),
  ).rejects.toThrow("No submitted answers");
  expect(request).not.toHaveBeenCalled();
});

it.each(["technical", "problemSolving", "communication"])(
  "still rejects a non-null %s score without references after hosted schema normalization",
  async (dimension) => {
    modelResult({
      [dimension]: {
        score: 4,
        explanation: "Unsupported score",
        evidenceRefs: [],
      },
    });
    const save = vi.spyOn(ReportModel, "updateOne");
    const fixture = structuredClone(
      reportQualityCases.find((row) => row.id === "grounded-strong-answers")!,
    );
    await expect(
      assessInterviewEvidence(
        fixture.interview,
        [...fixture.submissions],
        [...fixture.transcript],
      ),
    ).rejects.toThrow("referenced missing evidence");
    expect(save).not.toHaveBeenCalled();
  },
);
