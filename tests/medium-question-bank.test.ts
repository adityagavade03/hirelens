import { describe, expect, it } from "vitest";
import { mediumProblems } from "../server/question-bank/medium";

const byId = new Map(
  mediumProblems.map((problem) => [
    problem.id.replace(/^medium-/, ""),
    problem,
  ]),
);
const solve = (id: string, input: string) => byId.get(id)!.solve(input);

describe("Medium practice question bank", () => {
  it("contains exactly 100 distinct complete problems with public and hidden cases", () => {
    expect(mediumProblems).toHaveLength(100);
    expect(new Set(mediumProblems.map((p) => p.id)).size).toBe(100);
    expect(new Set(mediumProblems.map((p) => p.title)).size).toBe(100);
    for (const p of mediumProblems) {
      expect(p.difficulty).toBe("Medium");
      expect(p.id).toMatch(/^medium-[a-z0-9-]+$/);
      expect(p.description).toContain("Input:");
      expect(p.description).toContain("Output:");
      expect(p.description).toContain("standard input");
      expect(p.topic.length).toBeGreaterThanOrEqual(3);
      expect(p.constraints.length).toBeGreaterThan(15);
      expect(p.examples).toHaveLength(2);
      expect(p.tests.filter((t) => !t.hidden)).toHaveLength(2);
      expect(p.tests.filter((t) => t.hidden).length).toBeGreaterThanOrEqual(3);
      expect(new Set(p.tests.map((t) => t.input)).size).toBe(p.tests.length);
      for (const test of p.tests) {
        expect(test.input.length).toBeGreaterThan(0);
        expect(test.output.length).toBeGreaterThan(0);
        expect(test.output).not.toMatch(/NaN|Infinity|undefined/);
        expect(p.solve(test.input)).toBe(test.output);
      }
    }
  });

  it.each([
    ["maximum-subarray", "9\n-2 1 -3 4 -1 2 1 -5 4", "6"],
    ["maximum-product", "4\n2 3 -2 4", "6"],
    ["longest-zero-sum", "6\n1 2 -3 3 -3 4", "5"],
    ["subarray-target-count", "5 0\n1 -1 0 2 -2", "6"],
    ["divisible-subarrays", "6 5\n4 5 0 -2 -3 1", "7"],
    ["zero-sum-triplets", "6\n-1 0 1 2 -1 -4", "2"],
    ["triangle-count", "4\n2 2 3 4", "3"],
    ["water-container", "9\n1 8 6 2 5 4 8 3 7", "49"],
    ["trapped-water", "12\n0 1 0 2 1 0 1 3 2 1 2 1", "6"],
    ["kth-two-sorted", "3 4 4\n1 3 5\n2 4 6 8", "4"],
    ["shipping-capacity", "5 3\n1 2 3 4 5", "6"],
    ["bouquet-day", "6 2 3\n7 7 7 7 12 7", "12"],
    ["separated-stalls", "5 3\n1 2 8 4 9", "3"],
    ["kth-pair-distance", "3 1\n1 3 1", "0"],
    ["balanced-partition", "4\n1 6 11 5", "1"],
    ["meeting-rooms", "3\n0 30\n5 10\n15 20", "2"],
    ["interval-piercing", "4\n10 16\n2 8\n1 6\n7 12", "2"],
    ["car-fleets", "5 12\n10 2\n8 4\n0 1\n5 1\n3 3", "3"],
    ["gas-circuit", "5\n1 2 3 4 5\n3 4 5 1 2", "3"],
    ["minimum-jumps", "5\n3 2 1 0 4", "-1"],
    ["candy-allocation", "3\n1 0 2", "5"],
    ["task-cooldown", "2\nAAABBB", "8"],
    ["minimum-cover-window", "adobecodebanc\nabc", "4"],
    ["anagram-locations", "cbaebabacd\nabc", "0 6"],
    ["decode-bracket-string", "3[a2[c]]", "accaccacc"],
    ["remove-k-digits", "3\n1432219", "1219"],
    ["postfix-evaluation", "-7 3 /", "-2"],
    ["arithmetic-precedence", "14-3/2", "13"],
    ["brace-reversals", "}}{{", "2"],
    ["palindrome-substrings", "aaa", "6"],
    ["edit-distance", "horse\nros", "3"],
    ["interleaving-strings", "aabcc\ndbbca\naadbbbaccc", "NO"],
    ["subsequence-count", "rabbbit\nrabbit", "3"],
    ["permutation-rank", "cab", "5"],
    ["minimum-coins", "3 11\n1 2 5", "3"],
    ["coin-combinations", "3 5\n1 2 5", "4"],
    ["zero-one-knapsack", "3 5\n1 6\n2 10\n3 12", "22"],
    ["subset-target-count", "3 0\n0 0 0", "8"],
    ["signed-target", "5 3\n1 1 1 1 1", "5"],
    ["number-of-lis", "5\n1 3 5 4 7", "2"],
    ["rod-revenue", "8\n1 5 8 9 10 17 17 20", "22"],
    ["permutation-minimum-swaps", "4\n4 3 2 1", "2"],
    ["obstacle-paths", "3 3\n0 0 0\n0 1 0\n0 0 0", "2"],
    ["stock-cooldown", "5\n1 2 3 0 2", "3"],
    ["stock-transaction-fee", "6 2\n1 3 2 8 4 9", "8"],
    ["decode-ways", "11106", "2"],
    ["dice-total", "2 6 7", "6"],
    ["island-count", "3 3\n1 0 1\n0 1 0\n1 0 1", "5"],
    ["largest-island", "2 3\n1 1 1\n1 1 1", "6"],
    ["rotting-oranges", "3 3\n2 1 1\n1 1 0\n0 1 1", "4"],
    ["enclosed-regions", "3 3\n1 1 1\n1 0 1\n1 1 1", "1"],
    ["course-semesters", "4 3\n0 2\n1 2\n2 3", "3"],
    ["alternating-color-route", "3 2\n0 1 0\n1 2 1", "2"],
    ["unreachable-pairs", "5 2\n0 1\n2 3", "8"],
    ["grid-one-removal", "3 3\n0 1 0\n1 1 0\n0 0 0", "4"],
    ["jump-board", "8\n-1 0 0 0 0 0 0 -1", "-1"],
    ["tree-diameter", "5\n0 1\n1 2\n1 3\n3 4", "3"],
    ["tree-lca", "5\n0 1\n0 2\n1 3\n1 4\n3 4", "1"],
    ["zero-sum-submatrices", "2 2\n1 -1\n-1 1", "5"],
    ["validate-bst", "5\n5 1 2\n1 -1 -1\n6 3 4\n4 -1 -1\n7 -1 -1", "NO"],
    ["inversion-count", "5\n5 4 3 2 1", "10"],
    ["sliding-window-maximum", "8 3\n1 3 -1 -3 5 3 6 7", "3 3 5 5 6 7"],
    ["circular-next-greater", "3\n1 2 1", "2 -1 2"],
  ])("has independently checked output for %s", (id, input, expected) => {
    expect(solve(id, input)).toBe(expected);
  });

  it("agrees with exhaustive small-array oracles for several distinct array tasks", () => {
    for (let seed = 0; seed < 40; seed++) {
      const a = Array.from(
        { length: 5 },
        (_, i) => ((seed * 13 + i * i * 7 + i * seed) % 9) - 4,
      );
      const input = `${a.length}\n${a.join(" ")}`;
      const segments: number[][] = [];
      for (let l = 0; l < a.length; l++)
        for (let r = l + 1; r <= a.length; r++) segments.push(a.slice(l, r));
      expect(solve("maximum-subarray", input)).toBe(
        String(Math.max(...segments.map((b) => b.reduce((x, y) => x + y, 0)))),
      );
      expect(solve("maximum-product", input)).toBe(
        String(Math.max(...segments.map((b) => b.reduce((x, y) => x * y, 1)))),
      );
      expect(solve("longest-zero-sum", input)).toBe(
        String(
          Math.max(
            0,
            ...segments
              .filter((b) => b.reduce((x, y) => x + y, 0) === 0)
              .map((b) => b.length),
          ),
        ),
      );
      expect(solve("subarray-target-count", `5 2\n${a.join(" ")}`)).toBe(
        String(
          segments.filter((b) => b.reduce((x, y) => x + y, 0) === 2).length,
        ),
      );
      let inversions = 0;
      for (let i = 0; i < a.length; i++)
        for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inversions++;
      expect(solve("inversion-count", input)).toBe(String(inversions));
    }
  });
});
