import { describe, expect, it } from "vitest";
import { easyProblems } from "../server/question-bank/easy";

// Independently calculated examples, rather than trusting outputs produced by
// the reference functions during question construction.
const firstAnswers = [
  "10",
  "24",
  "7",
  "9",
  "EVEN",
  "YES",
  "120",
  "13",
  "10",
  "1024",
  "6",
  "24",
  "YES",
  "6",
  "15",
  "4321",
  "YES",
  "YES",
  "45",
  "101101",
  "2",
  "2",
  "YES",
  "6",
  "5",
  "90.0",
  "YES",
  "7",
  "5",
  "19",
  "11",
  "2 2 2",
  "7",
  "YES",
  "3 4 5 1 2",
  "7 5 3 1",
  "2 5 4 9",
  "8 8 8 4 4",
  "3\n1\n0",
  "4",
  "2",
  "2",
  "3",
  "1 3 2 0 0 0",
  "1 2 4 4 8 9",
  "1 2 4 9",
  "3 5",
  "1 2 3 4",
  "1",
  "17 5 2",
  "3",
  "coding is fun",
  "three two one",
  "YES",
  "YES",
  "1",
  "a3b2c1",
  "aaabbc",
  "ca",
  "YES",
  "abcdef",
  "green",
  "Hello World",
  "3 1 0 0 0 0 0 0 0 0 0 0 0 2 0 0 0 0 0 0 0 0 0 0 0 0",
  "3",
  "fl",
  "YES",
  "hELLO 123!",
  "user_name",
  "2",
  "6\n15",
  "1 4\n2 5\n3 6",
  "15",
  "YES",
  "40",
  "1 1",
  "6 8\n10 12",
  "YES",
  "3 1\n4 2",
  "X",
  "1",
  "3",
  "2",
  "0 1",
  "5",
  "3",
  "3",
  "YES",
  "YES",
  "3",
  "YES",
  "4\n4\n7",
  "7\n7\n4",
  "1994",
  "3",
  "-1",
  "1 1 1 1",
  "2",
  "YES",
  "YES",
];
const get = (id: string) => easyProblems.find((p) => p.id === `easy-${id}`)!;

describe("100 easy practice tasks", () => {
  it("has 100 distinct task IDs/titles with explicit contracts and public/hidden fixtures", () => {
    expect(easyProblems).toHaveLength(100);
    expect(new Set(easyProblems.map((p) => p.id)).size).toBe(100);
    expect(new Set(easyProblems.map((p) => p.title)).size).toBe(100);
    for (const p of easyProblems) {
      expect(p.difficulty).toBe("Easy");
      expect(p.description).toContain("Input");
      expect(p.description).toMatch(/Output|output/);
      expect(p.constraints.trim().length).toBeGreaterThan(10);
      expect(p.examples).toHaveLength(2);
      expect(p.tests.filter((t) => t.hidden).length).toBeGreaterThanOrEqual(3);
      expect(new Set(p.tests.map((t) => t.input)).size).toBe(p.tests.length);
      for (const t of p.tests) {
        expect(p.solve(t.input)).toBe(t.output);
        expect(t.output).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });
  it.each(easyProblems.map((p, i) => ({ p, answer: firstAnswers[i] })))(
    "$p.title has a checked example",
    ({ p, answer }) => {
      expect(answer).toBeDefined();
      expect(p.solve(p.examples[0].input)).toBe(answer);
    },
  );
  it("agrees with an independent coin-change DP for every amount through 500", () => {
    const dp = Array(501).fill(Infinity);
    dp[0] = 0;
    for (let x = 1; x <= 500; x++)
      for (const coin of [1, 2, 5, 10, 20, 50, 100])
        if (coin <= x) dp[x] = Math.min(dp[x], dp[x - coin] + 1);
    for (let x = 0; x <= 500; x++)
      expect(get("coin-count").solve(String(x))).toBe(String(dp[x]));
  });
  it("finds each omitted element in small complete ranges", () => {
    for (let n = 1; n <= 20; n++)
      for (let missing = 1; missing <= n; missing++) {
        const a = Array.from({ length: n }, (_, i) => i + 1)
          .filter((x) => x !== missing)
          .reverse();
        expect(get("missing-value").solve(`${n}\n${a.join(" ")}`)).toBe(
          String(missing),
        );
      }
  });
  it("handles independent boundary and tie cases", () => {
    for (const [id, input, answer] of [
      ["factorial", "15", "1307674368000"],
      ["clock-angle", "23 59", "5.5"],
      ["factorial-zeroes", "1000000000", "249999998"],
      ["balance-index", "3\n2 -2 0", "2"],
      ["two-sum", "4 4\n2 2 2 2", "0 1"],
      ["majority", "4\n1 1 2 2", "NONE"],
      ["query-frequencies", "0\n2\n0 -1", "0\n0"],
      ["date-validity", "29 2 2000", "YES"],
      ["date-validity", "29 2 2100", "NO"],
      ["tic-tac-toe", "XOX\nOXO\nOXO", "DRAW"],
      ["closest-temperature", "2\n-8 8", "8"],
      ["insertion-position", "3\n2 2 2\n2", "0"],
      ["compare-versions", "0001.0000\n1", "0"],
      ["cancel-neighbors", "aaaa", "EMPTY"],
      ["common-prefix", "2\n\nabc", "EMPTY"],
    ])
      expect(get(id).solve(input)).toBe(answer);
  });
});
