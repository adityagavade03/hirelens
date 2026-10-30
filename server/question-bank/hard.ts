import type { PracticeDefinition } from "./types.js";

// Author-owned reference programs stay on the server. Only the statement,
// examples and blank language starters are returned by the public library.
const bank: PracticeDefinition[] = [];
type Solver = (input: string) => string | number | bigint;
const MOD = 1_000_000_007;
const numbers = (s: string) =>
  s.trim() ? s.trim().split(/\s+/).map(Number) : [];
const words = (s: string) => s.trim().split(/\s+/);
const array = (s: string) => {
  const a = numbers(s);
  return a.slice(1, a[0] + 1);
};
function add(
  id: string,
  title: string,
  topic: string,
  statement: string,
  constraints: string,
  solve: Solver,
  inputs: string[],
) {
  const run = (input: string) => String(solve(input));
  const tests = inputs.map((input, i) => ({
    input,
    output: run(input),
    hidden: i >= 2,
  }));
  bank.push({
    id: `hard-${id}`,
    title,
    difficulty: "Hard",
    topic,
    description: `${statement} Write a complete program that reads standard input and prints only the requested answer.`,
    constraints,
    examples: tests.slice(0, 2).map(({ input, output }) => ({ input, output })),
    tests,
    solve: run,
  });
}
function matrix(s: string) {
  const t = numbers(s),
    r = t[0],
    c = t[1];
  return Array.from({ length: r }, (_, i) =>
    t.slice(2 + i * c, 2 + (i + 1) * c),
  );
}
function graph(s: string, weighted = false) {
  const t = numbers(s),
    n = t[0],
    m = t[1],
    size = weighted ? 3 : 2;
  return {
    n,
    edges: Array.from({ length: m }, (_, i) =>
      t.slice(2 + i * size, 2 + (i + 1) * size),
    ),
  };
}
const popcount = (v: number) => {
  let n = 0;
  for (; v; v &= v - 1) n++;
  return n;
};
class DSU {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    return this.p[x] === x ? x : (this.p[x] = this.find(this.p[x]));
  }
  join(a: number, b: number) {
    a = this.find(a);
    b = this.find(b);
    if (a === b) return false;
    this.p[a] = b;
    return true;
  }
}

// 1--10: state-space and interval dynamic programming.
add(
  "tour-cost",
  "Minimum closed delivery tour",
  "Subset DP",
  "Input n followed by an n by n nonnegative cost matrix. Starting at vertex 0, visit every other vertex exactly once and return to 0. Print the minimum total cost; n=1 costs 0.",
  "1 <= n <= 15; costs <= 10000; diagonal costs are 0.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      a = Array.from({ length: n }, (_, i) =>
        t.slice(1 + i * n, 1 + (i + 1) * n),
      );
    if (n === 1) return 0;
    const d = Array.from({ length: 1 << n }, () => Array(n).fill(Infinity));
    d[1][0] = 0;
    for (let m = 1; m < 1 << n; m++)
      for (let u = 0; u < n; u++)
        if ((m >> u) & 1)
          for (let v = 1; v < n; v++)
            if (!((m >> v) & 1))
              d[m | (1 << v)][v] = Math.min(
                d[m | (1 << v)][v],
                d[m][u] + a[u][v],
              );
    return Math.min(...d[(1 << n) - 1].slice(1).map((x, i) => x + a[i + 1][0]));
  },
  [
    "3\n0 4 1\n2 0 3\n5 1 0",
    "2\n0 7\n3 0",
    "1\n0",
    "3\n0 0 0\n0 0 0\n0 0 0",
    "4\n0 2 9 4\n3 0 5 8\n7 1 0 6\n2 4 3 0",
  ],
);
add(
  "worker-assignment",
  "Minimum one-to-one worker assignment",
  "Subset DP",
  "Input n and an n by n matrix where entry i,j is the cost of giving job j to worker i. Assign each worker exactly one different job and print the minimum total cost.",
  "1 <= n <= 18; 0 <= costs <= 10000.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      d = Array(1 << n).fill(Infinity);
    d[0] = 0;
    for (let m = 0; m < 1 << n; m++) {
      const i = popcount(m);
      for (let j = 0; j < n; j++)
        if (!((m >> j) & 1))
          d[m | (1 << j)] = Math.min(d[m | (1 << j)], d[m] + t[1 + i * n + j]);
    }
    return d.at(-1)!;
  },
  [
    "3\n9 2 7\n6 4 3\n5 8 1",
    "2\n1 8\n4 2",
    "1\n0",
    "2\n5 5\n5 5",
    "3\n0 9 9\n9 0 9\n9 9 0",
  ],
);
add(
  "matrix-chain",
  "Parenthesize a matrix chain",
  "Interval DP",
  "Input n followed by n+1 dimensions p0 ... pn. Matrix i has dimensions p(i-1) by pi. Print the minimum scalar multiplications needed to multiply the chain.",
  "1 <= n <= 100; 1 <= dimensions <= 1000; answer fits a signed 64-bit integer.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      p = t.slice(1),
      d = Array.from({ length: n }, () => Array(n).fill(0));
    for (let len = 2; len <= n; len++)
      for (let l = 0; l + len <= n; l++) {
        const r = l + len - 1;
        d[l][r] = Infinity;
        for (let k = l; k < r; k++)
          d[l][r] = Math.min(
            d[l][r],
            d[l][k] + d[k + 1][r] + p[l] * p[k + 1] * p[r + 1],
          );
      }
    return d[0][n - 1];
  },
  ["3\n10 30 5 60", "2\n4 5 6", "1\n7 8", "4\n2 2 2 2 2", "4\n5 10 3 12 5"],
);
add(
  "burst-rewards",
  "Burst balloons for maximum reward",
  "Interval DP",
  "Input n followed by n positive balloon values. Bursting a balloon earns leftValue * value * rightValue using its current neighbors; missing neighbors have value 1. Print the maximum reward after bursting all balloons.",
  "0 <= n <= 120; 1 <= values <= 100.",
  (s) => {
    const a = [1, ...array(s), 1],
      n = a.length,
      d = Array.from({ length: n }, () => Array(n).fill(0));
    for (let len = 2; len < n; len++)
      for (let l = 0; l + len < n; l++) {
        const r = l + len;
        for (let k = l + 1; k < r; k++)
          d[l][r] = Math.max(d[l][r], d[l][k] + d[k][r] + a[l] * a[k] * a[r]);
      }
    return d[0][n - 1];
  },
  ["4\n3 1 5 8", "1\n5", "0", "3\n1 1 1", "3\n2 4 3"],
);
add(
  "palindrome-cuts",
  "Minimum cuts into palindromes",
  "Palindrome DP",
  "Input one nonempty lowercase string. Split it into palindromic substrings and print the minimum number of cuts between pieces.",
  "1 <= string length <= 1500.",
  (s) => {
    const a = s.trim(),
      n = a.length,
      p = Array.from({ length: n }, () => Array(n).fill(false)),
      d = Array(n + 1).fill(Infinity);
    d[0] = -1;
    for (let r = 0; r < n; r++)
      for (let l = 0; l <= r; l++)
        if (a[l] === a[r] && (r - l < 2 || p[l + 1][r - 1])) {
          p[l][r] = true;
          d[r + 1] = Math.min(d[r + 1], d[l] + 1);
        }
    return d[n];
  },
  ["aab", "racecar", "a", "abcde", "abacdc"],
);
add(
  "strange-printer",
  "Minimum overwrite-printer turns",
  "Interval DP",
  "Input one nonempty lowercase string. A printer turn writes one chosen character across any contiguous interval, overwriting earlier characters. Starting with a blank strip, print the minimum turns needed to obtain the string.",
  "1 <= length <= 150.",
  (s) => {
    const a = s.trim(),
      n = a.length,
      d = Array.from({ length: n }, () => Array(n).fill(0));
    for (let l = n - 1; l >= 0; l--) {
      d[l][l] = 1;
      for (let r = l + 1; r < n; r++) {
        d[l][r] = 1 + d[l + 1][r];
        for (let k = l + 1; k <= r; k++)
          if (a[k] === a[l])
            d[l][r] = Math.min(
              d[l][r],
              (k === l + 1 ? 0 : d[l + 1][k - 1]) + d[k][r],
            );
      }
    }
    return d[0][n - 1];
  },
  ["aba", "aaabbb", "x", "abcabc", "abacaba"],
);
add(
  "scramble-equivalence",
  "Recursive scrambled-string equivalence",
  "Memoized recursion",
  "Input two equal-length lowercase strings separated by whitespace. A scramble recursively splits a string into two nonempty parts and optionally swaps the parts. Print YES if the second string can result from scrambling the first, otherwise NO.",
  "1 <= length <= 25.",
  (s) => {
    const [a, b] = words(s),
      memo = new Map<string, boolean>();
    const f = (x: string, y: string): boolean => {
      if (x === y) return true;
      const key = x + "|" + y;
      if (memo.has(key)) return memo.get(key)!;
      if ([...x].sort().join("") !== [...y].sort().join("")) return false;
      for (let k = 1; k < x.length; k++)
        if (
          (f(x.slice(0, k), y.slice(0, k)) && f(x.slice(k), y.slice(k))) ||
          (f(x.slice(0, k), y.slice(-k)) && f(x.slice(k), y.slice(0, -k)))
        ) {
          memo.set(key, true);
          return true;
        }
      memo.set(key, false);
      return false;
    };
    return f(a, b) ? "YES" : "NO";
  },
  ["great rgeat", "abcde caebd", "a a", "ab ba", "abcd abce"],
);
add(
  "boolean-parentheses",
  "Count true expression parenthesizations",
  "Interval counting DP",
  "Input a valid expression made of T, F and binary operators &, |, ^ with no spaces or parentheses. Count fully parenthesized evaluations that yield true. Print the count modulo 1000000007.",
  "1 <= operands <= 100; operators occur between consecutive operands.",
  (s) => {
    const a = s.trim(),
      n = (a.length + 1) / 2,
      t = Array.from({ length: n }, () => Array(n).fill(0)),
      f = t.map((r) => r.slice());
    for (let i = 0; i < n; i++) (a[i * 2] === "T" ? t : f)[i][i] = 1;
    for (let len = 2; len <= n; len++)
      for (let l = 0; l + len <= n; l++) {
        const r = l + len - 1;
        for (let k = l; k < r; k++)
          for (let x = 0; x < 2; x++)
            for (let y = 0; y < 2; y++) {
              const ok =
                a[k * 2 + 1] === "&"
                  ? x & y
                  : a[k * 2 + 1] === "|"
                    ? x | y
                    : x ^ y;
              const d = ok ? t : f;
              d[l][r] = Number(
                (BigInt(d[l][r]) +
                  BigInt((x ? t : f)[l][k]) * BigInt((y ? t : f)[k + 1][r])) %
                  BigInt(MOD),
              );
            }
      }
    return t[0][n - 1];
  },
  ["T|F&T", "T^T^F", "T", "F", "T&T|F^T"],
);
add(
  "egg-dropping",
  "Minimum worst-case egg drops",
  "Coverage DP",
  "Input eggs and floors. Eggs survive below an unknown threshold and break above it. A broken egg cannot be reused. Print the minimum worst-case drops needed to determine the threshold among floors 0 through floors.",
  "1 <= eggs <= 50; 0 <= floors <= 1000000.",
  (s) => {
    const [e, n] = numbers(s),
      d = Array(e + 1).fill(0);
    let k = 0;
    while (d[e] < n) {
      k++;
      for (let j = e; j > 0; j--) d[j] = Math.min(n, d[j] + d[j - 1] + 1);
    }
    return k;
  },
  ["2 100", "3 14", "1 0", "1 7", "10 1000"],
);
add(
  "stock-transactions",
  "Maximum profit with limited transactions",
  "State-machine DP",
  "Input n and k followed by n daily prices. Complete at most k buy-then-sell transactions while holding at most one share. Print maximum profit; buying and selling on the same day is allowed but earns zero.",
  "0 <= n <= 2000; 0 <= k <= 100; 0 <= price <= 100000.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      k = Math.min(t[1], Math.floor(n / 2)),
      buy = Array(k + 1).fill(-Infinity),
      sell = Array(k + 1).fill(0);
    for (const p of t.slice(2))
      for (let j = 1; j <= k; j++) {
        buy[j] = Math.max(buy[j], sell[j - 1] - p);
        sell[j] = Math.max(sell[j], buy[j] + p);
      }
    return sell[k];
  },
  ["6 2\n3 2 6 5 0 3", "5 1\n7 6 4 3 1", "0 3", "1 4\n8", "5 0\n1 2 3 4 5"],
);

// 11--20: scheduling, merging and digit states.
add(
  "weighted-schedule",
  "Maximum reward without overlapping jobs",
  "Scheduling DP",
  "Input n followed by n triples start end reward. Select jobs whose half-open time intervals [start,end) do not overlap. Print the largest total reward; choosing no jobs is allowed.",
  "0 <= n <= 10000; 0 <= start < end <= 1000000; 0 <= reward <= 100000.",
  (s) => {
    const t = numbers(s),
      a = Array.from({ length: t[0] }, (_, i) =>
        t.slice(1 + 3 * i, 4 + 3 * i),
      ).sort((a, b) => a[1] - b[1]),
      d = [0];
    for (let i = 0; i < a.length; i++) {
      let l = 0,
        r = i;
      while (l < r) {
        const m = (l + r + 1) >> 1;
        if (a[m - 1][1] <= a[i][0]) l = m;
        else r = m - 1;
      }
      d.push(Math.max(d[i], d[l] + a[i][2]));
    }
    return d.at(-1)!;
  },
  [
    "3\n1 3 5\n2 5 10\n3 6 6",
    "2\n0 1 4\n1 2 7",
    "0",
    "1\n1 9 0",
    "4\n0 3 8\n1 2 5\n2 4 6\n4 7 4",
  ],
);
add(
  "stick-cuts",
  "Minimum total stick-cutting cost",
  "Interval DP",
  "Input stick length L, number c, then c distinct internal cut positions. Each cut costs the current piece length. Print the minimum cost to make all cuts in any order.",
  "1 <= L <= 1000000; 0 <= c <= 120; each position lies strictly between 0 and L.",
  (s) => {
    const t = numbers(s),
      a = [0, ...t.slice(2).sort((x, y) => x - y), t[0]],
      n = a.length,
      d = Array.from({ length: n }, () => Array(n).fill(0));
    for (let len = 2; len < n; len++)
      for (let l = 0; l + len < n; l++) {
        let r = l + len;
        d[l][r] = Infinity;
        for (let k = l + 1; k < r; k++)
          d[l][r] = Math.min(d[l][r], a[r] - a[l] + d[l][k] + d[k][r]);
      }
    return d[0][n - 1];
  },
  ["7 4\n1 3 4 5", "10 1\n4", "5 0", "9 3\n6 2 4", "2 1\n1"],
);
add(
  "optimal-search-tree",
  "Optimal ordered search tree",
  "Interval DP",
  "Input n and n nonnegative search frequencies for keys already in ascending key order. Build a binary search tree minimizing sum(frequency * depth), with the root at depth 1. Print this minimum weighted cost.",
  "1 <= n <= 120; frequency <= 10000; no unsuccessful-search frequencies are included.",
  (s) => {
    const a = array(s),
      n = a.length,
      p = [0],
      d = Array.from({ length: n }, () => Array(n).fill(0));
    a.forEach((x) => p.push(p.at(-1)! + x));
    for (let len = 1; len <= n; len++)
      for (let l = 0; l + len <= n; l++) {
        const r = l + len - 1;
        d[l][r] = Infinity;
        for (let k = l; k <= r; k++)
          d[l][r] = Math.min(
            d[l][r],
            p[r + 1] -
              p[l] +
              (k > l ? d[l][k - 1] : 0) +
              (k < r ? d[k + 1][r] : 0),
          );
      }
    return d[0][n - 1];
  },
  ["3\n34 8 50", "2\n1 1", "1\n7", "3\n0 0 0", "4\n1 10 1 1"],
);
add(
  "remove-colored-boxes",
  "Remove colored boxes for square rewards",
  "Three-dimensional DP",
  "Input n followed by n integer colors. Remove any contiguous group of k equal colors for k*k points; remaining boxes close the gap. Print the largest possible total score.",
  "0 <= n <= 70; colors are integers from 1 through 20.",
  (s) => {
    const a = array(s),
      memo = new Map<string, number>();
    const f = (l: number, r: number, k: number): number => {
      if (l > r) return 0;
      while (l < r && a[r] === a[r - 1]) {
        r--;
        k++;
      }
      const key = [l, r, k].join(",");
      if (memo.has(key)) return memo.get(key)!;
      let best = f(l, r - 1, 0) + (k + 1) ** 2;
      for (let i = l; i < r; i++)
        if (a[i] === a[r])
          best = Math.max(best, f(l, i, k + 1) + f(i + 1, r - 1, 0));
      memo.set(key, best);
      return best;
    };
    return f(0, a.length - 1, 0);
  },
  ["9\n1 3 2 2 2 3 4 3 1", "3\n1 1 1", "0", "1\n5", "5\n1 2 1 2 1"],
);
add(
  "two-collectors",
  "Two robots collecting a grid",
  "Grid DP",
  "Input rows columns and the integer grid row by row. Two robots start at top-left and top-right. Each advances one row and changes its column by -1, 0 or 1. Collect visited values, counting a shared cell once. Print the maximum total at the bottom row.",
  "1 <= rows,columns <= 50; values are from 0 through 100.",
  (s) => {
    const a = matrix(s),
      r = a.length,
      c = a[0].length;
    let d = Array.from({ length: c }, () => Array(c).fill(-Infinity));
    d[0][c - 1] = a[0][0] + (c > 1 ? a[0][c - 1] : 0);
    for (let i = 1; i < r; i++) {
      const e = d.map((row) => row.map(() => -Infinity));
      for (let x = 0; x < c; x++)
        for (let y = 0; y < c; y++)
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) {
              const u = x + dx,
                v = y + dy;
              if (u >= 0 && u < c && v >= 0 && v < c)
                e[u][v] = Math.max(
                  e[u][v],
                  d[x][y] + a[i][u] + (u === v ? 0 : a[i][v]),
                );
            }
      d = e;
    }
    return Math.max(...d.flat());
  },
  [
    "3 3\n3 1 1\n2 5 1\n1 5 5",
    "2 1\n2\n3",
    "1 1\n0",
    "1 3\n2 100 4",
    "2 2\n1 2\n3 4",
  ],
);
add(
  "neighbor-distinct-digits",
  "Count numbers without equal adjacent digits",
  "Digit DP",
  "Input a nonnegative integer N. Count integers x in [0,N] whose usual decimal representation has no equal adjacent digits. Zero is valid. Print the exact count.",
  "0 <= N <= 10^15; leading zeroes do not form part of a representation.",
  (s) => {
    const a = s.trim(),
      memo = new Map<string, bigint>();
    const f = (i: number, p: number, t: boolean): bigint => {
      if (i === a.length) return 1n;
      const key = [i, p, t].join(",");
      if (memo.has(key)) return memo.get(key)!;
      let v = 0n;
      for (let d = 0; d <= (t ? +a[i] : 9); d++)
        if (p === 10 || d !== p)
          v += f(i + 1, p === 10 && d === 0 ? 10 : d, t && d === +a[i]);
      memo.set(key, v);
      return v;
    };
    return f(0, 10, true);
  },
  ["20", "100", "0", "9", "111"],
);
add(
  "digit-sum-bound",
  "Count bounded numbers with a target digit sum",
  "Digit DP",
  "Input N and target S. Count integers x in [0,N] whose decimal digits sum to S. Print the count modulo 1000000007; leading zeroes contribute zero.",
  "0 <= N <= 10^15; 0 <= S <= 135.",
  (s) => {
    const [a, b] = words(s),
      S = +b,
      memo = new Map<string, number>();
    const f = (i: number, left: number, t: boolean): number => {
      if (left < 0) return 0;
      if (i === a.length) return +(left === 0);
      const key = [i, left, t].join(",");
      if (memo.has(key)) return memo.get(key)!;
      let n = 0;
      for (let d = 0; d <= (t ? +a[i] : 9); d++)
        n = (n + f(i + 1, left - d, t && d === +a[i])) % MOD;
      memo.set(key, n);
      return n;
    };
    return f(0, S, true);
  },
  ["20 2", "100 1", "0 0", "9 10", "99 9"],
);
add(
  "equal-sum-buckets",
  "Partition into equal-sum nonempty groups",
  "Subset DP",
  "Input n and k followed by n positive integers. Partition every element into exactly k nonempty groups with identical sums. Print YES if possible, otherwise NO.",
  "1 <= k <= n <= 18; values <= 1000.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      k = t[1],
      a = t.slice(2),
      sum = a.reduce((x, y) => x + y, 0);
    if (sum % k) return "NO";
    const target = sum / k,
      d = Array(1 << n).fill(-1);
    d[0] = 0;
    for (let m = 0; m < 1 << n; m++)
      if (d[m] >= 0)
        for (let j = 0; j < n; j++)
          if (!((m >> j) & 1) && d[m] + a[j] <= target)
            d[m | (1 << j)] = (d[m] + a[j]) % target;
    return d.at(-1) === 0 ? "YES" : "NO";
  },
  [
    "7 4\n4 3 2 3 5 2 1",
    "4 3\n1 2 3 4",
    "1 1\n9",
    "4 4\n2 2 2 2",
    "5 2\n1 1 1 1 6",
  ],
);
add(
  "merge-k-piles",
  "Minimum cost to merge K adjacent piles",
  "Interval DP",
  "Input n and K followed by n positive pile sizes. One move replaces exactly K adjacent piles with their sum and costs that sum. Print the minimum total cost to leave one pile, or -1 if impossible.",
  "1 <= n <= 90; 2 <= K <= 10; pile sizes <= 1000.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      k = t[1],
      a = t.slice(2);
    if ((n - 1) % (k - 1)) return -1;
    const p = [0],
      d = Array.from({ length: n }, () => Array(n).fill(0));
    a.forEach((x) => p.push(p.at(-1)! + x));
    for (let len = k; len <= n; len++)
      for (let l = 0; l + len <= n; l++) {
        const r = l + len - 1;
        d[l][r] = Infinity;
        for (let m = l; m < r; m += k - 1)
          d[l][r] = Math.min(d[l][r], d[l][m] + d[m + 1][r]);
        if ((len - 1) % (k - 1) === 0) d[l][r] += p[r + 1] - p[l];
      }
    return d[0][n - 1];
  },
  ["4 2\n3 2 4 1", "4 3\n3 2 4 1", "1 3\n7", "3 3\n1 2 3", "5 3\n3 5 1 2 6"],
);
add(
  "distinct-palindrome-subsequences",
  "Count different palindromic subsequences",
  "Interval counting DP",
  "Input a nonempty string containing only a,b,c,d. Count distinct nonempty palindromic subsequence strings, modulo 1000000007. Different index selections producing the same string count once.",
  "1 <= length <= 500.",
  (s) => {
    const a = s.trim(),
      n = a.length,
      d = Array.from({ length: n }, () => Array(n).fill(0));
    for (let l = n - 1; l >= 0; l--) {
      d[l][l] = 1;
      for (let r = l + 1; r < n; r++) {
        let v;
        if (a[l] !== a[r])
          v = d[l + 1][r] + d[l][r - 1] - (r - l > 1 ? d[l + 1][r - 1] : 0);
        else {
          let x = l + 1,
            y = r - 1;
          while (x <= y && a[x] !== a[l]) x++;
          while (x <= y && a[y] !== a[l]) y--;
          v =
            2 * (r - l > 1 ? d[l + 1][r - 1] : 0) +
            (x > y ? 2 : x === y ? 1 : -(x + 1 <= y - 1 ? d[x + 1][y - 1] : 0));
        }
        d[l][r] = ((v % MOD) + MOD) % MOD;
      }
    }
    return d[0][n - 1];
  },
  ["bccb", "abcd", "a", "aaaa", "abacaba"],
);

// 21--30: language matching and resource-constrained dynamic programming.
add(
  "dictionary-segmentations",
  "Count dictionary segmentations",
  "Trie-style DP",
  "Input a lowercase string, integer m, then m distinct nonempty dictionary words. Count ways to split the entire string into dictionary words, modulo 1000000007. Words may be reused.",
  "1 <= string length <= 2000; 1 <= m <= 200; each word length <= 50.",
  (s) => {
    const t = words(s),
      a = t[0],
      dict = t.slice(2),
      d = Array(a.length + 1).fill(0);
    d[0] = 1;
    for (let i = 0; i < a.length; i++)
      for (const w of dict)
        if (a.startsWith(w, i))
          d[i + w.length] = (d[i + w.length] + d[i]) % MOD;
    return d[a.length];
  },
  [
    "aaaa 2\na aa",
    "catsanddog 5\ncat cats and sand dog",
    "a 1\na",
    "abc 2\na b",
    "aaaaa 3\na aa aaa",
  ],
);
add(
  "regular-expression",
  "Full match with dot and repetition",
  "Pattern DP",
  "Input a nonempty lowercase text and a valid nonempty pattern of lowercase letters, dot and star. Dot matches one character; star repeats the preceding atom zero or more times. Print YES only if the pattern matches the complete text.",
  "Text and pattern lengths <= 200; star never appears first or after another star.",
  (s) => {
    const [a, p] = words(s),
      d = Array.from({ length: a.length + 1 }, () =>
        Array(p.length + 1).fill(false),
      );
    d[0][0] = true;
    for (let j = 2; j <= p.length; j++)
      if (p[j - 1] === "*") d[0][j] = d[0][j - 2];
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= p.length; j++)
        d[i][j] =
          p[j - 1] === "*"
            ? d[i][j - 2] ||
              ((p[j - 2] === "." || p[j - 2] === a[i - 1]) && d[i - 1][j])
            : (p[j - 1] === "." || p[j - 1] === a[i - 1]) && d[i - 1][j - 1];
    return d[a.length][p.length] ? "YES" : "NO";
  },
  ["aab c*a*b", "mississippi mis*is*p*.", "a .", "ab .*", "abc ab"],
);
add(
  "palindrome-word-pairs",
  "Count ordered palindrome concatenation pairs",
  "Reverse-word lookup",
  "Input n followed by n distinct nonempty lowercase words. Count ordered pairs of different word indices (i,j) such that words[i]+words[j] is a palindrome. Print the count; a pair is counted once even if several split tests find it.",
  "0 <= n <= 10000; each word length <= 50; total input word length <= 100000.",
  (s) => {
    const t = words(s),
      a = t.slice(1),
      lookup = new Map(a.map((w, i) => [w, i])),
      pairs = new Set<string>(),
      pal = (w: string) => w === [...w].reverse().join("");
    for (let i = 0; i < a.length; i++)
      for (let k = 0; k <= a[i].length; k++) {
        const x = a[i].slice(0, k),
          y = a[i].slice(k);
        if (pal(x)) {
          const j = lookup.get([...y].reverse().join(""));
          if (j !== undefined && j !== i) pairs.add(j + "," + i);
        }
        if (pal(y)) {
          const j = lookup.get([...x].reverse().join(""));
          if (j !== undefined && j !== i) pairs.add(i + "," + j);
        }
      }
    return pairs.size;
  },
  ["5\nabc cba ll sssll s", "3\na aa b", "0", "1\naba", "3\nbat tab cat"],
);
add(
  "affine-gap-alignment",
  "Minimum global alignment cost with affine gaps",
  "Three-state sequence DP",
  "Input two nonempty lowercase strings A B, then gapOpen gapExtend mismatchCost. Align the complete strings using character pairs or gaps. Matching letters cost 0 and unequal paired letters cost mismatchCost. Each maximal run of L gap characters in either string costs gapOpen+(L-1)*gapExtend. Print minimum total cost.",
  "1 <= each string length <= 500; all three costs are integers in [1,10000]; gap-gap columns are forbidden.",
  (s) => {
    const [a, b, o, e, c] = words(s),
      open = +o,
      ext = +e,
      cost = +c,
      n = a.length,
      m = b.length;
    let M = Array(m + 1).fill(Infinity),
      X = M.slice(),
      Y = M.slice();
    M[0] = 0;
    for (let j = 1; j <= m; j++) Y[j] = open + (j - 1) * ext;
    for (let i = 1; i <= n; i++) {
      const N = Array(m + 1).fill(Infinity),
        U = N.slice(),
        V = N.slice();
      U[0] = open + (i - 1) * ext;
      for (let j = 1; j <= m; j++) {
        N[j] =
          Math.min(M[j - 1], X[j - 1], Y[j - 1]) +
          (a[i - 1] === b[j - 1] ? 0 : cost);
        U[j] = Math.min(M[j] + open, X[j] + ext, Y[j] + open);
        V[j] = Math.min(N[j - 1] + open, V[j - 1] + ext, U[j - 1] + open);
      }
      M = N;
      X = U;
      Y = V;
    }
    return Math.min(M[m], X[m], Y[m]);
  },
  [
    "abc adc\n3 1 2",
    "aaaa a\n3 1 9",
    "a a\n1 1 1",
    "a b\n10 1 7",
    "aaa b\n1 1 100",
  ],
);
add(
  "interleaving-count",
  "Count source-labelled interleavings",
  "Grid DP",
  "Input strings A, B, C. Count ways to form C by interleaving all characters of A and B while preserving each source order. Equal letters taken from different sources are different ways. Print modulo 1000000007; print 0 if lengths disagree.",
  "Each string is nonempty lowercase; |A|,|B| <= 500; |C| <= 1000.",
  (s) => {
    const [a, b, c] = words(s);
    if (a.length + b.length !== c.length) return 0;
    const d = Array.from({ length: a.length + 1 }, () =>
      Array(b.length + 1).fill(0),
    );
    d[0][0] = 1;
    for (let i = 0; i <= a.length; i++)
      for (let j = 0; j <= b.length; j++) {
        if (i && a[i - 1] === c[i + j - 1])
          d[i][j] = (d[i][j] + d[i - 1][j]) % MOD;
        if (j && b[j - 1] === c[i + j - 1])
          d[i][j] = (d[i][j] + d[i][j - 1]) % MOD;
      }
    return d[a.length][b.length];
  },
  ["ab cd acbd", "aa aa aaaa", "a b a", "a b ba", "ab cd abdc"],
);
add(
  "three-string-lcs",
  "Longest subsequence common to three strings",
  "Three-dimensional DP",
  "Input three nonempty lowercase strings. Print the length of their longest common subsequence; characters need not be contiguous.",
  "Each string length <= 70.",
  (s) => {
    const [a, b, c] = words(s);
    let d = Array.from({ length: b.length + 1 }, () =>
      Array(c.length + 1).fill(0),
    );
    for (const x of a) {
      const e = d.map((r) => r.map(() => 0));
      for (let j = 1; j <= b.length; j++)
        for (let k = 1; k <= c.length; k++)
          e[j][k] =
            x === b[j - 1] && x === c[k - 1]
              ? d[j - 1][k - 1] + 1
              : Math.max(d[j][k], e[j - 1][k], e[j][k - 1]);
      d = e;
    }
    return d[b.length][c.length];
  },
  ["abcd abed aebd", "abc def ghi", "a a a", "aaaa aa aaa", "xyz xzy zxy"],
);
add(
  "minimum-subsequence-window",
  "Shortest window containing a subsequence",
  "String DP",
  "Input text S and target T. Print the shortest contiguous substring of S that contains T as a subsequence. Break equal-length ties by earliest starting position. Print NONE when no window exists.",
  "1 <= |T| <= |S| <= 3000; lowercase letters only.",
  (s) => {
    const [a, b] = words(s),
      d = Array(b.length).fill(-1);
    let start = -1,
      best = Infinity;
    for (let i = 0; i < a.length; i++)
      for (let j = b.length - 1; j >= 0; j--)
        if (a[i] === b[j]) {
          d[j] = j === 0 ? i : d[j - 1];
          if (j === b.length - 1 && d[j] >= 0 && i - d[j] + 1 < best) {
            best = i - d[j] + 1;
            start = d[j];
          }
        }
    return start < 0 ? "NONE" : a.slice(start, start + best);
  },
  ["abcdebdde bde", "abc xyz", "a a", "aaaa aa", "abcbc ac"],
);
add(
  "end-picking-game",
  "Optimal difference in an end-picking game",
  "Game DP",
  "Input n followed by n signed integers. Two players alternately remove either end and add that value to their own total. Both optimize their final score difference. Print first player's total minus second player's total under optimal play.",
  "1 <= n <= 2000; |value| <= 1000000.",
  (s) => {
    const a = array(s),
      d = a.slice();
    for (let len = 2; len <= a.length; len++)
      for (let l = 0; l + len <= a.length; l++) {
        const r = l + len - 1;
        d[l] = Math.max(a[l] - d[l + 1], a[r] - d[l]);
      }
    return d[0];
  },
  ["4\n8 15 3 7", "3\n1 5 2", "1\n-7", "4\n0 0 0 0", "5\n-1 3 -2 4 1"],
);
add(
  "profitable-project-subsets",
  "Count resource-bounded profitable subsets",
  "Knapsack counting",
  "Input n, available workers W, minimum profit P, then n pairs workers profit. Count subsets using at most W workers and achieving at least P profit. Print modulo 1000000007. The empty subset is included when P=0.",
  "0 <= n <= 100; 0 <= W,P <= 100; workers per project >=1; profit <=100.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      W = t[1],
      P = t[2],
      d = Array.from({ length: W + 1 }, () => Array(P + 1).fill(0));
    d[0][0] = 1;
    for (let i = 0; i < n; i++) {
      const w = t[3 + 2 * i],
        p = t[4 + 2 * i];
      for (let j = W; j >= w; j--)
        for (let k = P; k >= 0; k--)
          d[j][Math.min(P, k + p)] =
            (d[j][Math.min(P, k + p)] + d[j - w][k]) % MOD;
    }
    return d.reduce((v, r) => (v + r[P]) % MOD, 0);
  },
  [
    "2 5 3\n2 2\n2 3",
    "3 3 2\n1 1\n1 1\n1 1",
    "0 0 0",
    "1 0 0\n1 2",
    "2 2 5\n1 3\n1 3",
  ],
);
add(
  "ordered-job-days",
  "Minimum difficulty across ordered workdays",
  "Partition DP",
  "Input n and days D followed by n nonnegative job difficulties. Partition jobs in their given order into D nonempty contiguous days. Each day's cost is its largest difficulty. Print the minimum total, or -1 when D>n.",
  "1 <= n <= 300; 1 <= D <= 20; difficulty <= 10000.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      D = t[1],
      a = t.slice(2);
    if (D > n) return -1;
    let d = Array(n + 1).fill(Infinity);
    d[0] = 0;
    for (let k = 1; k <= D; k++) {
      const e = Array(n + 1).fill(Infinity);
      for (let r = k; r <= n; r++) {
        let m = 0;
        for (let l = r - 1; l >= k - 1; l--) {
          m = Math.max(m, a[l]);
          e[r] = Math.min(e[r], d[l] + m);
        }
      }
      d = e;
    }
    return d[n];
  },
  [
    "6 2\n6 5 4 3 2 1",
    "3 4\n1 2 3",
    "1 1\n8",
    "4 4\n1 3 2 4",
    "5 2\n1 9 1 9 1",
  ],
);

function scc(n: number, edges: number[][]) {
  const a = Array.from({ length: n }, () => [] as number[]),
    b = a.map(() => [] as number[]);
  edges.forEach(([u, v]) => {
    a[u].push(v);
    b[v].push(u);
  });
  const seen = Array(n).fill(false),
    order: number[] = [],
    comp = Array(n).fill(-1);
  let count = 0;
  const visit = (u: number) => {
    seen[u] = true;
    for (const v of a[u]) if (!seen[v]) visit(v);
    order.push(u);
  };
  const fill = (u: number) => {
    comp[u] = count;
    for (const v of b[u]) if (comp[v] < 0) fill(v);
  };
  for (let u = 0; u < n; u++) if (!seen[u]) visit(u);
  for (const u of order.reverse())
    if (comp[u] < 0) {
      fill(u);
      count++;
    }
  return { count, comp };
}
function lowLinks(n: number, edges: number[][]) {
  const a = Array.from({ length: n }, () => [] as [number, number][]);
  edges.forEach(([u, v], i) => {
    a[u].push([v, i]);
    a[v].push([u, i]);
  });
  const tin = Array(n).fill(-1),
    low = Array(n).fill(0),
    points = new Set<number>();
  let clock = 0,
    bridges = 0;
  const dfs = (u: number, parentEdge: number) => {
    tin[u] = low[u] = clock++;
    let children = 0;
    for (const [v, e] of a[u])
      if (e !== parentEdge) {
        if (tin[v] >= 0) low[u] = Math.min(low[u], tin[v]);
        else {
          dfs(v, e);
          children++;
          low[u] = Math.min(low[u], low[v]);
          if (low[v] > tin[u]) bridges++;
          if (parentEdge >= 0 && low[v] >= tin[u]) points.add(u);
        }
      }
    if (parentEdge < 0 && children > 1) points.add(u);
  };
  for (let u = 0; u < n; u++) if (tin[u] < 0) dfs(u, -1);
  return { bridges, points };
}
const directedCases = [
  "4 5\n0 1\n1 0\n1 2\n2 3\n3 2",
  "3 2\n0 1\n1 2",
  "1 0",
  "4 0",
  "3 3\n0 1\n1 2\n2 0",
];
const undirectedCases = [
  "4 4\n0 1\n1 2\n2 0\n2 3",
  "3 2\n0 1\n1 2",
  "1 0",
  "4 0",
  "2 2\n0 1\n0 1",
];
const weightedCases = [
  "4 5\n0 1 2\n1 2 3\n2 3 4\n0 3 10\n0 2 6",
  "3 1\n0 1 5",
  "1 0",
  "3 3\n0 1 1\n1 2 1\n0 2 1",
  "4 3\n0 1 0\n1 2 0\n2 3 0",
];
function matching(s: string) {
  const t = numbers(s),
    L = t[0],
    R = t[1],
    m = t[2],
    a = Array.from({ length: L }, () => [] as number[]);
  for (let i = 0; i < m; i++) a[t[3 + 2 * i]].push(t[4 + 2 * i]);
  const match = Array(R).fill(-1);
  let total = 0;
  const dfs = (u: number, seen: boolean[]): boolean => {
    for (const v of a[u])
      if (!seen[v]) {
        seen[v] = true;
        if (match[v] < 0 || dfs(match[v], seen)) {
          match[v] = u;
          return true;
        }
      }
    return false;
  };
  for (let u = 0; u < L; u++) if (dfs(u, Array(R).fill(false))) total++;
  return { total, L, R };
}
const matchingCases = [
  "3 3 4\n0 0\n0 1\n1 0\n2 2",
  "2 2 1\n0 1",
  "1 1 0",
  "1 1 1\n0 0",
  "3 2 6\n0 0\n0 1\n1 0\n1 1\n2 0\n2 1",
];
// 31--40: residual networks and graph structure.
add(
  "maximum-network-flow",
  "Maximum directed network flow",
  "Residual graphs",
  "Input n m followed by m triples u v capacity describing directed edges. Source is 0 and sink is n-1. Parallel capacities add. Print maximum feasible flow.",
  "2 <= n <= 150; 0 <= m <= 3000; 0 <= capacity <= 100000; vertices are 0-based; no self-loops.",
  (s) => {
    const { n, edges } = graph(s, true),
      c = Array.from({ length: n }, () => Array(n).fill(0));
    edges.forEach(([u, v, w]) => (c[u][v] += w));
    let ans = 0;
    while (true) {
      const p = Array(n).fill(-1),
        q = [0];
      p[0] = 0;
      for (let i = 0; i < q.length && p[n - 1] < 0; i++)
        for (let v = 0; v < n; v++)
          if (p[v] < 0 && c[q[i]][v] > 0) {
            p[v] = q[i];
            q.push(v);
          }
      if (p[n - 1] < 0) break;
      let f = Infinity;
      for (let v = n - 1; v; v = p[v]) f = Math.min(f, c[p[v]][v]);
      for (let v = n - 1; v; v = p[v]) {
        c[p[v]][v] -= f;
        c[v][p[v]] += f;
      }
      ans += f;
    }
    return ans;
  },
  [
    "4 5\n0 1 3\n0 2 2\n1 2 1\n1 3 2\n2 3 4",
    "2 1\n0 1 9",
    "2 0",
    "3 2\n0 1 0\n1 2 4",
    "3 3\n0 1 2\n0 1 3\n1 2 8",
  ],
);
add(
  "bipartite-assignment",
  "Maximum compatible pair assignment",
  "Bipartite matching",
  "Input leftCount rightCount m followed by m compatible pairs leftVertex rightVertex. Match each vertex at most once and print the largest number of pairs.",
  "1 <= each side <= 300; m <= 10000; side indices are 0-based; no duplicate pairs.",
  (s) => matching(s).total,
  matchingCases,
);
add(
  "bipartite-cover",
  "Minimum cover of compatibility edges",
  "Konig's theorem",
  "Input leftCount rightCount m followed by m bipartite edges. Choose the fewest vertices so every edge has at least one chosen endpoint. Print the minimum number of chosen vertices.",
  "1 <= each side <= 300; m <= 10000; 0-based side indices; no duplicate pairs.",
  (s) => matching(s).total,
  matchingCases.slice().reverse(),
);
add(
  "strong-components",
  "Count strongly connected components",
  "Strongly connected components",
  "Input n m followed by m directed edges u v. Print the number of maximal vertex groups in which every vertex can reach every other vertex. Isolated vertices are components.",
  "1 <= n <= 1000; m <= 10000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s);
    return scc(n, edges).count;
  },
  directedCases,
);
add(
  "bridge-count",
  "Count single-edge failure points",
  "Low-link DFS",
  "Input n m followed by m undirected edges u v. Print how many individual edges increase the number of connected components when removed. Parallel edges are allowed and are distinct.",
  "1 <= n <= 1000; m <= 10000; no self-loops; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s);
    return lowLinks(n, edges).bridges;
  },
  undirectedCases,
);
add(
  "articulation-count",
  "Count single-vertex failure points",
  "Low-link DFS",
  "Input n m followed by m undirected edges u v. Print the number of vertices whose removal, including incident edges, increases the number of connected components. Parallel edges are allowed.",
  "1 <= n <= 1000; m <= 10000; no self-loops; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s);
    return lowLinks(n, edges).points.size;
  },
  undirectedCases.slice().reverse(),
);
add(
  "strong-connect-augmentation",
  "Edges needed to strongly connect a digraph",
  "Condensation DAG",
  "Input n m followed by m directed edges. You may add edges between any vertices. Print the minimum number of added edges required to make the entire graph strongly connected.",
  "1 <= n <= 1000; m <= 10000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s),
      { count, comp } = scc(n, edges);
    if (count === 1) return 0;
    const a = Array(count).fill(false),
      b = a.slice();
    for (const [u, v] of edges)
      if (comp[u] !== comp[v]) {
        a[comp[u]] = true;
        b[comp[v]] = true;
      }
    return Math.max(a.filter((x) => !x).length, b.filter((x) => !x).length);
  },
  directedCases,
);
add(
  "undirected-euler-trail",
  "Can every undirected edge be used once?",
  "Euler trails",
  "Input n m followed by m undirected edges. Print YES if some walk traverses each edge exactly once, otherwise NO. Isolated vertices may be ignored; a graph with no edges has an empty valid trail.",
  "1 <= n <= 1000; m <= 10000; no self-loops; parallel edges allowed; 0-based vertices.",
  (s) => {
    const { n, edges } = graph(s),
      d = Array(n).fill(0),
      u = new DSU(n);
    for (const [a, b] of edges) {
      d[a]++;
      d[b]++;
      u.join(a, b);
    }
    const odd = d.filter((x) => x % 2).length,
      roots = new Set(d.flatMap((v, i) => (v ? [u.find(i)] : [])));
    return roots.size <= 1 && (odd === 0 || odd === 2) ? "YES" : "NO";
  },
  undirectedCases,
);
add(
  "directed-euler-trail",
  "Can every directed edge be used once?",
  "Euler trails",
  "Input n m followed by m directed edges. Print YES if a directed walk uses every edge exactly once. The start and end may differ; no edges means YES.",
  "1 <= n <= 1000; m <= 10000; parallel edges allowed; no self-loops; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s),
      d = Array(n).fill(0),
      used = Array(n).fill(false),
      u = new DSU(n);
    for (const [a, b] of edges) {
      d[a]++;
      d[b]--;
      used[a] = used[b] = true;
      u.join(a, b);
    }
    const roots = new Set(used.flatMap((v, i) => (v ? [u.find(i)] : [])));
    const plus = d.filter((x) => x === 1).length,
      minus = d.filter((x) => x === -1).length;
    return roots.size <= 1 &&
      d.every((x) => Math.abs(x) <= 1) &&
      ((plus === 0 && minus === 0) || (plus === 1 && minus === 1))
      ? "YES"
      : "NO";
  },
  [...directedCases.slice(0, 4), "4 3\n0 1\n0 2\n0 3"],
);
add(
  "negative-cycle-anywhere",
  "Detect a negative cycle anywhere",
  "Bellman-Ford",
  "Input n m followed by directed weighted edges u v weight. Print YES if any directed cycle has negative total weight, including in components unreachable from vertex 0; otherwise print NO.",
  "1 <= n <= 300; m <= 3000; |weight| <= 10000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true),
      d = Array(n).fill(0);
    let changed = false;
    for (let i = 0; i < n; i++) {
      changed = false;
      for (const [u, v, w] of edges)
        if (d[v] > d[u] + w) {
          d[v] = d[u] + w;
          changed = true;
        }
    }
    return changed ? "YES" : "NO";
  },
  [
    "3 3\n0 1 1\n1 2 -4\n2 0 1",
    "3 2\n0 1 -2\n1 2 1",
    "1 0",
    "4 2\n2 3 -1\n3 2 -1",
    "2 2\n0 1 -1\n1 0 1",
  ],
);

class Heap {
  a: number[][] = [];
  push(x: number[]) {
    let i = this.a.length;
    this.a.push(x);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.a[p][0] <= x[0]) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = x;
  }
  pop() {
    const out = this.a[0],
      x = this.a.pop()!;
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0]) c++;
        if (this.a[c][0] >= x[0]) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = x;
    }
    return out;
  }
}
function mst(n: number, edges: number[][], skip = -1) {
  const u = new DSU(n),
    chosen: number[] = [];
  let cost = 0;
  for (const i of edges
    .map((_, i) => i)
    .sort((a, b) => edges[a][2] - edges[b][2] || a - b))
    if (i !== skip && u.join(edges[i][0], edges[i][1])) {
      chosen.push(i);
      cost += edges[i][2];
    }
  return { cost: chosen.length === n - 1 ? cost : -1, chosen };
}
// 41--50: path states, spanning structures and subset ordering.
add(
  "exact-edge-shortest",
  "Cheapest walk using exactly K edges",
  "Layered shortest paths",
  "Input n m K then m directed triples u v weight. Starting at 0, reach n-1 using exactly K edges; vertices and edges may repeat. Print the minimum weight, or UNREACHABLE.",
  "1 <= n <= 100; m <= 1000; 0 <= K <= 1000; |weight| <= 10000; 0-based vertices.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      m = t[1],
      K = t[2];
    let d = Array(n).fill(Infinity);
    d[0] = 0;
    for (let k = 0; k < K; k++) {
      const e = Array(n).fill(Infinity);
      for (let i = 0; i < m; i++) {
        const [u, v, w] = t.slice(3 + 3 * i, 6 + 3 * i);
        e[v] = Math.min(e[v], d[u] + w);
      }
      d = e;
    }
    return Number.isFinite(d[n - 1]) ? d[n - 1] : "UNREACHABLE";
  },
  [
    "3 3 2\n0 1 2\n1 2 3\n0 2 1",
    "2 1 2\n0 1 4",
    "1 0 0",
    "2 2 3\n0 1 2\n1 0 1",
    "3 3 2\n0 1 -5\n1 2 2\n0 2 0",
  ],
);
add(
  "huge-length-walks",
  "Count walks of a huge fixed length",
  "Matrix exponentiation",
  "Input n m K followed by m directed edges u v. Count walks from 0 to n-1 having exactly K edges, modulo 1000000007. Parallel edges represent different choices; the empty walk counts when source equals destination and K=0.",
  "1 <= n <= 25; m <= 300; 0 <= K <= 1000000000; vertices 0..n-1.",
  (s) => {
    const t = numbers(s),
      n = t[0];
    let K = t[2],
      a = Array.from({ length: n }, () => Array<bigint>(n).fill(0n)),
      b = a.map((r, i) => r.map((_, j) => BigInt(i === j)));
    for (let i = 0; i < t[1]; i++) a[t[3 + 2 * i]][t[4 + 2 * i]]++;
    const mul = (x: bigint[][], y: bigint[][]) =>
      x.map((r) =>
        y[0].map((_, j) =>
          r.reduce((v, z, k) => (v + z * y[k][j]) % BigInt(MOD), 0n),
        ),
      );
    while (K) {
      if (K % 2) b = mul(b, a);
      a = mul(a, a);
      K = Math.floor(K / 2);
    }
    return b[0][n - 1];
  },
  ["2 2 3\n0 1\n1 0", "2 3 2\n0 0\n0 1\n1 1", "1 0 0", "2 0 4", "1 1 100\n0 0"],
);
add(
  "minimum-spanning-cost",
  "Connect every location at minimum cost",
  "Minimum spanning tree",
  "Input n m and m undirected weighted edges u v cost. Print the minimum cost connecting all vertices using edges, or -1 if disconnected. Parallel edges are allowed.",
  "1 <= n <= 10000; m <= 30000; 0 <= cost <= 1000000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true);
    return mst(n, edges).cost;
  },
  weightedCases,
);
add(
  "strict-second-spanning",
  "Strictly second-best spanning-tree cost",
  "MST exchange",
  "Input n m followed by undirected edges u v cost. Print the smallest spanning-tree cost strictly greater than the minimum spanning-tree cost. Print -1 if the graph is disconnected or no strictly greater cost exists. Equal-cost alternative trees do not qualify.",
  "1 <= n <= 100; m <= 1000; 0 <= cost <= 10000; no self-loops; parallel edges allowed; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true),
      best = mst(n, edges);
    if (best.cost < 0) return -1;
    const used = new Set(best.chosen),
      a = Array.from({ length: n }, () => [] as [number, number][]);
    for (const i of best.chosen) {
      const [u, v, w] = edges[i];
      a[u].push([v, w]);
      a[v].push([u, w]);
    }
    let ans = Infinity;
    for (let i = 0; i < edges.length; i++)
      if (!used.has(i)) {
        const [u, v, w] = edges[i],
          path: number[] = [];
        const find = (x: number, p: number): boolean => {
          if (x === v) return true;
          for (const [y, c] of a[x])
            if (y !== p) {
              path.push(c);
              if (find(y, x)) return true;
              path.pop();
            }
          return false;
        };
        find(u, -1);
        for (const c of path) if (w > c) ans = Math.min(ans, best.cost + w - c);
      }
    return Number.isFinite(ans) ? ans : -1;
  },
  weightedCases,
);
add(
  "critical-spanning-edges",
  "Count edges required by every MST",
  "MST sensitivity",
  "Input n m followed by undirected weighted edges u v cost. Count edges that occur in every minimum spanning tree. Print -1 if the graph is disconnected. Parallel edges are distinct.",
  "1 <= n <= 100; m <= 300; 0 <= cost <= 10000; no self-loops; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true),
      best = mst(n, edges);
    if (best.cost < 0) return -1;
    return best.chosen.filter((i) => {
      const v = mst(n, edges, i).cost;
      return v < 0 || v > best.cost;
    }).length;
  },
  weightedCases,
);
add(
  "minimum-bottleneck-path",
  "Minimize the largest road on a route",
  "Minimax paths",
  "Input n m followed by undirected edges u v weight. Among paths from 0 to n-1 minimize the largest edge weight. Print that bottleneck, or -1 if unreachable. For n=1 print 0.",
  "1 <= n <= 150; m <= 3000; 0 <= weight <= 1000000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true),
      d = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
      );
    edges.forEach(([u, v, w]) => (d[u][v] = d[v][u] = Math.min(d[u][v], w)));
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          d[i][j] = Math.min(d[i][j], Math.max(d[i][k], d[k][j]));
    return Number.isFinite(d[0][n - 1]) ? d[0][n - 1] : -1;
  },
  weightedCases,
);
add(
  "maximum-route-capacity",
  "Maximize the weakest link of a route",
  "Widest paths",
  "Input n m followed by undirected edges u v capacity. For routes from 0 to n-1, maximize the smallest edge capacity. Print the result, or -1 if unreachable; n=1 prints 0.",
  "1 <= n <= 150; m <= 3000; 0 <= capacity <= 1000000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true);
    if (n === 1) return 0;
    const d = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? Infinity : -1)),
    );
    edges.forEach(([u, v, w]) => (d[u][v] = d[v][u] = Math.max(d[u][v], w)));
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          d[i][j] = Math.max(d[i][j], Math.min(d[i][k], d[k][j]));
    return d[0][n - 1];
  },
  weightedCases,
);
add(
  "kth-shortest-walk",
  "K-th cheapest directed walk",
  "Priority-queue path enumeration",
  "Input n m K then m directed edges u v positiveWeight. List all walks from 0 to n-1 by nondecreasing total weight, counting distinct edge sequences separately even when weights tie. Print the K-th weight or -1 if fewer walks exist. The empty walk is included when n=1.",
  "1 <= n <= 200; m <= 2000; 1 <= K <= 30; 1 <= weight <= 10000; vertices 0..n-1.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      K = t[2],
      a = Array.from({ length: n }, () => [] as [number, number][]);
    for (let i = 0; i < t[1]; i++) {
      const [u, v, w] = t.slice(3 + 3 * i, 6 + 3 * i);
      a[u].push([v, w]);
    }
    const count = Array(n).fill(0),
      h = new Heap();
    h.push([0, 0]);
    while (h.a.length) {
      const [d, u] = h.pop();
      if (++count[u] > K) continue;
      if (u === n - 1 && count[u] === K) return d;
      for (const [v, w] of a[u]) if (count[v] < K) h.push([d + w, v]);
    }
    return -1;
  },
  [
    "3 4 2\n0 1 1\n1 2 1\n0 2 5\n1 1 1",
    "2 1 2\n0 1 3",
    "1 0 1",
    "1 1 3\n0 0 2",
    "3 3 1\n0 1 2\n1 2 3\n0 2 9",
  ],
);
add(
  "minimum-directed-cycle",
  "Lightest directed cycle",
  "All-pairs shortest paths",
  "Input n m followed by directed edges u v nonnegativeWeight. Print the minimum total weight of a nonempty directed cycle, or -1 if none exists. Self-loops are valid cycles.",
  "1 <= n <= 150; m <= 3000; weight <= 10000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true),
      d = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
      );
    for (const [u, v, w] of edges) d[u][v] = Math.min(d[u][v], w);
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
    const ans = Math.min(Infinity, ...edges.map(([u, v, w]) => w + d[v][u]));
    return Number.isFinite(ans) ? ans : -1;
  },
  [
    "3 3\n0 1 2\n1 2 3\n2 0 4",
    "3 2\n0 1 2\n1 2 3",
    "1 0",
    "1 1\n0 0 7",
    "2 2\n0 1 0\n1 0 0",
  ],
);
add(
  "topological-order-count",
  "Count valid task orders",
  "Subset topological DP",
  "Input n m followed by directed prerequisites u v, meaning u must occur before v. Print the number of permutations satisfying every prerequisite modulo 1000000007. A cyclic graph has zero valid orders.",
  "1 <= n <= 20; no duplicate edges; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s),
      pre = Array(n).fill(0),
      d = Array(1 << n).fill(0);
    edges.forEach(([u, v]) => (pre[v] |= 1 << u));
    d[0] = 1;
    for (let m = 0; m < 1 << n; m++)
      if (d[m])
        for (let v = 0; v < n; v++)
          if (!((m >> v) & 1) && (pre[v] & m) === pre[v])
            d[m | (1 << v)] = (d[m | (1 << v)] + d[m]) % MOD;
    return d.at(-1)!;
  },
  ["3 2\n0 2\n1 2", "3 0", "1 0", "2 2\n0 1\n1 0", "4 3\n0 1\n1 2\n2 3"],
);

function tree(s: string, weighted = false) {
  const t = numbers(s),
    n = t[0],
    size = weighted ? 3 : 2,
    a = Array.from({ length: n }, () => [] as [number, number][]);
  for (let i = 0; i < n - 1; i++) {
    const u = t[1 + i * size],
      v = t[2 + i * size],
      w = weighted ? t[3 + i * size] : 1;
    a[u].push([v, w]);
    a[v].push([u, w]);
  }
  return { n, a, t, offset: 1 + (n - 1) * size };
}
const treeCases = [
  "4\n0 1\n1 2\n1 3",
  "1",
  "3\n0 1\n1 2",
  "5\n0 1\n0 2\n0 3\n0 4",
  "5\n0 1\n1 2\n2 3\n3 4",
];
// 51--60: acyclic routes, rooted queries and tree dynamic programming.
add(
  "longest-dag-route",
  "Longest weighted route in a DAG",
  "Topological DP",
  "Input n m followed by directed weighted edges. The graph is guaranteed acyclic. Print the maximum total weight of a route from 0 to n-1, or UNREACHABLE. For n=1 the empty route costs 0.",
  "1 <= n <= 10000; m <= 30000; |weight| <= 100000; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s, true),
      a = Array.from({ length: n }, () => [] as [number, number][]),
      deg = Array(n).fill(0),
      d = Array(n).fill(-Infinity),
      q: number[] = [];
    for (const [u, v, w] of edges) {
      a[u].push([v, w]);
      deg[v]++;
    }
    deg.forEach((x, i) => {
      if (!x) q.push(i);
    });
    d[0] = 0;
    for (let i = 0; i < q.length; i++)
      for (const [v, w] of a[q[i]]) {
        d[v] = Math.max(d[v], d[q[i]] + w);
        if (!--deg[v]) q.push(v);
      }
    return Number.isFinite(d[n - 1]) ? d[n - 1] : "UNREACHABLE";
  },
  weightedCases,
);
add(
  "weighted-tree-diameter",
  "Weighted tree diameter",
  "Tree DP",
  "Input n followed by n-1 undirected edges u v positiveWeight forming a tree. Print the maximum total weight along any simple path; a one-vertex tree has diameter 0.",
  "1 <= n <= 1000; weights <= 100000; vertices 0..n-1.",
  (s) => {
    const { n, a } = tree(s, true);
    let ans = 0;
    const f = (u: number, p: number): number => {
      let x = 0,
        y = 0;
      for (const [v, w] of a[u])
        if (v !== p) {
          const z = f(v, u) + w;
          if (z > x) {
            y = x;
            x = z;
          } else y = Math.max(y, z);
        }
      ans = Math.max(ans, x + y);
      return x;
    };
    f(0, -1);
    return n === 1 ? 0 : ans;
  },
  [
    "4\n0 1 2\n1 2 3\n1 3 4",
    "1",
    "2\n0 1 7",
    "3\n0 1 1\n1 2 1",
    "4\n0 1 10\n0 2 2\n0 3 3",
  ],
);
add(
  "signed-tree-path",
  "Maximum sum path through signed tree vertices",
  "Tree DP",
  "Input n, n signed vertex values, then n-1 undirected edges forming a tree. Print the largest sum on any nonempty simple path; endpoints may be equal.",
  "1 <= n <= 1000; |vertex value| <= 100000; vertices 0..n-1.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      val = t.slice(1, n + 1),
      a = Array.from({ length: n }, () => [] as number[]);
    for (let i = 0; i < n - 1; i++) {
      const u = t[n + 1 + 2 * i],
        v = t[n + 2 + 2 * i];
      a[u].push(v);
      a[v].push(u);
    }
    let ans = -Infinity;
    const f = (u: number, p: number): number => {
      let x = 0,
        y = 0;
      for (const v of a[u])
        if (v !== p) {
          const z = Math.max(0, f(v, u));
          if (z > x) {
            y = x;
            x = z;
          } else y = Math.max(y, z);
        }
      ans = Math.max(ans, val[u] + x + y);
      return val[u] + x;
    };
    f(0, -1);
    return ans;
  },
  [
    "3\n-2 5 4\n0 1\n1 2",
    "1\n-7",
    "2\n-3 -1\n0 1",
    "4\n1 2 3 4\n0 1\n0 2\n0 3",
    "3\n2 -10 3\n0 1\n1 2",
  ],
);
add(
  "tree-edge-matching",
  "Largest matching in a tree",
  "Tree DP",
  "Input n followed by n-1 undirected edges forming a tree. Choose as many edges as possible so no two chosen edges share an endpoint. Print the maximum count.",
  "1 <= n <= 1000; vertices 0..n-1.",
  (s) => {
    const { a } = tree(s);
    const f = (u: number, p: number): [number, number] => {
      const ch = a[u].filter(([v]) => v !== p).map(([v]) => f(v, u));
      const free = ch.reduce((x, [a, b]) => x + Math.max(a, b), 0);
      let used = 0;
      for (const [x, y] of ch)
        used = Math.max(used, free - Math.max(x, y) + x + 1);
      return [free, used];
    };
    return Math.max(...f(0, -1));
  },
  treeCases,
);
add(
  "tree-independent-count",
  "Count independent vertex sets in a tree",
  "Tree counting DP",
  "Input n followed by tree edges. Count all subsets of vertices containing no adjacent pair, including the empty subset. Print modulo 1000000007.",
  "1 <= n <= 1000; vertices 0..n-1.",
  (s) => {
    const { a } = tree(s);
    const f = (u: number, p: number): [bigint, bigint] => {
      let no = 1n,
        yes = 1n;
      for (const [v] of a[u])
        if (v !== p) {
          const [x, y] = f(v, u);
          no = (no * (x + y)) % BigInt(MOD);
          yes = (yes * x) % BigInt(MOD);
        }
      return [no, yes];
    };
    const [x, y] = f(0, -1);
    return (x + y) % BigInt(MOD);
  },
  treeCases,
);
add(
  "tree-distance-sums",
  "Sum distances from every tree vertex",
  "Rerooting DP",
  "Input n followed by n-1 unweighted tree edges. Print n integers: for each vertex in index order, the sum of its distances to all vertices.",
  "1 <= n <= 1000; vertices 0..n-1.",
  (s) => {
    const { n, a } = tree(s),
      size = Array(n).fill(1),
      d = Array(n).fill(0);
    const f = (u: number, p: number) => {
      for (const [v] of a[u])
        if (v !== p) {
          f(v, u);
          size[u] += size[v];
          d[u] += d[v] + size[v];
        }
    };
    const g = (u: number, p: number) => {
      for (const [v] of a[u])
        if (v !== p) {
          d[v] = d[u] + n - 2 * size[v];
          g(v, u);
        }
    };
    f(0, -1);
    g(0, -1);
    return d.join(" ");
  },
  treeCases,
);
add(
  "tree-centroids",
  "Find all tree centroids",
  "Tree decomposition",
  "Input n followed by n-1 tree edges. A centroid is a vertex whose removal leaves no connected component larger than n/2. Print all centroid indices in ascending order separated by spaces.",
  "1 <= n <= 1000; vertices 0..n-1.",
  (s) => {
    const { n, a } = tree(s),
      ans: number[] = [];
    const f = (u: number, p: number): number => {
      let size = 1,
        max = 0;
      for (const [v] of a[u])
        if (v !== p) {
          const z = f(v, u);
          size += z;
          max = Math.max(max, z);
        }
      max = Math.max(max, n - size);
      if (max * 2 <= n) ans.push(u);
      return size;
    };
    f(0, -1);
    return ans.sort((x, y) => x - y).join(" ");
  },
  treeCases,
);
add(
  "tree-lowest-ancestors",
  "Answer lowest common ancestor queries",
  "Binary lifting",
  "Input n and n-1 tree edges, then q and q pairs u v. Root the tree at 0. For each query print the deepest common ancestor of u and v, one answer per line.",
  "1 <= n <= 1000; 1 <= q <= 10000; vertices 0..n-1.",
  (s) => {
    const { n, a, t, offset } = tree(s),
      depth = Array(n).fill(0),
      up = Array.from({ length: 11 }, () => Array(n).fill(0));
    const f = (u: number, p: number) => {
      up[0][u] = p;
      for (let k = 1; k < 11; k++) up[k][u] = up[k - 1][up[k - 1][u]];
      for (const [v] of a[u])
        if (v !== p) {
          depth[v] = depth[u] + 1;
          f(v, u);
        }
    };
    f(0, 0);
    const out: number[] = [];
    for (let i = 0; i < t[offset]; i++) {
      let u = t[offset + 1 + 2 * i],
        v = t[offset + 2 + 2 * i];
      if (depth[u] < depth[v]) [u, v] = [v, u];
      for (let k = 10; k >= 0; k--)
        if (depth[u] - (1 << k) >= depth[v]) u = up[k][u];
      if (u !== v) {
        for (let k = 10; k >= 0; k--)
          if (up[k][u] !== up[k][v]) {
            u = up[k][u];
            v = up[k][v];
          }
        u = up[0][u];
      }
      out.push(u);
    }
    return out.join("\n");
  },
  [
    "4\n0 1\n1 2\n1 3\n3\n2 3\n0 2\n2 2",
    "1\n1\n0 0",
    "2\n0 1\n2\n0 1\n1 1",
    "3\n0 1\n0 2\n1\n1 2",
    "4\n0 1\n1 2\n2 3\n2\n1 3\n2 3",
  ],
);
add(
  "subtree-color-diversity",
  "Count distinct colors in every rooted subtree",
  "Small-to-large sets",
  "Input n, n integer vertex colors, and n-1 tree edges. Root at 0. Print the number of distinct colors in each vertex's subtree, in vertex-index order.",
  "1 <= n <= 1000; colors 1..1000000; vertices 0..n-1.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      a = Array.from({ length: n }, () => [] as number[]),
      ans = Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      const u = t[n + 1 + 2 * i],
        v = t[n + 2 + 2 * i];
      a[u].push(v);
      a[v].push(u);
    }
    const f = (u: number, p: number): Set<number> => {
      let set = new Set([t[u + 1]]);
      for (const v of a[u])
        if (v !== p) {
          let other = f(v, u);
          if (set.size < other.size) [set, other] = [other, set];
          for (const c of other) set.add(c);
        }
      ans[u] = set.size;
      return set;
    };
    f(0, -1);
    return ans.join(" ");
  },
  [
    "4\n1 2 1 3\n0 1\n1 2\n1 3",
    "1\n5",
    "3\n1 1 1\n0 1\n1 2",
    "3\n1 2 3\n0 1\n0 2",
    "4\n9 8 9 8\n0 1\n1 2\n2 3",
  ],
);
add(
  "tree-path-xor",
  "XOR of vertex values on queried paths",
  "Root-prefix queries",
  "Input n, n nonnegative vertex values, n-1 tree edges, then q and q pairs u v. For each query print the bitwise XOR of all vertex values on the unique path from u to v, including endpoints.",
  "1 <= n <= 1000; q <= 10000; values < 2^20; vertices 0..n-1.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      val = t.slice(1, n + 1),
      a = Array.from({ length: n }, () => [] as number[]),
      p = Array(n).fill(0),
      dep = Array(n).fill(0),
      pref = Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      const u = t[n + 1 + 2 * i],
        v = t[n + 2 + 2 * i];
      a[u].push(v);
      a[v].push(u);
    }
    const f = (u: number, pa: number) => {
      p[u] = pa;
      pref[u] = val[u] ^ (u ? pref[pa] : 0);
      for (const v of a[u])
        if (v !== pa) {
          dep[v] = dep[u] + 1;
          f(v, u);
        }
    };
    f(0, 0);
    const o = 3 * n - 1,
      out: number[] = [];
    for (let i = 0; i < t[o]; i++) {
      const x = t[o + 1 + 2 * i],
        y = t[o + 2 + 2 * i];
      let u = x,
        v = y;
      while (dep[u] > dep[v]) u = p[u];
      while (dep[v] > dep[u]) v = p[v];
      while (u !== v) {
        u = p[u];
        v = p[v];
      }
      out.push(pref[x] ^ pref[y] ^ val[u]);
    }
    return out.join("\n");
  },
  [
    "3\n1 2 4\n0 1\n1 2\n2\n0 2\n1 1",
    "1\n7\n1\n0 0",
    "2\n0 0\n0 1\n1\n0 1",
    "3\n3 3 3\n0 1\n0 2\n1\n1 2",
    "4\n1 2 3 4\n0 1\n1 2\n1 3\n2\n2 3\n0 3",
  ],
);

class Fenwick {
  a: number[];
  constructor(n: number) {
    this.a = Array(n + 2).fill(0);
  }
  add(i: number, x: number) {
    for (i++; i < this.a.length; i += i & -i) this.a[i] += x;
  }
  sum(i: number) {
    let x = 0;
    for (i++; i > 0; i -= i & -i) x += this.a[i];
    return x;
  }
}
function histogram(a: number[]) {
  const st: number[] = [];
  let ans = 0;
  for (let i = 0; i <= a.length; i++) {
    const h = i < a.length ? a[i] : 0;
    while (st.length && a[st.at(-1)!] > h) {
      const x = st.pop()!;
      ans = Math.max(ans, a[x] * (i - (st.length ? st.at(-1)! + 1 : 0)));
    }
    st.push(i);
  }
  return ans;
}
function xorBest(values: number[], prefix = false) {
  const next: [number, number][] = [[-1, -1]];
  const insert = (x: number) => {
    let u = 0;
    for (let b = 29; b >= 0; b--) {
      const bit = (x >>> b) & 1;
      if (next[u][bit] < 0) {
        next[u][bit] = next.length;
        next.push([-1, -1]);
      }
      u = next[u][bit];
    }
  };
  const query = (x: number) => {
    let u = 0,
      r = 0;
    for (let b = 29; b >= 0; b--) {
      const bit = (x >>> b) & 1,
        w = bit ^ 1;
      if (next[u][w] >= 0) {
        r += 2 ** b;
        u = next[u][w];
      } else u = next[u][bit];
    }
    return r;
  };
  let ans = 0,
    p = 0;
  if (prefix) insert(0);
  for (let i = 0; i < values.length; i++) {
    p = prefix ? p ^ values[i] : values[i];
    if (prefix || i) ans = Math.max(ans, query(p));
    insert(p);
  }
  return ans;
}
// 61--70: online ranges, order statistics and monotonic structures.
add(
  "range-add-sums",
  "Range addition and range-sum queries",
  "Fenwick trees",
  "Input n q, n initial integers, then q commands. Command 1 l r delta adds delta to every index l..r inclusive. Command 2 l r asks for that range's sum. Print query answers one per line; indices are 0-based.",
  "1 <= n,q <= 100000; |initial value|,|delta| <= 1000; 0 <= l <= r < n; sums fit signed 64-bit.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      q = t[1],
      b = new Fenwick(n + 1),
      c = new Fenwick(n + 1);
    const update = (l: number, r: number, v: number) => {
      b.add(l, v);
      b.add(r + 1, -v);
      c.add(l, v * l);
      c.add(r + 1, -v * (r + 1));
    };
    const sum = (x: number) => (x < 0 ? 0 : b.sum(x) * (x + 1) - c.sum(x));
    for (let i = 0; i < n; i++) update(i, i, t[i + 2]);
    let p = n + 2;
    const out: number[] = [];
    for (let i = 0; i < q; i++) {
      const op = t[p++],
        l = t[p++],
        r = t[p++];
      if (op === 1) update(l, r, t[p++]);
      else out.push(sum(r) - sum(l - 1));
    }
    return out.join("\n");
  },
  [
    "4 3\n1 2 3 4\n2 0 3\n1 1 2 5\n2 1 3",
    "1 2\n0\n1 0 0 -3\n2 0 0",
    "2 1\n-1 1\n2 0 1",
    "3 3\n0 0 0\n1 0 2 2\n1 1 1 -1\n2 0 2",
    "2 2\n4 7\n2 1 1\n2 0 1",
  ],
);
add(
  "range-assign-min",
  "Range assignment and minimum queries",
  "Lazy segment tree",
  "Input n q and n integers, then q commands. Command 1 l r value assigns value to every position l..r. Command 2 l r asks for the smallest value in that inclusive range. Print each answer on its own line; indices are 0-based.",
  "1 <= n,q <= 100000; |values| <= 1000000; 0 <= l <= r < n.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      q = t[1],
      a = t.slice(2, n + 2),
      v = Array(4 * n).fill(0),
      lazy: (number | null)[] = Array(4 * n).fill(null);
    const build = (u: number, l: number, r: number) => {
      if (l === r) {
        v[u] = a[l];
        return;
      }
      const m = (l + r) >> 1;
      build(u * 2, l, m);
      build(u * 2 + 1, m + 1, r);
      v[u] = Math.min(v[u * 2], v[u * 2 + 1]);
    };
    const push = (u: number) => {
      if (lazy[u] !== null) {
        for (const x of [u * 2, u * 2 + 1]) v[x] = lazy[x] = lazy[u]!;
        lazy[u] = null;
      }
    };
    const run = (
      u: number,
      l: number,
      r: number,
      x: number,
      y: number,
      z: number | null,
    ): number => {
      if (y < l || r < x) return Infinity;
      if (x <= l && r <= y) {
        if (z !== null) v[u] = lazy[u] = z;
        return v[u];
      }
      push(u);
      const m = (l + r) >> 1,
        res = Math.min(
          run(u * 2, l, m, x, y, z),
          run(u * 2 + 1, m + 1, r, x, y, z),
        );
      v[u] = Math.min(v[u * 2], v[u * 2 + 1]);
      return res;
    };
    build(1, 0, n - 1);
    let p = n + 2;
    const out: number[] = [];
    for (let i = 0; i < q; i++) {
      const op = t[p++],
        l = t[p++],
        r = t[p++];
      const ans = run(1, 0, n - 1, l, r, op === 1 ? t[p++] : null);
      if (op === 2) out.push(ans);
    }
    return out.join("\n");
  },
  [
    "4 3\n5 2 7 1\n2 0 3\n1 1 3 8\n2 0 3",
    "1 2\n0\n1 0 0 -7\n2 0 0",
    "3 1\n4 4 4\n2 1 2",
    "2 3\n-5 3\n1 0 0 10\n1 0 1 0\n2 0 1",
    "3 2\n9 1 8\n2 0 0\n2 1 2",
  ],
);
add(
  "bounded-length-subarray",
  "Maximum subarray sum under length bounds",
  "Monotonic prefix deque",
  "Input n minimumLength maximumLength followed by n signed integers. Print the largest sum of any contiguous subarray whose length is within the two inclusive bounds.",
  "1 <= minimumLength <= maximumLength <= n <= 200000; |values| <= 1000000; exact answer fits signed 64-bit.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      lo = t[1],
      hi = t[2],
      p = [0],
      q: number[] = [];
    for (const x of t.slice(3)) p.push(p.at(-1)! + x);
    let head = 0,
      ans = -Infinity;
    for (let r = lo; r <= n; r++) {
      const j = r - lo;
      while (q.length > head && p[q.at(-1)!] >= p[j]) q.pop();
      q.push(j);
      while (q[head] < r - hi) head++;
      ans = Math.max(ans, p[r] - p[q[head]]);
    }
    return ans;
  },
  [
    "5 2 3\n1 -2 3 4 -1",
    "3 1 2\n-5 -2 -3",
    "1 1 1\n7",
    "4 4 4\n1 2 -3 4",
    "5 1 5\n0 0 0 0 0",
  ],
);
add(
  "persistent-range-kth",
  "K-th smallest in static subarray queries",
  "Persistent order statistics",
  "Input n q, n integers, and q triples l r k. For each inclusive 0-based subarray a[l..r], print its k-th smallest value, counting duplicates separately; k is 1-based.",
  "1 <= n,q <= 100000; |values| <= 1000000000; 1 <= k <= r-l+1.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      q = t[1],
      a = t.slice(2, n + 2),
      vals = [...new Set(a)].sort((x, y) => x - y),
      rank = new Map(vals.map((x, i) => [x, i])),
      left = [0],
      right = [0],
      count = [0],
      roots = [0];
    const ins = (old: number, l: number, r: number, x: number): number => {
      const u = count.length;
      left.push(left[old]);
      right.push(right[old]);
      count.push(count[old] + 1);
      if (l < r) {
        const m = (l + r) >> 1;
        if (x <= m) left[u] = ins(left[old], l, m, x);
        else right[u] = ins(right[old], m + 1, r, x);
      }
      return u;
    };
    for (const x of a)
      roots.push(ins(roots.at(-1)!, 0, vals.length - 1, rank.get(x)!));
    const kth = (
      u: number,
      v: number,
      l: number,
      r: number,
      k: number,
    ): number => {
      if (l === r) return vals[l];
      const m = (l + r) >> 1,
        c = count[left[v]] - count[left[u]];
      return k <= c
        ? kth(left[u], left[v], l, m, k)
        : kth(right[u], right[v], m + 1, r, k - c);
    };
    const out: number[] = [];
    for (let i = 0; i < q; i++) {
      const [l, r, k] = t.slice(n + 2 + 3 * i, n + 5 + 3 * i);
      out.push(kth(roots[l], roots[r + 1], 0, vals.length - 1, k));
    }
    return out.join("\n");
  },
  [
    "5 2\n5 1 4 2 3\n0 4 3\n1 3 2",
    "1 1\n7\n0 0 1",
    "4 2\n2 2 1 1\n0 3 2\n0 1 2",
    "3 1\n-3 -1 -2\n0 2 1",
    "5 1\n9 8 7 6 5\n1 4 4",
  ],
);
add(
  "bounded-subarray-sums",
  "Count subarrays whose sum lies in a range",
  "Merge-sort counting",
  "Input n lower upper followed by n signed integers. Count nonempty contiguous subarrays whose sum is between lower and upper inclusive. Print the exact count.",
  "0 <= n <= 100000; |values| <= 1000000; -10^12 <= lower <= upper <= 10^12.",
  (s) => {
    const t = numbers(s),
      lo = t[1],
      hi = t[2],
      p = [0];
    t.slice(3).forEach((x) => p.push(p.at(-1)! + x));
    const f = (a: number[]): [number[], number] => {
      if (a.length < 2) return [a, 0];
      const m = a.length >> 1,
        [x, c] = f(a.slice(0, m)),
        [y, d] = f(a.slice(m));
      let ans = c + d,
        l = 0,
        r = 0;
      for (const v of x) {
        while (l < y.length && y[l] - v < lo) l++;
        while (r < y.length && y[r] - v <= hi) r++;
        ans += r - l;
      }
      const out: number[] = [];
      let i = 0,
        j = 0;
      while (i < x.length || j < y.length)
        out.push(
          j === y.length || (i < x.length && x[i] <= y[j]) ? x[i++] : y[j++],
        );
      return [out, ans];
    };
    return f(p)[1];
  },
  ["3 -2 2\n-2 5 -1", "3 0 0\n0 0 0", "0 -1 1", "1 2 2\n2", "4 1 3\n1 -1 2 3"],
);
add(
  "sliding-window-medians",
  "Lower medians of all sliding windows",
  "Order-statistic Fenwick tree",
  "Input n k and n integers. For each length-k contiguous window, print its lower median (sorted position floor((k-1)/2)), in window order separated by spaces.",
  "1 <= k <= n <= 100000; |values| <= 1000000000.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      k = t[1],
      a = t.slice(2),
      vals = [...new Set(a)].sort((x, y) => x - y),
      rank = new Map(vals.map((x, i) => [x, i])),
      b = new Fenwick(vals.length);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      b.add(rank.get(a[i])!, 1);
      if (i >= k) b.add(rank.get(a[i - k])!, -1);
      if (i >= k - 1) {
        let l = 0,
          r = vals.length - 1;
        while (l < r) {
          const m = (l + r) >> 1;
          if (b.sum(m) >= (k + 1) >> 1) r = m;
          else l = m + 1;
        }
        out.push(vals[l]);
      }
    }
    return out.join(" ");
  },
  [
    "8 3\n1 3 -1 -3 5 3 6 7",
    "4 2\n4 1 3 2",
    "1 1\n0",
    "4 4\n2 2 2 2",
    "5 1\n5 4 3 2 1",
  ],
);
add(
  "maximum-pair-xor",
  "Maximum XOR of two different indices",
  "Binary trie",
  "Input n and n nonnegative integers. Print the largest a[i] XOR a[j] over different indices. If n<2 print 0.",
  "0 <= n <= 100000; values < 2^30.",
  (s) => xorBest(array(s)),
  ["6\n3 10 5 25 2 8", "2\n0 7", "0", "1\n9", "4\n5 5 5 5"],
);
add(
  "maximum-subarray-xor",
  "Maximum XOR over a contiguous subarray",
  "Prefix XOR trie",
  "Input n and n nonnegative integers. Print the largest bitwise XOR of a nonempty contiguous subarray. For n=0 print 0.",
  "0 <= n <= 100000; values < 2^30.",
  (s) => xorBest(array(s), true),
  ["4\n1 2 3 4", "3\n8 1 2", "0", "1\n7", "4\n0 0 0 0"],
);
add(
  "histogram-rectangle",
  "Largest rectangle under a histogram",
  "Monotonic stack",
  "Input n followed by n nonnegative bar heights, each of width 1. Print the largest rectangle area contained under consecutive bars.",
  "0 <= n <= 200000; heights <= 1000000000; area fits signed 64-bit.",
  (s) => histogram(array(s)),
  ["6\n2 1 5 6 2 3", "4\n1 2 3 4", "0", "1\n0", "5\n3 3 3 3 3"],
);
add(
  "binary-matrix-rectangle",
  "Largest all-one rectangle in a binary grid",
  "Histogram reduction",
  "Input rows columns followed by the binary grid as space-separated 0/1 integers. Print the maximum area of an axis-aligned rectangle containing only ones.",
  "1 <= rows,columns <= 500.",
  (s) => {
    const a = matrix(s),
      h = Array(a[0].length).fill(0);
    let ans = 0;
    for (const row of a) {
      row.forEach((x, i) => (h[i] = x ? h[i] + 1 : 0));
      ans = Math.max(ans, histogram(h));
    }
    return ans;
  },
  [
    "3 4\n1 0 1 1\n1 1 1 1\n0 1 1 1",
    "1 1\n0",
    "1 1\n1",
    "2 3\n1 1 1\n1 1 1",
    "3 2\n0 0\n0 0\n0 0",
  ],
);

function automaton(s: string) {
  const next: Map<string, number>[] = [new Map()],
    len = [0],
    link = [-1],
    occ = [0];
  let last = 0;
  for (const c of s) {
    const cur = next.length;
    next.push(new Map());
    len.push(len[last] + 1);
    link.push(0);
    occ.push(1);
    let p = last;
    while (p >= 0 && !next[p].has(c)) {
      next[p].set(c, cur);
      p = link[p];
    }
    if (p >= 0) {
      const q = next[p].get(c)!;
      if (len[p] + 1 === len[q]) link[cur] = q;
      else {
        const clone = next.length;
        next.push(new Map(next[q]));
        len.push(len[p] + 1);
        link.push(link[q]);
        occ.push(0);
        while (p >= 0 && next[p].get(c) === q) {
          next[p].set(c, clone);
          p = link[p];
        }
        link[q] = link[cur] = clone;
      }
    }
    last = cur;
  }
  const order = len.map((_, i) => i).sort((a, b) => len[b] - len[a]);
  for (const u of order) if (link[u] >= 0) occ[link[u]] += occ[u];
  return { next, len, link, occ, order };
}
function prefix(s: string) {
  const p = Array(s.length).fill(0);
  for (let i = 1; i < s.length; i++) {
    let j = p[i - 1];
    while (j && s[i] !== s[j]) j = p[j - 1];
    if (s[i] === s[j]) j++;
    p[i] = j;
  }
  return p;
}
const stringCases = ["ababa", "banana", "a", "aaaa", "abcdef"];
// 71--80: suffix automata, failure links and palindromic structure.
add(
  "distinct-substrings",
  "Count all different substrings",
  "Suffix automaton",
  "Input one nonempty lowercase string. Print the number of distinct nonempty contiguous substring strings; repeated occurrences of the same substring count once.",
  "1 <= length <= 200000; answer fits signed 64-bit.",
  (s) => {
    const { len, link } = automaton(s.trim());
    return len.reduce((v, x, i) => v + (i ? x - len[link[i]] : 0), 0);
  },
  stringCases,
);
add(
  "longest-repeated-substring",
  "Longest substring occurring at least twice",
  "Suffix automaton occurrences",
  "Input a nonempty lowercase string. Print the maximum length of a substring occurring at least twice. Occurrences may overlap. Print 0 if no nonempty substring repeats.",
  "1 <= length <= 200000.",
  (s) => {
    const { len, occ } = automaton(s.trim());
    return len.reduce(
      (best, length, i) => (occ[i] >= 2 ? Math.max(best, length) : best),
      0,
    );
  },
  stringCases,
);
add(
  "kth-distinct-substring",
  "K-th lexicographic distinct substring",
  "Suffix automaton DP",
  "Input lowercase string S and positive integer K. Sort all distinct nonempty substrings of S lexicographically. Print the K-th string (1-based), or NONE if K exceeds the number of substrings.",
  "1 <= |S| <= 2000; 1 <= K <= 1000000000000; ordinary a..z lexicographic order.",
  (s) => {
    const [t, k] = words(s),
      a = automaton(t),
      d = Array(a.len.length).fill(0);
    for (const u of a.order)
      for (const v of a.next[u].values()) d[u] += 1 + d[v];
    let K = +k,
      u = 0,
      out = "";
    if (K > d[0]) return "NONE";
    while (K) {
      for (const [c, v] of [...a.next[u]].sort((a, b) =>
        a[0].localeCompare(b[0]),
      )) {
        if (K > 1 + d[v]) K -= 1 + d[v];
        else {
          out += c;
          K--;
          u = v;
          break;
        }
      }
    }
    return out;
  },
  ["ababa 5", "banana 3", "a 2", "aaaa 4", "abc 1"],
);
add(
  "minimum-cyclic-rotation",
  "Lexicographically smallest cyclic rotation",
  "Booth's algorithm",
  "Input a nonempty lowercase string. Print the lexicographically smallest rotation obtained by moving a prefix to the end; rotating by zero is allowed.",
  "1 <= length <= 200000.",
  (s) => {
    const a = s.trim(),
      b = a + a,
      n = a.length;
    let i = 0,
      j = 1,
      k = 0;
    while (i < n && j < n && k < n) {
      if (b[i + k] === b[j + k]) {
        k++;
        continue;
      }
      if (b[i + k] > b[j + k]) {
        i += k + 1;
        if (i === j) i++;
      } else {
        j += k + 1;
        if (i === j) j++;
      }
      k = 0;
    }
    const start = Math.min(i, j);
    return b.slice(start, start + n);
  },
  ["baca", "caba", "a", "aaaa", "dcba"],
);
add(
  "palindrome-partition-count",
  "Count every palindromic partition",
  "Palindrome counting DP",
  "Input one nonempty lowercase string. Count ways to divide it into nonempty contiguous palindromic pieces. Different cut positions count separately. Print modulo 1000000007.",
  "1 <= length <= 2000.",
  (s) => {
    const a = s.trim(),
      n = a.length,
      p = Array.from({ length: n }, () => Array(n).fill(false)),
      d = Array(n + 1).fill(0);
    d[0] = 1;
    for (let r = 0; r < n; r++)
      for (let l = 0; l <= r; l++)
        if (a[l] === a[r] && (r - l < 2 || p[l + 1][r - 1])) {
          p[l][r] = true;
          d[r + 1] = (d[r + 1] + d[l]) % MOD;
        }
    return d[n];
  },
  ["aab", "aaa", "a", "abc", "ababa"],
);
add(
  "multi-pattern-occurrences",
  "Count overlapping occurrences of many patterns",
  "Aho-Corasick",
  "Input lowercase text, m, then m distinct lowercase patterns. For each pattern in input order, print its number of occurrences in the text, one per line. Overlapping occurrences count.",
  "Text length <= 100000; m <= 1000; total pattern length <= 10000; all strings nonempty.",
  (s) => {
    const t = words(s),
      text = t[0],
      patterns = t.slice(2),
      next: Map<string, number>[] = [new Map()],
      fail = [0],
      count = [0],
      end: number[] = [];
    for (const p of patterns) {
      let u = 0;
      for (const c of p) {
        if (!next[u].has(c)) {
          next[u].set(c, next.length);
          next.push(new Map());
          fail.push(0);
          count.push(0);
        }
        u = next[u].get(c)!;
      }
      end.push(u);
    }
    const q = [...next[0].values()];
    for (let i = 0; i < q.length; i++) {
      const u = q[i];
      for (const [c, v] of next[u]) {
        let p = fail[u];
        while (p && !next[p].has(c)) p = fail[p];
        fail[v] = next[p].get(c) ?? 0;
        q.push(v);
      }
    }
    let u = 0;
    for (const c of text) {
      while (u && !next[u].has(c)) u = fail[u];
      u = next[u].get(c) ?? 0;
      count[u]++;
    }
    for (const v of q.slice().reverse()) count[fail[v]] += count[v];
    return end.map((v) => count[v]).join("\n");
  },
  [
    "ahishers 4\nhe she his hers",
    "aaaa 3\na aa aaa",
    "a 1\na",
    "abc 2\nd ef",
    "ababa 3\naba ba ab",
  ],
);
add(
  "longest-palindrome-length",
  "Longest palindromic substring in linear time",
  "Manacher's algorithm",
  "Input a nonempty lowercase string. Print the length of its longest contiguous palindromic substring.",
  "1 <= length <= 200000.",
  (s) => {
    const a = s.trim(),
      d1 = Array(a.length).fill(0),
      d2 = d1.slice();
    let l = 0,
      r = -1,
      ans = 1;
    for (let i = 0; i < a.length; i++) {
      let k = i > r ? 1 : Math.min(d1[l + r - i], r - i + 1);
      while (i - k >= 0 && i + k < a.length && a[i - k] === a[i + k]) k++;
      d1[i] = k;
      ans = Math.max(ans, 2 * k - 1);
      if (i + k - 1 > r) {
        l = i - k + 1;
        r = i + k - 1;
      }
    }
    l = 0;
    r = -1;
    for (let i = 0; i < a.length; i++) {
      let k = i > r ? 0 : Math.min(d2[l + r - i + 1], r - i + 1);
      while (i - k - 1 >= 0 && i + k < a.length && a[i - k - 1] === a[i + k])
        k++;
      d2[i] = k;
      ans = Math.max(ans, 2 * k);
      if (i + k - 1 > r) {
        l = i - k;
        r = i + k - 1;
      }
    }
    return ans;
  },
  ["babad", "cbbd", "a", "aaaa", "abacdfgdcaba"],
);
add(
  "shortest-front-palindrome",
  "Make a palindrome by prepending characters",
  "KMP prefix structure",
  "Input a nonempty lowercase string. Prepend as few characters as possible to make the entire result a palindrome. Print the resulting string.",
  "1 <= length <= 200000.",
  (s) => {
    const a = s.trim(),
      rev = [...a].reverse().join(""),
      p = prefix(a + "#" + rev),
      k = p.at(-1)!;
    return rev.slice(0, a.length - k) + a;
  },
  ["aacecaaa", "abcd", "a", "racecar", "abb"],
);
add(
  "longest-common-substring",
  "Longest contiguous match between two strings",
  "Suffix automaton matching",
  "Input two nonempty lowercase strings. Print the length of the longest string appearing contiguously in both inputs.",
  "Each string length <= 200000.",
  (s) => {
    const [a, b] = words(s),
      sam = automaton(a);
    let u = 0,
      len = 0,
      best = 0;
    for (const c of b) {
      while (u && !sam.next[u].has(c)) {
        u = sam.link[u];
        len = sam.len[u];
      }
      if (sam.next[u].has(c)) {
        u = sam.next[u].get(c)!;
        len++;
      } else {
        u = 0;
        len = 0;
      }
      best = Math.max(best, len);
    }
    return best;
  },
  ["xabxac abcabxabcd", "abc def", "a a", "aaaa aa", "banana ananas"],
);
add(
  "all-proper-borders",
  "Report all proper string borders",
  "Failure-link chains",
  "Input a nonempty lowercase string. A proper border is a nonempty prefix that is also a suffix but is shorter than the entire string. Print all border lengths in ascending order, or NONE.",
  "1 <= length <= 200000.",
  (s) => {
    const a = s.trim(),
      p = prefix(a),
      out: number[] = [];
    for (let k = p.at(-1)!; k; k = p[k - 1]) out.push(k);
    return out.length ? out.reverse().join(" ") : "NONE";
  },
  ["ababa", "aaaa", "a", "abcdef", "abcababcab"],
);

const mod = BigInt(MOD);
function powMod(a: bigint, n: bigint, m = mod) {
  let r = 1n;
  for (a %= m; n; n >>= 1n, a = (a * a) % m) if (n & 1n) r = (r * a) % m;
  return r;
}
function chooseExact(n: number, k: number) {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 1; i <= Math.min(k, n - k); i++)
    r = (r * BigInt(n - i + 1)) / BigInt(i);
  return r;
}
// 81--90: large-number combinatorics and profile/counting states.
add(
  "lucas-binomial",
  "Huge binomial coefficients modulo a small prime",
  "Lucas theorem",
  "Input nonnegative integers N K and a prime P. Print binomial(N,K) modulo P; print 0 when K>N.",
  "0 <= N,K <= 10^18; P is a prime between 2 and 97.",
  (s) => {
    const [x, y, z] = words(s);
    let n = BigInt(x),
      k = BigInt(y),
      p = BigInt(z),
      ans = 1n;
    if (k > n) return 0;
    while (n || k) {
      const a = Number(n % p),
        b = Number(k % p);
      if (b > a) return 0;
      ans = (ans * (chooseExact(a, b) % p)) % p;
      n /= p;
      k /= p;
    }
    return ans;
  },
  ["100 20 7", "10 3 5", "0 0 2", "5 9 3", "1000000000000000000 0 97"],
);
add(
  "balanced-parentheses-count",
  "Count balanced parenthesis strings exactly",
  "Catalan numbers",
  "Input n. Print the exact number of strings containing n opening and n closing parentheses that are balanced. The empty string for n=0 counts once.",
  "0 <= n <= 500; print the full integer with no scientific notation.",
  (s) => {
    const n = +s.trim();
    return chooseExact(2 * n, n) / BigInt(n + 1);
  },
  ["3", "5", "0", "1", "20"],
);
add(
  "derangement-count",
  "Permutations with no fixed positions",
  "Combinatorial recurrence",
  "Input n. Count permutations of 1..n in which no value remains in its original position. Print the exact integer. The empty permutation counts once.",
  "0 <= n <= 500; exact arbitrary-precision output required.",
  (s) => {
    const n = +s.trim();
    let a = 1n,
      b = 0n;
    if (!n) return a;
    for (let k = 2; k <= n; k++) {
      const c = BigInt(k - 1) * (a + b);
      a = b;
      b = c;
    }
    return b;
  },
  ["4", "6", "0", "1", "10"],
);
add(
  "restricted-integer-partitions",
  "Unordered partitions with bounded part size",
  "Generating-function DP",
  "Input total N and maximum part K. Count unordered ways to write N as a sum of positive integers at most K, allowing repetition. Print modulo 1000000007; N=0 has one empty partition.",
  "0 <= N <= 3000; 0 <= K <= 3000.",
  (s) => {
    const [n, k] = numbers(s),
      d = Array(n + 1).fill(0);
    d[0] = 1;
    for (let p = 1; p <= Math.min(n, k); p++)
      for (let v = p; v <= n; v++) d[v] = (d[v] + d[v - p]) % MOD;
    return d[n];
  },
  ["5 3", "7 7", "0 0", "4 0", "10 2"],
);
add(
  "connected-labelled-graphs",
  "Count connected labelled undirected graphs",
  "Combinatorial DP",
  "Input n. Count connected simple undirected graphs on labelled vertices 0..n-1, modulo 1000000007. The one-vertex graph counts once.",
  "1 <= n <= 250; self-loops and parallel edges are forbidden.",
  (s) => {
    const n = +s.trim(),
      c = Array<bigint>(n + 1).fill(0n),
      all = Array.from({ length: n + 1 }, (_, k) =>
        powMod(2n, BigInt((k * (k - 1)) / 2)),
      );
    for (let size = 1; size <= n; size++) {
      let value = all[size];
      for (let k = 1; k < size; k++)
        value =
          (value -
            (((((chooseExact(size - 1, k - 1) % mod) * c[k]) % mod) *
              all[size - k]) %
              mod) +
            mod) %
          mod;
      c[size] = value;
    }
    return c[n];
  },
  ["3", "4", "1", "2", "6"],
);
add(
  "surjective-mappings",
  "Count onto mappings between labelled sets",
  "Inclusion-exclusion",
  "Input domain size N and codomain size K. Count functions from N labelled elements to K labelled values in which every codomain value is used. Print modulo 1000000007. For N=K=0 the empty function counts once.",
  "0 <= N <= 10^9; 0 <= K <= 1000.",
  (s) => {
    const [n, k] = numbers(s);
    if (k > n) return 0;
    let ans = 0n;
    for (let i = 0; i <= k; i++) {
      const value =
        ((chooseExact(k, i) % mod) * powMod(BigInt(k - i), BigInt(n))) % mod;
      ans = (ans + (i % 2 ? -value : value) + mod) % mod;
    }
    return ans;
  },
  ["3 2", "4 3", "0 0", "0 1", "5 1"],
);
add(
  "bounded-compositions",
  "Distribute a total into bounded ordered slots",
  "Prefix-sum DP",
  "Input slot count n, total S and upper bound B. Count ordered n-tuples of integers each in [0,B] whose sum equals S. Print modulo 1000000007. With n=0 only S=0 is valid.",
  "0 <= n <= 500; 0 <= S <= 3000; 0 <= B <= 1000000.",
  (s) => {
    const [n, S, B] = numbers(s);
    let d = Array(S + 1).fill(0);
    d[0] = 1;
    for (let i = 0; i < n; i++) {
      const e = Array(S + 1).fill(0);
      let sum = 0;
      for (let v = 0; v <= S; v++) {
        sum = (sum + d[v] - (v > B ? d[v - B - 1] : 0) + MOD) % MOD;
        e[v] = sum;
      }
      d = e;
    }
    return d[S];
  },
  ["3 4 2", "2 3 3", "0 0 0", "0 1 4", "3 0 0"],
);
add(
  "general-linear-recurrence",
  "Evaluate a distant linear recurrence term",
  "Matrix exponentiation",
  "Input order d and index N, then d coefficients c1..cd and d initial terms F0..F(d-1). For n>=d, Fn=sum(ci*F(n-i)). Print FN modulo 1000000007.",
  "1 <= d <= 10; 0 <= N <= 10^9; coefficients and initial terms in [0,1000000006].",
  (s) => {
    const t = numbers(s),
      d = t[0];
    let N = t[1];
    if (N < d) return t[2 + d + N] % MOD;
    let a = Array.from({ length: d }, () => Array<bigint>(d).fill(0n)),
      b = a.map((r, i) => r.map((_, j) => BigInt(i === j)));
    for (let j = 0; j < d; j++) a[0][j] = BigInt(t[2 + j]);
    for (let i = 1; i < d; i++) a[i][i - 1] = 1n;
    const mul = (x: bigint[][], y: bigint[][]) =>
      x.map((r) =>
        y[0].map((_, j) => r.reduce((v, z, k) => (v + z * y[k][j]) % mod, 0n)),
      );
    N -= d - 1;
    while (N) {
      if (N % 2) b = mul(b, a);
      a = mul(a, a);
      N = Math.floor(N / 2);
    }
    return b[0].reduce(
      (v, x, j) => (v + x * BigInt(t[2 + d + d - 1 - j])) % mod,
      0n,
    );
  },
  [
    "2 10\n1 1\n0 1",
    "3 5\n1 1 1\n0 0 1",
    "1 0\n2\n7",
    "1 5\n2\n3",
    "2 1\n1 1\n5 8",
  ],
);
add(
  "blocked-domino-profile",
  "Tile a narrow board with blocked cells",
  "Profile DP",
  "Input height H, width W and W integer blocked-column masks. Bit r of a mask is 1 when cell at row r in that column is blocked. Count tilings of all unblocked cells using 1x2 or 2x1 dominoes. Print modulo 1000000007.",
  "1 <= H <= 6; 1 <= W <= 2000; each mask in [0,2^H-1].",
  (s) => {
    const t = numbers(s),
      H = t[0],
      W = t[1],
      full = (1 << H) - 1;
    let d = Array(1 << H).fill(0);
    d[0] = 1;
    for (let c = 0; c < W; c++) {
      const blocked = t[c + 2],
        e = Array(1 << H).fill(0);
      for (let mask = 0; mask <= full; mask++)
        if (d[mask] && !(mask & blocked)) {
          const fill = (occupied: number, next: number) => {
            if (occupied === full) {
              e[next] = (e[next] + d[mask]) % MOD;
              return;
            }
            let r = 0;
            while ((occupied >> r) & 1) r++;
            if (r + 1 < H && !((occupied >> (r + 1)) & 1))
              fill(occupied | (1 << r) | (1 << (r + 1)), next);
            if (c + 1 < W && !((t[c + 3] >> r) & 1))
              fill(occupied | (1 << r), next | (1 << r));
          };
          fill(mask | blocked, 0);
        }
      d = e;
    }
    return d[0];
  },
  ["2 3\n0 0 0", "2 2\n1 1", "1 1\n0", "1 1\n1", "3 2\n0 0"],
);
add(
  "general-perfect-matchings",
  "Count perfect matchings in a general graph",
  "Subset pairing DP",
  "Input an even vertex count n, m, then m undirected edges. Count sets of n/2 edges covering every vertex exactly once, modulo 1000000007. Vertices are labelled and an unordered matching counts once.",
  "2 <= n <= 20; no self-loops or duplicate edges; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s),
      a = Array(n).fill(0),
      memo = new Map<number, number>();
    for (const [u, v] of edges) {
      a[u] |= 1 << v;
      a[v] |= 1 << u;
    }
    const f = (mask: number): number => {
      if (!mask) return 1;
      if (memo.has(mask)) return memo.get(mask)!;
      const bit = mask & -mask,
        u = 31 - Math.clz32(bit);
      let ans = 0;
      for (let v = u + 1; v < n; v++)
        if ((mask >> v) & 1 && (a[u] >> v) & 1)
          ans = (ans + f(mask ^ bit ^ (1 << v))) % MOD;
      memo.set(mask, ans);
      return ans;
    };
    return f((1 << n) - 1);
  },
  [
    "4 6\n0 1\n0 2\n0 3\n1 2\n1 3\n2 3",
    "4 2\n0 1\n2 3",
    "2 0",
    "2 1\n0 1",
    "4 3\n0 1\n0 2\n0 3",
  ],
);

// 91--100: exact search, Steiner DP, geometry and linear algebra over XOR.
add(
  "n-queens-count",
  "Count non-attacking queen placements",
  "Bitmask backtracking",
  "Input n. Count ways to put n queens on an n by n chessboard with no shared row, column or diagonal. Rotations and reflections count as different arrangements. Print the exact count.",
  "1 <= n <= 14.",
  (s) => {
    const n = +s.trim(),
      full = (1 << n) - 1;
    const f = (cols: number, left: number, right: number): number => {
      if (cols === full) return 1;
      let choices = full & ~(cols | left | right),
        ans = 0;
      while (choices) {
        const bit = choices & -choices;
        choices -= bit;
        ans += f(cols | bit, ((left | bit) << 1) & full, (right | bit) >>> 1);
      }
      return ans;
    };
    return f(0, 0, 0);
  },
  ["4", "5", "1", "2", "8"],
);
add(
  "grid-all-cell-paths",
  "Visit every open grid cell exactly once",
  "Hamiltonian backtracking",
  "Input rows columns followed by grid values: -1 blocked, 0 ordinary, 1 start, 2 finish. There is exactly one start and one finish. Count orthogonal paths from start to finish that visit every nonblocked cell exactly once. Print the exact count.",
  "1 <= rows,columns <= 6; 2 <= nonblocked cells <= 20.",
  (s) => {
    const a = matrix(s),
      R = a.length,
      C = a[0].length,
      ids = Array.from({ length: R }, () => Array(C).fill(-1)),
      cells: number[][] = [];
    let start = 0,
      end = 0;
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++)
        if (a[r][c] >= 0) {
          ids[r][c] = cells.length;
          if (a[r][c] === 1) start = cells.length;
          if (a[r][c] === 2) end = cells.length;
          cells.push([r, c]);
        }
    const adj = cells.map(([r, c]) =>
        [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ]
          .filter(
            ([x, y]) => x >= 0 && x < R && y >= 0 && y < C && ids[x][y] >= 0,
          )
          .map(([x, y]) => ids[x][y]),
      ),
      full = (1 << cells.length) - 1,
      memo = new Map<number, bigint>();
    const f = (u: number, mask: number): bigint => {
      if (u === end) return mask === full ? 1n : 0n;
      const key = mask * cells.length + u;
      if (memo.has(key)) return memo.get(key)!;
      let ans = 0n;
      for (const v of adj[u])
        if (!((mask >> v) & 1)) ans += f(v, mask | (1 << v));
      memo.set(key, ans);
      return ans;
    };
    return f(start, 1 << start);
  },
  [
    "3 4\n1 0 0 0\n0 0 0 0\n0 0 2 -1",
    "2 2\n1 0\n0 2",
    "1 2\n1 2",
    "1 3\n1 -1 2",
    "2 3\n1 0 0\n0 0 2",
  ],
);
add(
  "weighted-set-cover",
  "Cheapest collection covering every skill",
  "Bitmask cover DP",
  "Input skill count n, set count m, then m lines cost mask, where bit j of mask indicates skill j. Choose any sets to cover all n skills. Print minimum total cost, or -1 if impossible. The empty selection costs 0 when n=0.",
  "0 <= n <= 18; 0 <= m <= 100; 0 <= cost <= 1000000; 0 <= mask < 2^n.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      m = t[1];
    let d = Array(1 << n).fill(Infinity);
    d[0] = 0;
    for (let i = 0; i < m; i++) {
      const c = t[2 + 2 * i],
        mask = t[3 + 2 * i],
        e = d.slice();
      for (let j = 0; j < d.length; j++)
        e[j | mask] = Math.min(e[j | mask], d[j] + c);
      d = e;
    }
    return Number.isFinite(d.at(-1)) ? d.at(-1)! : -1;
  },
  [
    "3 3\n5 3\n4 6\n12 7",
    "2 1\n7 1",
    "0 0",
    "2 2\n0 1\n3 2",
    "4 3\n2 3\n2 12\n9 15",
  ],
);
add(
  "weighted-independent-set",
  "Maximum-weight compatible vertex subset",
  "Branching on bitmasks",
  "Input n m, n signed vertex weights, then m undirected conflict edges. Choose a vertex subset containing no conflict edge and maximize its total weight. Empty selection is allowed. Print the maximum weight.",
  "1 <= n <= 24; |weights| <= 100000; vertices 0..n-1; no self-loops or duplicate edges.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      m = t[1],
      w = t.slice(2, n + 2),
      a = Array(n).fill(0),
      memo = new Map<number, number>();
    for (let i = 0; i < m; i++) {
      const u = t[n + 2 + 2 * i],
        v = t[n + 3 + 2 * i];
      a[u] |= 1 << v;
      a[v] |= 1 << u;
    }
    const f = (mask: number): number => {
      if (!mask) return 0;
      if (memo.has(mask)) return memo.get(mask)!;
      const bit = mask & -mask,
        u = 31 - Math.clz32(bit),
        rest = mask ^ bit,
        ans = Math.max(f(rest), w[u] + f(rest & ~a[u]));
      memo.set(mask, ans);
      return ans;
    };
    return f((1 << n) - 1);
  },
  [
    "3 2\n5 9 5\n0 1\n1 2",
    "3 3\n4 7 2\n0 1\n1 2\n0 2",
    "1 0\n-5",
    "3 0\n-1 2 3",
    "4 3\n2 3 4 5\n0 1\n1 2\n2 3",
  ],
);
add(
  "chromatic-number",
  "Minimum colors for a small graph",
  "Subset independent-set DP",
  "Input n m followed by m undirected edges. Assign a color to each vertex so adjacent vertices have different colors. Print the smallest possible number of colors.",
  "1 <= n <= 16; no self-loops or duplicate edges; vertices 0..n-1.",
  (s) => {
    const { n, edges } = graph(s),
      a = Array(n).fill(0),
      ind = Array(1 << n).fill(false),
      d = Array(1 << n).fill(n);
    edges.forEach(([u, v]) => {
      a[u] |= 1 << v;
      a[v] |= 1 << u;
    });
    ind[0] = true;
    d[0] = 0;
    for (let mask = 1; mask < 1 << n; mask++) {
      const bit = mask & -mask,
        u = 31 - Math.clz32(bit);
      ind[mask] = ind[mask ^ bit] && !(a[u] & (mask ^ bit));
      if (ind[mask]) {
        d[mask] = 1;
        continue;
      }
      for (let sub = mask; sub; sub = (sub - 1) & mask)
        if (sub & bit && ind[sub])
          d[mask] = Math.min(d[mask], 1 + d[mask ^ sub]);
    }
    return d.at(-1)!;
  },
  [
    "3 3\n0 1\n1 2\n0 2",
    "4 4\n0 1\n1 2\n2 3\n3 0",
    "1 0",
    "4 0",
    "5 5\n0 1\n1 2\n2 3\n3 4\n4 0",
  ],
);
add(
  "steiner-network",
  "Cheapest network joining required terminals",
  "Steiner subset DP",
  "Input n m k, k distinct terminal vertices, then m undirected edges u v positiveCost. Select edges so every terminal lies in one connected component, allowing extra vertices. Print minimum total selected-edge cost, or -1 if impossible.",
  "1 <= n <= 60; 1 <= k <= min(n,6); m <= 500; cost <= 10000; vertices 0..n-1.",
  (s) => {
    const t = numbers(s),
      n = t[0],
      m = t[1],
      k = t[2],
      term = t.slice(3, 3 + k),
      dist = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
      );
    for (let i = 0; i < m; i++) {
      const [u, v, w] = t.slice(3 + k + 3 * i, 6 + k + 3 * i);
      dist[u][v] = dist[v][u] = Math.min(dist[u][v], w);
    }
    for (let z = 0; z < n; z++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          dist[i][j] = Math.min(dist[i][j], dist[i][z] + dist[z][j]);
    const d = Array.from({ length: 1 << k }, () => Array(n).fill(Infinity));
    for (let i = 0; i < k; i++)
      for (let v = 0; v < n; v++) d[1 << i][v] = dist[term[i]][v];
    for (let mask = 1; mask < 1 << k; mask++) {
      for (let sub = (mask - 1) & mask; sub; sub = (sub - 1) & mask)
        for (let v = 0; v < n; v++)
          d[mask][v] = Math.min(d[mask][v], d[sub][v] + d[mask ^ sub][v]);
      const old = d[mask].slice();
      for (let v = 0; v < n; v++)
        for (let u = 0; u < n; u++)
          d[mask][v] = Math.min(d[mask][v], old[u] + dist[u][v]);
    }
    const ans = Math.min(...d.at(-1)!);
    return Number.isFinite(ans) ? ans : -1;
  },
  [
    "4 3 3\n1 2 3\n0 1 2\n0 2 2\n0 3 2",
    "3 1 2\n0 2\n0 1 1",
    "1 0 1\n0",
    "3 3 2\n0 2\n0 1 2\n1 2 2\n0 2 9",
    "4 4 3\n0 2 3\n0 1 1\n1 2 1\n1 3 1\n0 3 8",
  ],
);
add(
  "convex-hull-area",
  "Exact doubled area of a point-set hull",
  "Convex hull geometry",
  "Input n followed by n integer point pairs x y. Print twice the area of the convex hull as an exact nonnegative integer. Duplicate points are allowed; fewer than three noncollinear points have area 0.",
  "0 <= n <= 100000; |coordinates| <= 1000000000; arbitrary-precision area may be needed.",
  (s) => {
    const t = numbers(s),
      raw = Array.from({ length: t[0] }, (_, i) => [
        t[1 + 2 * i],
        t[2 + 2 * i],
      ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      p = raw.filter(
        (v, i) => !i || v[0] !== raw[i - 1][0] || v[1] !== raw[i - 1][1],
      );
    if (p.length < 3) return 0;
    const cross = (a: number[], b: number[], c: number[]) =>
      BigInt(b[0] - a[0]) * BigInt(c[1] - a[1]) -
      BigInt(b[1] - a[1]) * BigInt(c[0] - a[0]);
    const chain = (pts: number[][]) => {
      const h: number[][] = [];
      for (const v of pts) {
        while (h.length > 1 && cross(h.at(-2)!, h.at(-1)!, v) <= 0n) h.pop();
        h.push(v);
      }
      h.pop();
      return h;
    };
    const h = [...chain(p), ...chain(p.slice().reverse())];
    let area = 0n;
    for (let i = 0; i < h.length; i++) {
      const a = h[i],
        b = h[(i + 1) % h.length];
      area += BigInt(a[0]) * BigInt(b[1]) - BigInt(a[1]) * BigInt(b[0]);
    }
    return area < 0n ? -area : area;
  },
  [
    "4\n0 0\n2 0\n2 2\n0 2",
    "3\n0 0\n3 0\n0 2",
    "0",
    "3\n1 1\n2 2\n3 3",
    "5\n0 0\n1 0\n1 1\n0 1\n0 0",
  ],
);
add(
  "closest-pair-distance",
  "Closest pair of planar points",
  "Divide-and-conquer geometry",
  "Input n followed by n integer point coordinates x y. Print the smallest squared Euclidean distance between two distinct input indices. Duplicate coordinates produce distance 0.",
  "2 <= n <= 100000; |coordinates| <= 1000000; squared distances fit signed 64-bit.",
  (s) => {
    const t = numbers(s),
      p = Array.from({ length: t[0] }, (_, i) => [
        t[1 + 2 * i],
        t[2 + 2 * i],
      ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const distance = (a: number[], b: number[]) =>
      (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    const f = (a: number[][]): number => {
      if (a.length <= 3) {
        let ans = Infinity;
        for (let i = 0; i < a.length; i++)
          for (let j = 0; j < i; j++) ans = Math.min(ans, distance(a[i], a[j]));
        return ans;
      }
      const m = a.length >> 1,
        x = a[m][0];
      let best = Math.min(f(a.slice(0, m)), f(a.slice(m)));
      const strip = a
        .filter((v) => (v[0] - x) ** 2 < best)
        .sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < strip.length; i++)
        for (
          let j = i + 1;
          j < strip.length && (strip[j][1] - strip[i][1]) ** 2 < best;
          j++
        )
          best = Math.min(best, distance(strip[i], strip[j]));
      return best;
    };
    return f(p);
  },
  [
    "4\n0 0\n3 4\n1 1\n8 8",
    "2\n-1 -1\n2 3",
    "2\n5 5\n5 5",
    "3\n0 0\n10 0\n11 0",
    "4\n0 0\n2 2\n2 0\n0 2",
  ],
);
add(
  "rectangle-union-area",
  "Exact area covered by axis-aligned rectangles",
  "Sweep-line geometry",
  "Input n followed by n rectangles x1 y1 x2 y2, each representing [x1,x2) by [y1,y2). Print the exact area of their union; overlapping area counts once.",
  "0 <= n <= 2000; -10^9 <= x1 < x2 <= 10^9 and similarly for y; use arbitrary-precision area if needed.",
  (s) => {
    const t = numbers(s),
      rect = Array.from({ length: t[0] }, (_, i) =>
        t.slice(1 + 4 * i, 5 + 4 * i),
      ),
      events = rect
        .flatMap((r, i) => [
          [r[0], 1, i],
          [r[2], -1, i],
        ])
        .sort((a, b) => a[0] - b[0]),
      active = new Set<number>();
    let area = 0n,
      last = events[0]?.[0] ?? 0;
    for (let i = 0; i < events.length;) {
      const x = events[i][0],
        ys = [...active]
          .map((j) => [rect[j][1], rect[j][3]])
          .sort((a, b) => a[0] - b[0]);
      let covered = 0,
        l = 0,
        r = 0,
        started = false;
      for (const [a, b] of ys) {
        if (!started) {
          l = a;
          r = b;
          started = true;
        } else if (a > r) {
          covered += r - l;
          l = a;
          r = b;
        } else r = Math.max(r, b);
      }
      if (started) covered += r - l;
      area += BigInt(x - last) * BigInt(covered);
      while (i < events.length && events[i][0] === x) {
        const [, kind, j] = events[i++];
        if (kind === 1) active.add(j);
        else active.delete(j);
      }
      last = x;
    }
    return area;
  },
  [
    "2\n0 0 2 2\n1 1 3 3",
    "2\n0 0 1 1\n1 0 2 1",
    "0",
    "2\n0 0 2 2\n0 0 2 2",
    "1\n-1000000000 -1000000000 1000000000 1000000000",
  ],
);
add(
  "kth-distinct-subset-xor",
  "K-th smallest distinct subset XOR",
  "XOR linear basis",
  "Input n and a nonnegative 0-based index K followed by n nonnegative integers. Form the XOR of every subset, including the empty subset, discard duplicate results, and sort ascending. Print the result at index K or NONE if the index is out of range.",
  "0 <= n <= 100000; each value < 2^30; 0 <= K <= 10^12.",
  (s) => {
    const t = numbers(s),
      basis = Array(30).fill(0);
    for (let x of t.slice(2))
      for (let b = 29; b >= 0; b--)
        if ((x >>> b) & 1) {
          if (!basis[b]) {
            basis[b] = x;
            break;
          }
          x ^= basis[b];
        }
    for (let i = 0; i < 30; i++)
      if (basis[i])
        for (let j = i + 1; j < 30; j++)
          if ((basis[j] >>> i) & 1) basis[j] ^= basis[i];
    const b = basis.filter(Boolean),
      K = t[1];
    if (K >= 2 ** b.length) return "NONE";
    let ans = 0;
    for (let i = 0; i < b.length; i++)
      if (Math.floor(K / 2 ** i) % 2) ans ^= b[i];
    return ans;
  },
  ["3 3\n1 2 3", "2 2\n2 4", "0 0", "0 1", "4 1\n7 7 7 7"],
);

export const hardProblems: PracticeDefinition[] = bank;
