import { afterEach, expect, it, vi } from "vitest";
import { assessmentNarrativeIssues } from "../server/assessment-narrative";
import { assessInterviewEvidence } from "../server/assessment";
import { config } from "../server/config";
import { ReportModel } from "../server/models";
import { reportQualityCases } from "../scripts/ai-quality-cases";
import { reportNarrativeQualityChecks } from "../scripts/ai-quality-evaluation";

const original = { ...config };
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(config, original);
});

function report() {
  return {
    technical: {
      score: 1,
      explanation: "The answer incorrectly says collisions never happen.",
      evidenceRefs: ["answer:hash"],
    },
    problemSolving: {
      score: 1,
      explanation:
        "The proposed random-entry search does not implement halving.",
      evidenceRefs: ["answer:search"],
    },
    communication: {
      score: 4,
      explanation: "The two explanations are direct, organized and followable.",
      evidenceRefs: ["answer:hash", "answer:search"],
    },
    summary:
      "The submitted explanations are clear but make specific technical errors.",
    strengths: ["Directly states the proposed approach"],
    weaknesses: ["The answer incorrectly says collisions never happen"],
    improvements: [
      "Review collision handling and the sorted-input precondition",
    ],
    recommendation: "Needs Further Evaluation",
    recommendationReason: "The supplied technical answers need further review.",
    limitations: ["Advanced topics were not assessed from these excerpts."],
  };
}
function providerReport(value = report()) {
  return {
    ...value,
    weaknesses: value.weaknesses.map((observation) => ({
      evidenceRef: "answer:hash",
      quote: "collisions never happen",
      observation,
    })),
  };
}

it.each([
  "The explanations are brief, contain factual errors, and lack clarity, showing poor communication of technical concepts.",
  "Communication is weak due to incorrect statements.",
  "The answers are wrong, so communication is poor.",
  "The answer is difficult to follow because of factual errors.",
  "Followable despite factual errors, but incorrect answers show poor communication.",
])("rejects correctness as the basis of communication: %s", (explanation) => {
  const value = report();
  value.communication.explanation = explanation;
  expect(assessmentNarrativeIssues(value)).toContain(
    "Communication explanation judges technical correctness.",
  );
});

it.each([
  "No communication examples",
  "No evidence of handling edge cases or advanced topics",
  "No demonstration of coding beyond a trivial function",
  "The candidate did not mention sorted input.",
  "The response fails to explain the empty-interval condition.",
])("rejects an excerpt-based absence conclusion: %s", (weakness) => {
  const value = report();
  value.weaknesses = [weakness];
  expect(assessmentNarrativeIssues(value)).toContain(
    "A conclusion makes a categorical absence claim from excerpted evidence.",
  );
});

it("allows evidenced technical errors, independently clear communication, and scoped unassessed limitations", () => {
  expect(assessmentNarrativeIssues(report())).toEqual([]);
});

it.each([
  "Both answers are concise and use simple sentences, making them easy to read. The structure is clear, though the content is incorrect. The explanations are followable despite factual errors.",
  "The response is organized and easy to follow regardless of incorrect statements.",
])(
  "does not reject explicit clarity/correctness separation: %s",
  (explanation) => {
    const value = report();
    value.communication.explanation = explanation;
    expect(assessmentNarrativeIssues(value)).toEqual([]);
    expect(
      reportNarrativeQualityChecks("wrong-answers-injection", value),
    ).toEqual([{ label: expect.any(String), passed: true }]);
  },
);

it("also checks metric explanations rather than only the weaknesses list", () => {
  const value = report();
  value.problemSolving.explanation = "No evidence of reasoning.";
  expect(assessmentNarrativeIssues(value)).toHaveLength(1);
});

it.each([
  [
    "wrong-answers-injection",
    "communication",
    "The explanations contain factual errors and lack clarity.",
  ],
  ["reviewed-transcript-only", "weaknesses", "No communication examples"],
  [
    "grounded-strong-answers",
    "weaknesses",
    "No evidence of handling edge cases or advanced topics",
  ],
])(
  "makes the previously missed %s narrative failure visible in the benchmark",
  (id, field, badText) => {
    const value = report();
    if (field === "communication") value.communication.explanation = badText;
    else value.weaknesses = [badText];
    expect(reportNarrativeQualityChecks(id, value)).toEqual([
      { label: expect.any(String), passed: false },
    ]);
  },
);

it.each([
  [
    "communication",
    "The explanations contain factual errors and lack clarity.",
  ],
  ["weaknesses", "No communication examples"],
  ["weaknesses", "No evidence of handling edge cases or advanced topics"],
])(
  "does not save a report that repeats the retained %s narrative failure",
  async (field, badText) => {
    Object.assign(config, {
      llmUrl: "https://synthetic.example.test/v1",
      llmKey: "synthetic",
      llmModel: "synthetic",
    });
    const value = report();
    if (field === "communication") value.communication.explanation = badText;
    else value.weaknesses = [badText];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify(providerReport(value)) } },
          ],
        }),
      ),
    );
    const save = vi.spyOn(ReportModel, "updateOne");
    const fixture = structuredClone(
      reportQualityCases.find((row) => row.id === "wrong-answers-injection")!,
    );
    await expect(
      assessInterviewEvidence(fixture.interview, [], []),
    ).rejects.toMatchObject({ code: "UNGROUNDED_AI_REPORT", status: 502 });
    expect(save).not.toHaveBeenCalled();
  },
);

it("keeps a clear but technically wrong answer's independent communication score and requests the corrected contract", async () => {
  Object.assign(config, {
    llmUrl: "https://synthetic.example.test/v1",
    llmKey: "synthetic",
    llmModel: "synthetic",
  });
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(providerReport()) } }],
      }),
    ),
  );
  const fixture = structuredClone(
    reportQualityCases.find((row) => row.id === "wrong-answers-injection")!,
  );
  const result = await assessInterviewEvidence(fixture.interview, [], []);
  expect(result.technical.score).toBe(1);
  expect(result.communication.score).toBe(4);
  expect(result.rubricVersion).toBe("content-rubric-v2");
  expect(result.summary).toContain("2 submitted answer excerpt(s)");
  expect(result.summary).not.toBe(report().summary);
  expect(result.weaknesses[0]).toContain(
    "Candidate evidence (answer:hash): “collisions never happen”",
  );
  const body = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(body.messages[0].content).toContain(
    "A technically false answer can be stated clearly.",
  );
  expect(body.messages[0].content).toContain(
    "EVIDENCE COVERAGE IS A LIMITATION, NOT A PERFORMANCE WEAKNESS",
  );
});

it.each(["This quote never occurred", "Describe a collision strategy", "   "])(
  "rejects an unverifiable or empty weakness quotation: %s",
  async (quote) => {
    Object.assign(config, {
      llmUrl: "https://synthetic.example.test/v1",
      llmKey: "synthetic",
      llmModel: "synthetic",
    });
    const value = providerReport();
    value.weaknesses[0].quote = quote;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(value) } }],
        }),
      ),
    );
    const fixture = structuredClone(
      reportQualityCases.find((row) => row.id === "wrong-answers-injection")!,
    );
    await expect(
      assessInterviewEvidence(fixture.interview, [], []),
    ).rejects.toMatchObject({ code: "UNGROUNDED_AI_REPORT" });
  },
);
