import { describe, expect, it } from "vitest";
import { hardProblems } from "../server/question-bank/hard";

// Fixed examples reviewed independently: small graph/tree/DP calculations and
// standard combinatorial identities. These literals are not computed by solve.
const expectedExamples = [
  "4",
  "9",
  "4500",
  "167",
  "1",
  "2",
  "YES",
  "2",
  "14",
  "7",
  "11",
  "16",
  "142",
  "23",
  "21",
  "20",
  "3",
  "YES",
  "20",
  "6",
  "5",
  "YES",
  "3",
  "2",
  "1",
  "3",
  "bcde",
  "11",
  "2",
  "7",
  "5",
  "3",
  "2",
  "2",
  "1",
  "0",
  "1",
  "YES",
  "YES",
  "YES",
  "5",
  "1",
  "9",
  "12",
  "3",
  "4",
  "10",
  "3",
  "9",
  "2",
  "10",
  "7",
  "9",
  "1",
  "9",
  "5 3 5 5",
  "1",
  "1\n0\n2",
  "3 3 1 1",
  "7\n2",
  "10\n19",
  "1\n5",
  "7",
  "3\n2",
  "3",
  "1 -1 -1 3 5 6",
  "28",
  "7",
  "10",
  "6",
  "9",
  "3",
  "ababa",
  "abac",
  "2",
  "1\n1\n1\n1",
  "3",
  "aaacecaaa",
  "4",
  "1 3",
  "0",
  "5",
  "9",
  "5",
  "4",
  "6",
  "6",
  "55",
  "3",
  "3",
  "2",
  "2",
  "9",
  "10",
  "3",
  "6",
  "8",
  "2",
  "7",
  "3",
];
const problem = (id: string) =>
  hardProblems.find((p) => p.id === `hard-${id}`)!;

describe("100 original hard practice questions", () => {
  it("has exactly 100 unique complete questions with public and hidden fixtures", () => {
    expect(hardProblems).toHaveLength(100);
    expect(new Set(hardProblems.map((p) => p.id)).size).toBe(100);
    expect(new Set(hardProblems.map((p) => p.title)).size).toBe(100);
    for (const p of hardProblems) {
      expect(p.difficulty).toBe("Hard");
      expect(p.examples.length).toBeGreaterThanOrEqual(2);
      expect(p.tests.filter((t) => t.hidden).length).toBeGreaterThanOrEqual(3);
      expect(p.description).toContain("Input");
      expect(p.description).toMatch(/print/i);
      expect(p.constraints).toMatch(/\d/);
      for (const t of p.tests) {
        expect(t.output).not.toMatch(/NaN|Infinity|undefined/);
        expect(p.solve(t.input)).toBe(t.output);
      }
    }
  });
  it.each(hardProblems.map((p, i) => [p.id, p, expectedExamples[i]] as const))(
    "matches the reviewed example for %s",
    (_id, p, expected) => {
      expect(p.solve(p.examples[0].input)).toBe(expected);
    },
  );
  it("matches exhaustive histogram, bounded subarray and XOR enumeration", () => {
    for (const a of [[2, 1, 2], [0, 0], [-2, 4, -1, 3], [1, 3, 2, 7], [5]]) {
      let bounded = -Infinity;
      for (let i = 0; i < a.length; i++)
        for (let j = i; j < a.length; j++)
          bounded = Math.max(
            bounded,
            a.slice(i, j + 1).reduce((x, y) => x + y, 0),
          );
      expect(
        problem("bounded-length-subarray").solve(
          `${a.length} 1 ${a.length}\n${a.join(" ")}`,
        ),
      ).toBe(String(bounded));
      const positive = a.map(Math.abs);
      let area = 0,
        xor = 0;
      for (let i = 0; i < a.length; i++)
        for (let j = i; j < a.length; j++) {
          area = Math.max(
            area,
            Math.min(...positive.slice(i, j + 1)) * (j - i + 1),
          );
          xor = Math.max(
            xor,
            positive.slice(i, j + 1).reduce((x, y) => x ^ y, 0),
          );
        }
      expect(
        problem("histogram-rectangle").solve(
          `${a.length}\n${positive.join(" ")}`,
        ),
      ).toBe(String(area));
      expect(
        problem("maximum-subarray-xor").solve(
          `${a.length}\n${positive.join(" ")}`,
        ),
      ).toBe(String(xor));
    }
  });
  it("matches exhaustive substring and subsequence definitions on small strings", () => {
    for (const s of ["a", "ababa", "banana", "aabb", "abcd"]) {
      const subs = new Set<string>(),
        pals = new Set<string>();
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j <= s.length; j++) subs.add(s.slice(i, j));
      for (let mask = 1; mask < 1 << s.length; mask++) {
        const value = [...s].filter((_, i) => (mask >> i) & 1).join("");
        if (value === [...value].reverse().join("")) pals.add(value);
      }
      expect(problem("distinct-substrings").solve(s)).toBe(String(subs.size));
      if (!s.includes("n"))
        expect(problem("distinct-palindrome-subsequences").solve(s)).toBe(
          String(pals.size),
        );
      const sorted = [...subs].sort();
      sorted.forEach((value, i) =>
        expect(problem("kth-distinct-substring").solve(`${s} ${i + 1}`)).toBe(
          value,
        ),
      );
      expect(
        problem("kth-distinct-substring").solve(`${s} ${sorted.length + 1}`),
      ).toBe("NONE");
    }
  });
  it("matches complete subset XOR enumeration including dependent vectors", () => {
    for (const a of [[], [1, 2, 3], [7, 7], [2, 4, 8], [0, 0], [5, 9, 12]]) {
      const set = new Set<number>();
      for (let mask = 0; mask < 1 << a.length; mask++)
        set.add(a.reduce((x, v, i) => ((mask >> i) & 1 ? x ^ v : x), 0));
      const sorted = [...set].sort((a, b) => a - b);
      for (let k = 0; k <= sorted.length; k++)
        expect(
          problem("kth-distinct-subset-xor").solve(
            `${a.length} ${k}\n${a.join(" ")}`,
          ),
        ).toBe(k < sorted.length ? String(sorted[k]) : "NONE");
    }
  });
  it("handles exact large areas and known counting boundaries", () => {
    expect(
      problem("rectangle-union-area").solve(
        "1\n-1000000000 -1000000000 1000000000 1000000000",
      ),
    ).toBe("4000000000000000000");
    expect(problem("n-queens-count").solve("8")).toBe("92");
    expect(problem("balanced-parentheses-count").solve("20")).toBe(
      "6564120420",
    );
    expect(problem("neighbor-distinct-digits").solve("0")).toBe("1");
    expect(problem("huge-length-walks").solve("1 0 0")).toBe("1");
  });
});
