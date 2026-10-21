import { expect, it } from "vitest";
import {
  qualityOptions,
  qualityStability,
} from "../scripts/ai-quality-evaluation";

it("rejects mistyped, duplicate or empty selected cases before a live model request", () => {
  for (const args of [
    ["--case=typo"],
    ["--case=known,known"],
    ["--case=known,"],
    ["--repeats=0"],
    ["--repeats=2.5"],
    ["--repeats=2", "--repeats=1"],
    ["--output=../outside"],
    ["--unknown=x"],
  ])
    expect(() => qualityOptions(args, ["known"])).toThrow();
  expect(
    qualityOptions(
      ["--case=known", "--repeats=3", "--output=repeat-check"],
      ["known"],
    ),
  ).toEqual({ selected: ["known"], repeats: 3, name: "repeat-check" });
});

it("records a failed model call and changed qualification outcomes without calling them stable", () => {
  const result = qualityStability(
    [
      {
        id: "a",
        repetition: 1,
        passed: true,
        output: {
          outcome: "shortlisted",
          match: { score: 100 },
          criteria: [{ id: "experience", status: "met" }],
        },
      },
      {
        id: "a",
        repetition: 2,
        passed: false,
        output: {
          outcome: "needs_review",
          match: { score: 75 },
          criteria: [{ id: "experience", status: "unknown" }],
        },
      },
      { id: "a", repetition: 3, passed: false },
    ],
    3,
  )[0];
  expect(result).toMatchObject({
    attempts: 3,
    passed: 1,
    failed: 2,
    complete: true,
    repeatabilityMeasured: true,
    distinctOutcomes: ["shortlisted", "needs_review"],
    scoreRange: { min: 75, max: 100 },
    differingCriteria: [{ id: "experience", statuses: ["met", "unknown"] }],
  });
});

it("does not claim repeatability from one sample or count absent scoring as zero", () => {
  const [single] = qualityStability(
    [
      {
        id: "sparse",
        repetition: 1,
        passed: true,
        output: { recommendation: "Needs Further Evaluation" },
      },
    ],
    2,
  );
  expect(single).toMatchObject({
    complete: false,
    repeatabilityMeasured: false,
    scoreRange: null,
  });
});
