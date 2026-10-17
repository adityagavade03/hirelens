import type { Problem, Question } from "../shared/types.js";
import { randomUUID } from "node:crypto";
import { blankStarters } from "../shared/languages.js";
export const problems: Record<
  string,
  Problem & { tests: { input: string; output: string; hidden: boolean }[] }
> = {
  "sum-pairs": {
    id: "sum-pairs",
    title: "Pair sum",
    difficulty: "Easy",
    description:
      "Read two integers from standard input, separated by a space, and print their sum. Write a complete program. This warm-up checks input parsing and correctness.",
    constraints: "−1,000,000 ≤ a, b ≤ 1,000,000. Print one integer.",
    examples: [
      { input: "4 7", output: "11" },
      { input: "-3 8", output: "5" },
    ],
    starter: {
      ...blankStarters,
      python: "# Read two integers and print their sum\n",
      javascript: '// Read stdin with require("fs").readFileSync(0, "utf8")\n',
      java: "import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    // Read input and print the sum\n  }\n}\n",
    },
    tests: [
      { input: "4 7", output: "11", hidden: false },
      { input: "-3 8", output: "5", hidden: false },
      { input: "0 0", output: "0", hidden: true },
      { input: "-1000000 1000000", output: "0", hidden: true },
    ],
  },
  "unique-count": {
    id: "unique-count",
    title: "Distinct values",
    difficulty: "Medium",
    description:
      "Read an integer n on the first line and n space-separated integers on the second. Print the number of distinct values.",
    constraints: "1 ≤ n ≤ 100,000. Values are integers between −10^9 and 10^9.",
    examples: [{ input: "6\n1 2 2 3 3 4", output: "4" }],
    starter: {
      ...blankStarters,
      python: "# Read n and the values. Print the distinct count.\n",
      javascript: "// Read stdin and count distinct values.\n",
      java: "import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n  }\n}\n",
    },
    tests: [
      { input: "6\n1 2 2 3 3 4", output: "4", hidden: false },
      { input: "1\n0", output: "1", hidden: true },
      { input: "5\n-1 -1 0 1 1", output: "3", hidden: true },
    ],
  },
};
export const publicProblems = () =>
  Object.values(problems).map(({ tests, ...problem }) => problem);
export function curatedQuestions(topics: string[]): Question[] {
  return (topics.length ? topics : ["Problem solving", "API design", "Testing"])
    .slice(0, 5)
    .map((topic) => ({
      id: randomUUID(),
      topic,
      text: `Describe a project where you used ${topic}. Explain one technical decision, its alternatives, and how you tested the outcome.`,
      rubric: [
        "Explain the technical mechanism accurately",
        "Connect the decision to concrete project evidence",
        "Discuss trade-offs and verification",
      ],
      source: "curated",
    }));
}
