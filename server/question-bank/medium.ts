import type { PracticeDefinition } from "./types.js";

// Reference implementations and private cases stay on the server. Each entry
// is a separate algorithmic task; inputs are deliberately small, varied fixtures.
const MOD = 1_000_000_007;
const numbers = (s: string) =>
  s.trim().split(/\s+/).filter(Boolean).map(Number);
const lines = (s: string) => s.replace(/\r/g, "").trimEnd().split("\n");
const array = (s: string) => {
  const a = numbers(s);
  return a.slice(1, 1 + a[0]);
};
const pairs = (a: number[], start: number, n: number) =>
  Array.from({ length: n }, (_, i) =>
    a.slice(start + 2 * i, start + 2 * i + 2),
  );
const matrix = (s: string) => {
  const a = numbers(s),
    r = a[0],
    c = a[1];
  return {
    r,
    c,
    g: Array.from({ length: r }, (_, i) => a.slice(2 + i * c, 2 + (i + 1) * c)),
  };
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const out = (a: unknown[]) => a.join(" ");
function define(
  id: string,
  title: string,
  topic: string,
  task: string,
  format: string,
  constraints: string,
  solve: (input: string) => string | number,
  inputs: string[],
): PracticeDefinition {
  const run = (input: string) => String(solve(input));
  const tests = inputs.map((input, i) => ({
    input,
    output: run(input),
    hidden: i >= 2,
  }));
  return {
    id: `medium-${id}`,
    title,
    difficulty: "Medium",
    topic,
    description: `${task}\n\n${format}\nWrite a complete program that reads standard input and writes only the required answer to standard output.`,
    constraints,
    solve: run,
    examples: tests.slice(0, 2).map(({ input, output }) => ({ input, output })),
    tests,
  };
}
const A =
  "Input: n, followed by n space-separated integers. Output: one integer.";
const S =
  "Input: one nonempty line containing the string. Output: one integer.";
const TWO =
  "Input: the first string on line 1 and the second string on line 2. Output: one integer.";
const NC = "1 <= n <= 100000; each value is between -1000000 and 1000000.";
const gridCases = [
  "3 3\n1 1 0\n0 1 0\n0 0 1",
  "2 2\n0 0\n0 0",
  "1 1\n1",
  "2 3\n1 1 1\n1 1 1",
  "3 3\n1 0 1\n0 1 0\n1 0 1",
];
const four = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
function graphInput(s: string, directed = false, weighted = false) {
  const a = numbers(s),
    n = a[0],
    m = a[1],
    k = weighted ? 3 : 2;
  const edges = Array.from({ length: m }, (_, i) =>
    a.slice(2 + i * k, 2 + (i + 1) * k),
  );
  const adj: number[][][] = Array.from({ length: n }, () => []);
  for (const [u, v, w = 1] of edges) {
    adj[u].push([v, w]);
    if (!directed) adj[v].push([u, w]);
  }
  return { n, m, edges, adj, rest: a.slice(2 + m * k) };
}
function dsu(n: number) {
  const p = Array.from({ length: n }, (_, i) => i),
    size = Array(n).fill(1);
  const find = (x: number): number => {
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  };
  const join = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a === b) return false;
    if (size[a] < size[b]) [a, b] = [b, a];
    p[b] = a;
    size[a] += size[b];
    return true;
  };
  return { find, join, size };
}
function lower(a: number[], x: number) {
  let l = 0,
    r = a.length;
  while (l < r) {
    const m = (l + r) >> 1;
    if (a[m] < x) l = m + 1;
    else r = m;
  }
  return l;
}
function upper(a: number[], x: number, end = a.length) {
  let l = 0,
    r = end;
  while (l < r) {
    const m = (l + r) >> 1;
    if (a[m] <= x) l = m + 1;
    else r = m;
  }
  return l;
}
function least(lo: number, hi: number, feasible: (x: number) => boolean) {
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (feasible(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
function treeInput(s: string) {
  const a = numbers(s),
    n = a[0],
    adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of pairs(a, 1, n - 1)) {
    adj[u].push(v);
    adj[v].push(u);
  }
  return { n, adj, rest: a.slice(1 + 2 * (n - 1)) };
}
function treeOrder(adj: number[][]) {
  const parent = Array(adj.length).fill(-1),
    order = [0];
  parent[0] = 0;
  for (let k = 0; k < order.length; k++)
    for (const v of adj[order[k]])
      if (parent[v] === -1) {
        parent[v] = order[k];
        order.push(v);
      }
  return { parent, order };
}

export const mediumProblems: PracticeDefinition[] = [
  define(
    "maximum-subarray",
    "Maximum Contiguous Sum",
    "Arrays",
    "Find the largest sum of a nonempty contiguous subarray.",
    A,
    NC,
    (s) => {
      const a = array(s);
      let best = a[0],
        cur = a[0];
      for (const x of a.slice(1)) {
        cur = Math.max(x, cur + x);
        best = Math.max(best, cur);
      }
      return best;
    },
    [
      "9\n-2 1 -3 4 -1 2 1 -5 4",
      "3\n-5 -2 -8",
      "1\n7",
      "5\n0 0 0 0 0",
      "5\n3 -1 2 -5 4",
    ],
  ),
  define(
    "maximum-product",
    "Maximum Product Segment",
    "Arrays",
    "Find the maximum product of a nonempty contiguous subarray.",
    A,
    "1 <= n <= 15; -4 <= value <= 4; all intermediate products fit in a signed 32-bit integer.",
    (s) => {
      const a = array(s);
      let hi = a[0],
        lo = a[0],
        best = hi;
      for (const x of a.slice(1)) {
        const p = hi * x,
          q = lo * x;
        hi = Math.max(x, p, q);
        lo = Math.min(x, p, q);
        best = Math.max(best, hi);
      }
      return best;
    },
    ["4\n2 3 -2 4", "3\n-2 0 -1", "1\n-3", "4\n-1 -2 -3 -4", "5\n0 2 -2 0 4"],
  ),
  define(
    "longest-zero-sum",
    "Longest Zero-Sum Segment",
    "Prefix sums",
    "Find the length of the longest contiguous subarray whose sum is zero. Print 0 if none exists.",
    A,
    NC,
    (s) => {
      let p = 0,
        b = 0;
      const seen = new Map([[0, -1]]);
      array(s).forEach((x, i) => {
        p += x;
        if (seen.has(p)) b = Math.max(b, i - seen.get(p)!);
        else seen.set(p, i);
      });
      return b;
    },
    ["6\n1 2 -3 3 -3 4", "3\n1 2 3", "1\n0", "4\n0 0 0 0", "5\n2 -2 5 -5 1"],
  ),
  define(
    "subarray-target-count",
    "Count Target-Sum Segments",
    "Hashing",
    "Count contiguous nonempty subarrays whose sum equals k.",
    "Input: n and k, followed by n integers. Output: the count.",
    NC + "; -1000000 <= k <= 1000000.",
    (s) => {
      const a = numbers(s),
        k = a[1],
        seen = new Map([[0, 1]]);
      let p = 0,
        count = 0;
      for (const x of a.slice(2)) {
        p += x;
        count += seen.get(p - k) || 0;
        seen.set(p, (seen.get(p) || 0) + 1);
      }
      return count;
    },
    [
      "3 2\n1 1 1",
      "5 0\n1 -1 0 2 -2",
      "1 5\n5",
      "4 9\n1 2 3 4",
      "4 0\n0 0 0 0",
    ],
  ),
  define(
    "divisible-subarrays",
    "Segments Divisible by K",
    "Prefix sums",
    "Count nonempty contiguous subarrays whose sum is divisible by positive k.",
    "Input: n and k, followed by n integers. Output: the count.",
    NC + "; 1 <= k <= 100000.",
    (s) => {
      const a = numbers(s),
        k = a[1],
        freq = new Map([[0, 1]]);
      let p = 0,
        ans = 0;
      for (const x of a.slice(2)) {
        p = (((p + x) % k) + k) % k;
        ans += freq.get(p) || 0;
        freq.set(p, (freq.get(p) || 0) + 1);
      }
      return ans;
    },
    [
      "6 5\n4 5 0 -2 -3 1",
      "3 3\n1 2 3",
      "1 2\n-4",
      "4 1\n1 2 3 4",
      "3 7\n1 1 1",
    ],
  ),
  define(
    "longest-consecutive",
    "Longest Consecutive Value Chain",
    "Hashing",
    "Find the length of the longest sequence of consecutive integer values present in the array. Their original order does not matter; duplicates count once.",
    A,
    NC,
    (s) => {
      const set = new Set(array(s));
      let ans = 0;
      for (const x of set)
        if (!set.has(x - 1)) {
          let k = x;
          while (set.has(k)) k++;
          ans = Math.max(ans, k - x);
        }
      return ans;
    },
    [
      "6\n100 4 200 1 3 2",
      "6\n1 2 2 3 8 9",
      "1\n-5",
      "5\n-2 -1 0 1 2",
      "3\n10 20 30",
    ],
  ),
  define(
    "zero-sum-triplets",
    "Distinct Zero-Sum Triplets",
    "Two pointers",
    "Count distinct value triplets (a,b,c) with a <= b <= c and a+b+c=0 that can be selected at three different array indices. Repeated identical value triplets count once.",
    A,
    "3 <= n <= 1000; -100000 <= value <= 100000.",
    (s) => {
      const a = array(s).sort((x, y) => x - y);
      let ans = 0;
      for (let i = 0; i < a.length - 2; i++) {
        if (i && a[i] === a[i - 1]) continue;
        let l = i + 1,
          r = a.length - 1;
        while (l < r) {
          const v = a[i] + a[l] + a[r];
          if (v < 0) l++;
          else if (v > 0) r--;
          else {
            ans++;
            const x = a[l],
              y = a[r];
            while (l < r && a[l] === x) l++;
            while (l < r && a[r] === y) r--;
          }
        }
      }
      return ans;
    },
    [
      "6\n-1 0 1 2 -1 -4",
      "4\n0 0 0 0",
      "3\n1 2 3",
      "5\n-2 -1 0 1 2",
      "6\n-2 0 0 2 2 4",
    ],
  ),
  define(
    "triangle-count",
    "Count Valid Triangle Choices",
    "Sorting",
    "Count index triples whose positive values can be side lengths of a nondegenerate triangle.",
    A,
    "3 <= n <= 2000; 1 <= value <= 1000000.",
    (s) => {
      const a = array(s).sort((x, y) => x - y);
      let ans = 0;
      for (let k = a.length - 1; k >= 2; k--) {
        let i = 0,
          j = k - 1;
        while (i < j)
          if (a[i] + a[j] > a[k]) {
            ans += j - i;
            j--;
          } else i++;
      }
      return ans;
    },
    ["4\n2 2 3 4", "3\n1 2 3", "3\n3 4 5", "5\n2 2 2 2 2", "4\n1 1 1 10"],
  ),
  define(
    "water-container",
    "Widest Water Container",
    "Two pointers",
    "At index i a vertical line has height h[i]. Choose two lines to maximize min(h[i],h[j])*(j-i). Print the maximum area.",
    A,
    "2 <= n <= 100000; 0 <= h[i] <= 100000.",
    (s) => {
      const a = array(s);
      let l = 0,
        r = a.length - 1,
        b = 0;
      while (l < r) {
        b = Math.max(b, Math.min(a[l], a[r]) * (r - l));
        if (a[l] < a[r]) l++;
        else r--;
      }
      return b;
    },
    [
      "9\n1 8 6 2 5 4 8 3 7",
      "2\n1 1",
      "4\n0 0 0 0",
      "5\n5 4 3 2 1",
      "4\n3 1 1 3",
    ],
  ),
  define(
    "trapped-water",
    "Rainwater Between Bars",
    "Two pointers",
    "Each array value is the height of a unit-width bar. Compute the total units of water trapped after rain.",
    A,
    "1 <= n <= 100000; 0 <= height <= 100000.",
    (s) => {
      const a = array(s);
      let l = 0,
        r = a.length - 1,
        lm = 0,
        rm = 0,
        ans = 0;
      while (l <= r)
        if (lm <= rm) {
          lm = Math.max(lm, a[l]);
          ans += lm - a[l++];
        } else {
          rm = Math.max(rm, a[r]);
          ans += rm - a[r--];
        }
      return ans;
    },
    [
      "12\n0 1 0 2 1 0 1 3 2 1 2 1",
      "3\n3 0 3",
      "1\n5",
      "5\n1 2 3 4 5",
      "5\n4 1 0 2 4",
    ],
  ),
  define(
    "rotated-minimum",
    "Minimum of a Rotated Sorted Array",
    "Binary search",
    "The array contains distinct integers and is a rotation of a strictly increasing array. Find its minimum value in O(log n) time.",
    A,
    NC,
    (s) => {
      const a = array(s);
      let l = 0,
        r = a.length - 1;
      while (l < r) {
        const m = (l + r) >> 1;
        if (a[m] > a[r]) l = m + 1;
        else r = m;
      }
      return a[l];
    },
    ["5\n3 4 5 1 2", "4\n1 2 3 4", "1\n7", "6\n2 3 4 5 6 1", "4\n0 2 -4 -1"],
  ),
  define(
    "rotated-search",
    "Search a Rotated Array",
    "Binary search",
    "Find the 0-based index of target x in a rotated strictly increasing array of distinct integers. Print -1 when absent. Use O(log n) time.",
    "Input: n and x, followed by n integers. Output: the index or -1.",
    NC,
    (s) => {
      const v = numbers(s),
        x = v[1],
        a = v.slice(2);
      let l = 0,
        r = a.length - 1;
      while (l <= r) {
        const m = (l + r) >> 1;
        if (a[m] === x) return m;
        if (a[l] <= a[m]) {
          if (a[l] <= x && x < a[m]) r = m - 1;
          else l = m + 1;
        } else if (a[m] < x && x <= a[r]) l = m + 1;
        else r = m - 1;
      }
      return -1;
    },
    [
      "7 0\n4 5 6 7 0 1 2",
      "7 3\n4 5 6 7 0 1 2",
      "1 5\n5",
      "3 1\n1 2 3",
      "4 -4\n0 2 -4 -1",
    ],
  ),
  define(
    "kth-two-sorted",
    "Kth Value from Two Sorted Arrays",
    "Binary search",
    "Find the k-th smallest value in the multiset union of two ascending arrays; k is 1-based. Aim for logarithmic partition search.",
    "Input: n m k; n sorted integers; m sorted integers. Output: the k-th value.",
    "1 <= n,m <= 100000; 1 <= k <= n+m; values between -1000000 and 1000000.",
    (s) => {
      const t = numbers(s),
        n = t[0],
        m = t[1],
        k = t[2],
        a = t.slice(3, 3 + n),
        b = t.slice(3 + n);
      let l = Math.max(0, k - m),
        r = Math.min(k, n);
      while (l <= r) {
        const i = (l + r) >> 1,
          j = k - i,
          al = i ? a[i - 1] : -Infinity,
          ar = i < n ? a[i] : Infinity,
          bl = j ? b[j - 1] : -Infinity,
          br = j < m ? b[j] : Infinity;
        if (al <= br && bl <= ar) return Math.max(al, bl);
        if (al > br) r = i - 1;
        else l = i + 1;
      }
      return 0;
    },
    [
      "3 4 4\n1 3 5\n2 4 6 8",
      "2 2 1\n-2 0\n-1 3",
      "1 1 2\n4\n5",
      "3 2 5\n1 1 1\n1 1",
      "2 3 3\n10 20\n1 2 3",
    ],
  ),
  define(
    "mountain-peak",
    "Peak of a Mountain Array",
    "Binary search",
    "The array strictly increases to one peak and then strictly decreases. Return the peak's 0-based index using O(log n) comparisons.",
    A,
    "3 <= n <= 100000; exactly one peak; both slopes contain at least one element.",
    (s) => {
      const a = array(s);
      let l = 0,
        r = a.length - 1;
      while (l < r) {
        const m = (l + r) >> 1;
        if (a[m] < a[m + 1]) l = m + 1;
        else r = m;
      }
      return l;
    },
    [
      "5\n1 3 7 4 2",
      "3\n0 2 1",
      "4\n1 2 5 0",
      "6\n-5 -3 -1 4 2 0",
      "4\n5 9 6 1",
    ],
  ),
  define(
    "shipping-capacity",
    "Minimum Daily Shipping Capacity",
    "Binary search on answer",
    "Ship packages in their listed order within d days. Each day ships a contiguous next group with total weight at most capacity. Find the smallest capacity.",
    "Input: n d, followed by n positive package weights. Output: minimum capacity.",
    "1 <= n <= 100000; 1 <= d <= n; 1 <= weight <= 10000.",
    (s) => {
      const t = numbers(s),
        d = t[1],
        a = t.slice(2);
      return least(Math.max(...a), sum(a), (cap) => {
        let days = 1,
          w = 0;
        for (const x of a) {
          if (w + x > cap) {
            days++;
            w = 0;
          }
          w += x;
        }
        return days <= d;
      });
    },
    ["5 3\n1 2 3 4 5", "3 1\n2 3 4", "3 3\n2 3 4", "4 2\n5 5 5 5", "1 1\n9"],
  ),
  define(
    "bouquet-day",
    "Earliest Bouquet Day",
    "Binary search on answer",
    "Flower i blooms on day a[i]. A bouquet needs k adjacent bloomed flowers, and a flower is used once. Find the earliest day to make m bouquets, or -1 if impossible.",
    "Input: n m k, followed by n positive bloom days. Output: earliest day or -1.",
    "1 <= n <= 100000; 1 <= m,k <= 100000; bloom days <= 1000000000.",
    (s) => {
      const t = numbers(s),
        n = t[0],
        m = t[1],
        k = t[2],
        a = t.slice(3);
      if (m * k > n) return -1;
      return least(Math.min(...a), Math.max(...a), (day) => {
        let run = 0,
          b = 0;
        for (const x of a) {
          run = x <= day ? run + 1 : 0;
          if (run === k) {
            b++;
            run = 0;
          }
        }
        return b >= m;
      });
    },
    [
      "5 3 1\n1 10 3 10 2",
      "5 3 2\n1 10 3 10 2",
      "6 2 3\n7 7 7 7 12 7",
      "1 1 1\n4",
      "4 2 2\n2 2 2 2",
    ],
  ),
  define(
    "separated-stalls",
    "Maximize Minimum Stall Distance",
    "Greedy and binary search",
    "Place k animals in distinct stalls to maximize the minimum distance between any two placed animals.",
    "Input: n k, followed by n distinct integer stall positions in any order. Output: largest minimum distance.",
    "2 <= k <= n <= 100000; positions between 0 and 1000000000.",
    (s) => {
      const t = numbers(s),
        k = t[1],
        a = t.slice(2).sort((x, y) => x - y);
      let l = 0,
        r = a.at(-1)! - a[0];
      while (l < r) {
        const d = Math.ceil((l + r) / 2);
        let placed = 1,
          last = a[0];
        for (const x of a.slice(1))
          if (x - last >= d) {
            placed++;
            last = x;
          }
        if (placed >= k) l = d;
        else r = d - 1;
      }
      return l;
    },
    [
      "5 3\n1 2 8 4 9",
      "2 2\n0 10",
      "4 4\n2 4 6 8",
      "5 2\n10 20 30 40 50",
      "3 2\n0 1 2",
    ],
  ),
  define(
    "kth-pair-distance",
    "Kth Smallest Pair Distance",
    "Binary search and two pointers",
    "For every index pair i<j, form abs(a[i]-a[j]). Return the k-th smallest distance, counting equal distances separately.",
    "Input: n k, followed by n integers. Output: one distance.",
    "2 <= n <= 30000; 1 <= k <= n*(n-1)/2; 0 <= value <= 1000000.",
    (s) => {
      const t = numbers(s),
        k = t[1],
        a = t.slice(2).sort((x, y) => x - y);
      return least(0, a.at(-1)! - a[0], (d) => {
        let l = 0,
          count = 0;
        for (let r = 0; r < a.length; r++) {
          while (a[r] - a[l] > d) l++;
          count += r - l;
        }
        return count >= k;
      });
    },
    ["3 1\n1 3 1", "3 3\n1 3 1", "2 1\n0 5", "4 4\n2 2 2 2", "4 5\n1 2 4 8"],
  ),
  define(
    "balanced-partition",
    "Closest Partition Sums",
    "Dynamic programming",
    "Split all nonnegative values into two groups, either possibly empty, minimizing the absolute difference of their sums.",
    A,
    "1 <= n <= 100; 0 <= value <= 100; total sum <= 10000.",
    (s) => {
      const a = array(s),
        total = sum(a),
        can = Array(Math.floor(total / 2) + 1).fill(false);
      can[0] = true;
      for (const x of a)
        for (let j = can.length - 1; j >= x; j--) can[j] ||= can[j - x];
      for (let j = can.length - 1; j >= 0; j--)
        if (can[j]) return total - 2 * j;
      return total;
    },
    ["4\n1 6 11 5", "3\n1 2 3", "1\n9", "4\n0 0 0 0", "4\n2 2 2 2"],
  ),
  define(
    "merge-intervals",
    "Union of Overlapping Intervals",
    "Intervals",
    "Merge overlapping or touching closed intervals and print them in increasing start order.",
    "Input: n, followed by n lines 'start end'. Output: number of merged intervals, then each merged interval on its own line.",
    "1 <= n <= 100000; -1000000 <= start <= end <= 1000000.",
    (s) => {
      const t = numbers(s),
        a = pairs(t, 1, t[0]).sort((x, y) => x[0] - y[0]),
        b: number[][] = [];
      for (const x of a) {
        const last = b.at(-1);
        if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
        else b.push([...x]);
      }
      return b.length + "\n" + b.map(out).join("\n");
    },
    [
      "4\n1 3\n2 6\n8 10\n10 12",
      "2\n5 7\n1 2",
      "1\n0 0",
      "3\n1 9\n2 3\n4 5",
      "3\n-4 -2\n-2 0\n1 1",
    ],
  ),
  define(
    "meeting-rooms",
    "Minimum Meeting Rooms",
    "Sweep line",
    "Find the minimum rooms needed for all meetings. Meetings use half-open intervals [start,end), so a room ending at t can host a meeting starting at t.",
    "Input: n, then n lines start end. Output: minimum rooms.",
    "1 <= n <= 100000; 0 <= start < end <= 1000000000.",
    (s) => {
      const t = numbers(s),
        events = pairs(t, 1, t[0])
          .flatMap(([a, b]) => [
            [a, 1],
            [b, -1],
          ])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let x = 0,
        best = 0;
      for (const [, d] of events) {
        x += d;
        best = Math.max(best, x);
      }
      return best;
    },
    [
      "3\n0 30\n5 10\n15 20",
      "2\n1 2\n2 3",
      "1\n4 8",
      "3\n1 5\n1 5\n1 5",
      "3\n0 1\n3 4\n6 7",
    ],
  ),
  define(
    "activity-selection",
    "Most Compatible Activities",
    "Greedy",
    "Choose the largest number of nonoverlapping activities. Intervals are half-open [start,end); touching endpoints are compatible.",
    "Input: n, followed by n pairs start end. Output: maximum number selected.",
    "1 <= n <= 100000; 0 <= start < end <= 1000000000.",
    (s) => {
      const t = numbers(s),
        a = pairs(t, 1, t[0]).sort((x, y) => x[1] - y[1]);
      let end = -Infinity,
        ans = 0;
      for (const [l, r] of a)
        if (l >= end) {
          ans++;
          end = r;
        }
      return ans;
    },
    [
      "4\n1 3\n2 4\n3 5\n5 6",
      "3\n0 10\n1 2\n2 3",
      "1\n5 6",
      "3\n1 2\n1 2\n1 2",
      "3\n0 1\n2 3\n4 5",
    ],
  ),
  define(
    "interval-piercing",
    "Fewest Points Covering Closed Intervals",
    "Greedy intervals",
    "Choose the fewest real-number points so that every closed interval contains at least one chosen point. Only the number of points is required. A point at a shared endpoint covers both touching intervals.",
    "Input: n, followed by n lines left right. Output: minimum number of chosen points.",
    "1 <= n <= 100000; -1000000 <= left <= right <= 1000000.",
    (s) => {
      const t = numbers(s),
        a = pairs(t, 1, t[0]).sort((x, y) => x[1] - y[1]);
      let point = -Infinity,
        count = 0;
      for (const [l, r] of a)
        if (l > point) {
          point = r;
          count++;
        }
      return count;
    },
    [
      "4\n10 16\n2 8\n1 6\n7 12",
      "2\n1 2\n2 3",
      "1\n0 0",
      "3\n1 2\n3 4\n5 6",
      "3\n-4 5\n-2 3\n0 1",
    ],
  ),
  define(
    "interval-intersection",
    "Intersection of Two Interval Lists",
    "Two pointers",
    "Each input list contains disjoint closed intervals sorted by start. Print their nonempty intersections in sorted order; a single point is a valid intersection.",
    "Input: n m, then n pairs for A, then m pairs for B. Output: count, then intersection pairs on separate lines. Print only 0 if none.",
    "1 <= n,m <= 100000; 0 <= start <= end <= 1000000000; intervals within a list do not touch.",
    (s) => {
      const t = numbers(s),
        a = pairs(t, 2, t[0]),
        b = pairs(t, 2 + 2 * t[0], t[1]),
        ans: number[][] = [];
      let i = 0,
        j = 0;
      while (i < a.length && j < b.length) {
        const l = Math.max(a[i][0], b[j][0]),
          r = Math.min(a[i][1], b[j][1]);
        if (l <= r) ans.push([l, r]);
        if (a[i][1] < b[j][1]) i++;
        else j++;
      }
      return ans.length + (ans.length ? "\n" + ans.map(out).join("\n") : "");
    },
    [
      "2 2\n0 2\n5 10\n1 5\n8 12",
      "1 1\n0 1\n2 3",
      "1 1\n1 4\n4 8",
      "1 1\n0 10\n2 3",
      "2 1\n0 0\n3 3\n0 3",
    ],
  ),
  define(
    "insert-interval",
    "Insert a New Interval",
    "Intervals",
    "Insert one closed interval into an already sorted nonoverlapping list, merging all touching or overlapping intervals.",
    "Input: n, n pairs start end, then the new pair. Output: count, then resulting pairs on separate lines.",
    "0 <= n <= 100000; endpoints between 0 and 1000000000; start <= end.",
    (s) => {
      const t = numbers(s),
        a = pairs(t, 1, t[0]),
        v = t.slice(1 + 2 * t[0]);
      a.push(v);
      a.sort((x, y) => x[0] - y[0]);
      const b: number[][] = [];
      for (const p of a) {
        const x = b.at(-1);
        if (x && p[0] <= x[1]) x[1] = Math.max(x[1], p[1]);
        else b.push([...p]);
      }
      return b.length + "\n" + b.map(out).join("\n");
    },
    [
      "2\n1 3\n6 9\n2 5",
      "0\n4 7",
      "2\n1 2\n5 6\n3 4",
      "3\n1 2\n4 5\n7 8\n0 10",
      "1\n1 9\n3 4",
    ],
  ),
  define(
    "car-fleets",
    "Car Fleets at the Destination",
    "Sorting and stack",
    "Cars travel toward target with constant positive speeds. A faster car that catches a car ahead slows to that car's speed and forms a fleet. Cars catching exactly at target are one fleet. Count fleets arriving.",
    "Input: n target, then n lines position speed. Output: fleet count.",
    "1 <= n <= 100000; distinct 0 <= position < target <= 1000000; 1 <= speed <= 1000000.",
    (s) => {
      const t = numbers(s),
        a = pairs(t, 2, t[0]).sort((x, y) => y[0] - x[0]);
      let last = -1,
        ans = 0;
      for (const [p, v] of a) {
        const time = (t[1] - p) / v;
        if (time > last) {
          ans++;
          last = time;
        }
      }
      return ans;
    },
    [
      "5 12\n10 2\n8 4\n0 1\n5 1\n3 3",
      "2 10\n0 1\n5 1",
      "1 9\n0 2",
      "3 10\n0 10\n4 6\n8 2",
      "3 100\n10 1\n20 2\n30 3",
    ],
  ),
  define(
    "gas-circuit",
    "First Feasible Fuel Circuit",
    "Greedy",
    "Stations form a circle. Starting with an empty tank, collect gas[i], then spend cost[i] to reach the next station. Find the smallest feasible starting index, or -1 if no complete circuit is possible.",
    "Input: n, n gas values, then n cost values. Output: a 0-based start index or -1.",
    "1 <= n <= 100000; 0 <= gas,cost <= 10000.",
    (s) => {
      const t = numbers(s),
        n = t[0];
      let total = 0,
        cur = 0,
        start = 0;
      for (let i = 0; i < n; i++) {
        const d = t[1 + i] - t[1 + n + i];
        total += d;
        cur += d;
        if (cur < 0) {
          cur = 0;
          start = i + 1;
        }
      }
      return total < 0 ? -1 : start % n;
    },
    [
      "5\n1 2 3 4 5\n3 4 5 1 2",
      "3\n2 3 4\n3 4 3",
      "1\n0\n0",
      "3\n4 4 4\n1 1 1",
      "2\n0 3\n2 1",
    ],
  ),
  define(
    "minimum-jumps",
    "Fewest Jumps to the Last Index",
    "Greedy",
    "At index i you may jump forward by any positive length at most a[i]. Find the minimum jumps to reach index n-1, or -1 if unreachable.",
    A,
    "1 <= n <= 100000; 0 <= a[i] <= 100000.",
    (s) => {
      const a = array(s);
      let end = 0,
        far = 0,
        jumps = 0;
      for (let i = 0; i < a.length - 1; i++) {
        far = Math.max(far, i + a[i]);
        if (i === end) {
          if (far === end) return -1;
          jumps++;
          end = far;
          if (end >= a.length - 1) return jumps;
        }
      }
      return a.length === 1 ? 0 : -1;
    },
    ["5\n2 3 1 1 4", "5\n3 2 1 0 4", "1\n0", "4\n1 1 1 1", "4\n4 0 0 0"],
  ),
  define(
    "candy-allocation",
    "Minimum Candy Allocation",
    "Greedy",
    "Give each child at least one candy. A child with a higher rating than an immediate neighbor must get more candies than that neighbor. Minimize total candies.",
    A,
    "1 <= n <= 100000; 0 <= rating <= 1000000.",
    (s) => {
      const a = array(s),
        c = Array(a.length).fill(1);
      for (let i = 1; i < a.length; i++)
        if (a[i] > a[i - 1]) c[i] = c[i - 1] + 1;
      for (let i = a.length - 2; i >= 0; i--)
        if (a[i] > a[i + 1]) c[i] = Math.max(c[i], c[i + 1] + 1);
      return sum(c);
    },
    ["3\n1 0 2", "3\n1 2 2", "1\n9", "4\n4 3 2 1", "5\n1 3 4 5 2"],
  ),
  define(
    "task-cooldown",
    "CPU Tasks with Cooldown",
    "Greedy counting",
    "A CPU executes one uppercase-letter task per time slot. Equal task letters must have at least c slots between executions; idle slots are allowed. Find minimum total slots.",
    "Input: cooldown c on line 1; a nonempty uppercase task string on line 2. Output: minimum slots.",
    "0 <= c <= 100000; 1 <= task string length <= 100000; letters A-Z.",
    (s) => {
      const [cLine, t] = lines(s),
        c = Number(cLine),
        freq = Array(26).fill(0);
      for (const x of t) freq[x.charCodeAt(0) - 65]++;
      const m = Math.max(...freq),
        k = freq.filter((x) => x === m).length;
      return Math.max(t.length, (m - 1) * (c + 1) + k);
    },
    ["2\nAAABBB", "0\nAAABBB", "3\nA", "2\nAAAA", "1\nAABBCC"],
  ),
  define(
    "frequency-increments",
    "Most Frequent Value after Increments",
    "Sliding window",
    "You may increment any element by 1, using at most k total increments. Find the largest frequency of one value achievable.",
    "Input: n k followed by n positive integers. Output: largest frequency.",
    "1 <= n <= 100000; 1 <= value <= 100000; 0 <= k <= 10000000000.",
    (s) => {
      const t = numbers(s),
        k = t[1],
        a = t.slice(2).sort((x, y) => x - y);
      let l = 0,
        total = 0,
        best = 0;
      for (let r = 0; r < a.length; r++) {
        total += a[r];
        while (a[r] * (r - l + 1) - total > k) total -= a[l++];
        best = Math.max(best, r - l + 1);
      }
      return best;
    },
    [
      "3 5\n1 2 4",
      "4 5\n1 4 8 13",
      "4 0\n2 2 3 3",
      "1 10\n5",
      "5 10\n1 2 3 4 5",
    ],
  ),
  define(
    "longest-unique-substring",
    "Longest Substring without Repeats",
    "Sliding window",
    "Find the length of the longest contiguous substring containing no repeated character.",
    S,
    "1 <= string length <= 100000; lowercase letters a-z.",
    (s) => {
      const t = s.trim(),
        seen = new Map<string, number>();
      let l = 0,
        best = 0;
      for (let r = 0; r < t.length; r++) {
        l = Math.max(l, (seen.get(t[r]) ?? -1) + 1);
        seen.set(t[r], r);
        best = Math.max(best, r - l + 1);
      }
      return best;
    },
    ["abcabcbb", "bbbbb", "pwwkew", "a", "abba"],
  ),
  define(
    "minimum-cover-window",
    "Shortest Covering Window",
    "Sliding window",
    "Find the length of the shortest substring of s containing every character of t with at least its multiplicity. Print -1 if impossible.",
    TWO,
    "1 <= |s|,|t| <= 100000; lowercase letters a-z.",
    (s) => {
      const [a, b] = lines(s),
        need = new Map<string, number>();
      for (const x of b) need.set(x, (need.get(x) || 0) + 1);
      let missing = b.length,
        l = 0,
        best = Infinity;
      for (let r = 0; r < a.length; r++) {
        const x = a[r];
        if ((need.get(x) || 0) > 0) missing--;
        need.set(x, (need.get(x) || 0) - 1);
        while (!missing) {
          best = Math.min(best, r - l + 1);
          const y = a[l++];
          need.set(y, (need.get(y) || 0) + 1);
          if (need.get(y)! > 0) missing++;
        }
      }
      return best === Infinity ? -1 : best;
    },
    ["adobecodebanc\nabc", "a\naa", "aa\naa", "abc\nz", "abca\naac"],
  ),
  define(
    "anagram-locations",
    "All Anagram Start Indices",
    "Sliding window",
    "Find all start indices in s where a substring is a permutation of p. Print indices in increasing order, or -1 if none.",
    "Input: lowercase s on line 1 and nonempty p on line 2. Output: space-separated 0-based indices or -1.",
    "1 <= |s|,|p| <= 100000.",
    (s) => {
      const [a, b] = lines(s),
        need = Array(26).fill(0),
        have = Array(26).fill(0),
        ans: number[] = [];
      for (const x of b) need[x.charCodeAt(0) - 97]++;
      for (let i = 0; i < a.length; i++) {
        have[a.charCodeAt(i) - 97]++;
        if (i >= b.length) have[a.charCodeAt(i - b.length) - 97]--;
        if (i >= b.length - 1 && need.every((x, j) => x === have[j]))
          ans.push(i - b.length + 1);
      }
      return ans.length ? out(ans) : "-1";
    },
    ["cbaebabacd\nabc", "abab\nab", "a\naa", "aaaa\naa", "abc\nz"],
  ),
  define(
    "uniform-replacement",
    "Longest Uniform Substring after Replacements",
    "Sliding window",
    "Replace at most k characters to make a substring contain only one repeated letter. Find the maximum possible substring length.",
    "Input: k on line 1; uppercase string on line 2. Output: maximum length.",
    "1 <= string length <= 100000; 0 <= k <= string length.",
    (s) => {
      const [kLine, a] = lines(s),
        k = Number(kLine),
        freq = Array(26).fill(0);
      let l = 0,
        max = 0,
        best = 0;
      for (let r = 0; r < a.length; r++) {
        max = Math.max(max, ++freq[a.charCodeAt(r) - 65]);
        while (r - l + 1 - max > k) freq[a.charCodeAt(l++) - 65]--;
        best = Math.max(best, r - l + 1);
      }
      return best;
    },
    ["1\nAABABBA", "2\nABAB", "0\nAAAA", "0\nABC", "5\nABCDE"],
  ),
  define(
    "decode-bracket-string",
    "Expand Nested Repetition",
    "Stack",
    "Decode valid expressions k[content], where k repeats the decoded content; letters outside brackets are literal. Repetitions may be nested.",
    "Input: one encoded string. Output: its decoded string.",
    "Encoded length <= 1000; 1 <= k <= 100; lowercase letters; decoded output length <= 100000.",
    (s) => {
      const stack: [string, number][] = [];
      let cur = "",
        n = 0;
      for (const x of s.trim())
        if (/\d/.test(x)) n = n * 10 + Number(x);
        else if (x === "[") {
          stack.push([cur, n]);
          cur = "";
          n = 0;
        } else if (x === "]") {
          const [prev, k] = stack.pop()!;
          cur = prev + cur.repeat(k);
        } else cur += x;
      return cur;
    },
    ["3[a2[c]]", "2[ab]3[c]", "abc", "1[z]", "2[x3[y]]z"],
  ),
  define(
    "remove-k-digits",
    "Smallest Number after K Deletions",
    "Monotonic stack",
    "Delete exactly k digits from a nonnegative integer's decimal representation to minimize its value. Remove leading zeros; print 0 if no nonzero digits remain.",
    "Input: k on line 1; digit string on line 2. Output: the smallest normalized number.",
    "1 <= digit count <= 100000; 0 <= k <= digit count; no initial leading zeros except the number 0.",
    (s) => {
      const [kLine, a] = lines(s);
      let k = Number(kLine);
      const st: string[] = [];
      for (const x of a) {
        while (k && st.length && st.at(-1)! > x) {
          st.pop();
          k--;
        }
        st.push(x);
      }
      while (k-- > 0) st.pop();
      return st.join("").replace(/^0+/, "") || "0";
    },
    ["3\n1432219", "1\n10200", "2\n10", "0\n123", "3\n100200"],
  ),
  define(
    "postfix-evaluation",
    "Evaluate a Postfix Program",
    "Stack",
    "Evaluate a valid postfix expression with signed integers and +, -, *, /. Division truncates toward zero. Every division has nonzero divisor.",
    "Input: space-separated postfix tokens on one line. Output: the integer result.",
    "1 <= token count <= 10000; every intermediate result fits signed 32-bit integer.",
    (s) => {
      const st: number[] = [];
      for (const x of s.trim().split(/\s+/))
        if (["+", "-", "*", "/"].includes(x)) {
          const b = st.pop()!,
            a = st.pop()!;
          st.push(
            x === "+"
              ? a + b
              : x === "-"
                ? a - b
                : x === "*"
                  ? a * b
                  : Math.trunc(a / b),
          );
        } else st.push(Number(x));
      return st[0];
    },
    ["2 1 + 3 *", "4 13 5 / +", "-7 3 /", "42", "5 1 2 + 4 * + 3 -"],
  ),
  define(
    "arithmetic-precedence",
    "Calculate with Operator Precedence",
    "Stack",
    "Evaluate an expression containing nonnegative integers, +, -, *, / and optional spaces, without parentheses. Apply normal multiplication/division precedence and left associativity. Division truncates toward zero.",
    "Input: one valid expression, beginning with an integer and with no unary operators. Output: integer result.",
    "Expression length <= 100000; all intermediate results fit signed 32-bit integers; divisors nonzero.",
    (s) => {
      const a = s.replace(/\s/g, "") + "+",
        st: number[] = [];
      let n = 0,
        op = "+";
      for (const x of a)
        if (/\d/.test(x)) n = n * 10 + Number(x);
        else {
          if (op === "+") st.push(n);
          if (op === "-") st.push(-n);
          if (op === "*") st.push(st.pop()! * n);
          if (op === "/") st.push(Math.trunc(st.pop()! / n));
          op = x;
          n = 0;
        }
      return sum(st);
    },
    ["3+2*2", " 3/2 ", "14-3/2", "42", "8/3*3+1"],
  ),
  define(
    "brace-reversals",
    "Balance Braces by Reversing",
    "Stack",
    "Reverse individual braces '{' to '}' or vice versa to produce a balanced brace sequence. Find the minimum reversals, or -1 for an odd-length string.",
    S,
    "1 <= length <= 100000; characters are only { and }.",
    (s) => {
      const a = s.trim();
      if (a.length % 2) return -1;
      let opens = 0,
        close = 0;
      for (const x of a)
        if (x === "{") opens++;
        else if (opens) opens--;
        else close++;
      return Math.ceil(opens / 2) + Math.ceil(close / 2);
    },
    ["}}{{", "{{{{", "{}{}", "{", "}{{}}{{{"],
  ),
  define(
    "longest-valid-parentheses",
    "Longest Balanced Parenthesis Substring",
    "Stack",
    "Find the length of the longest contiguous substring that is a valid balanced parenthesis sequence.",
    S,
    "1 <= length <= 100000; characters are ( and ).",
    (s) => {
      const a = s.trim(),
        st = [-1];
      let ans = 0;
      for (let i = 0; i < a.length; i++)
        if (a[i] === "(") st.push(i);
        else {
          st.pop();
          if (!st.length) st.push(i);
          else ans = Math.max(ans, i - st.at(-1)!);
        }
      return ans;
    },
    ["(()", ")()())", "((((", "()()", "()(())"],
  ),
  define(
    "palindrome-substrings",
    "Count Palindromic Substrings",
    "Strings",
    "Count nonempty palindromic substrings by their positions; equal text at different positions counts separately.",
    S,
    "1 <= length <= 3000; lowercase letters.",
    (s) => {
      const a = s.trim();
      let ans = 0;
      for (let c = 0; c < 2 * a.length - 1; c++) {
        let l = c >> 1,
          r = l + (c % 2);
        while (l >= 0 && r < a.length && a[l--] === a[r++]) ans++;
      }
      return ans;
    },
    ["aaa", "abc", "a", "abba", "ababa"],
  ),
  define(
    "palindrome-subsequence",
    "Longest Palindromic Subsequence",
    "Dynamic programming",
    "Find the length of a longest subsequence that reads the same forward and backward. A subsequence may skip characters.",
    S,
    "1 <= length <= 1000; lowercase letters.",
    (s) => {
      const a = s.trim(),
        n = a.length,
        dp = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = n - 1; i >= 0; i--) {
        dp[i][i] = 1;
        for (let j = i + 1; j < n; j++)
          dp[i][j] =
            a[i] === a[j]
              ? 2 + (dp[i + 1]?.[j - 1] || 0)
              : Math.max(dp[i + 1][j], dp[i][j - 1]);
      }
      return dp[0][n - 1];
    },
    ["bbbab", "cbbd", "a", "abcdef", "racecar"],
  ),
  define(
    "edit-distance",
    "Minimum String Edit Distance",
    "Dynamic programming",
    "Transform a into b using insertions, deletions and substitutions, each costing one. Find the minimum cost.",
    TWO,
    "1 <= |a|,|b| <= 1000; lowercase letters.",
    (s) => {
      const [a, b] = lines(s);
      let dp = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        const next = [i];
        for (let j = 1; j <= b.length; j++)
          next[j] =
            a[i - 1] === b[j - 1]
              ? dp[j - 1]
              : 1 + Math.min(dp[j], next[j - 1], dp[j - 1]);
        dp = next;
      }
      return dp[b.length];
    },
    ["horse\nros", "intention\nexecution", "a\na", "abc\ndef", "abc\nabcd"],
  ),
  define(
    "interleaving-strings",
    "Can Two Strings Interleave?",
    "Dynamic programming",
    "Determine whether c can be formed by interleaving all characters of a and b while preserving each one's order. Print YES or NO.",
    "Input: a, b and c on three separate nonempty lines. Output: YES or NO.",
    "1 <= |a|,|b| <= 300; 1 <= |c| <= 600; lowercase letters.",
    (s) => {
      const [a, b, c] = lines(s);
      if (a.length + b.length !== c.length) return "NO";
      const dp = Array.from({ length: a.length + 1 }, () =>
        Array(b.length + 1).fill(false),
      );
      dp[0][0] = true;
      for (let i = 0; i <= a.length; i++)
        for (let j = 0; j <= b.length; j++) {
          if (i) dp[i][j] ||= dp[i - 1][j] && a[i - 1] === c[i + j - 1];
          if (j) dp[i][j] ||= dp[i][j - 1] && b[j - 1] === c[i + j - 1];
        }
      return dp[a.length][b.length] ? "YES" : "NO";
    },
    [
      "aabcc\ndbbca\naadbbcbcac",
      "aabcc\ndbbca\naadbbbaccc",
      "a\nb\nba",
      "a\na\naa",
      "ab\ncd\nadbc",
    ],
  ),
  define(
    "wildcard-match",
    "Wildcard Pattern Matching",
    "Dynamic programming",
    "Match the entire text against a pattern: '?' matches exactly one character; '*' matches any sequence, including empty. Print YES or NO.",
    "Input: nonempty lowercase text on line 1; nonempty pattern on line 2. Output: YES or NO.",
    "Text and pattern lengths <= 2000; pattern uses lowercase letters, ? and *.",
    (s) => {
      const [a, p] = lines(s);
      let dp = Array(p.length + 1).fill(false);
      dp[0] = true;
      for (let j = 1; j <= p.length; j++) dp[j] = dp[j - 1] && p[j - 1] === "*";
      for (const x of a) {
        const next = Array(p.length + 1).fill(false);
        for (let j = 1; j <= p.length; j++)
          next[j] =
            p[j - 1] === "*"
              ? next[j - 1] || dp[j]
              : dp[j - 1] && (p[j - 1] === "?" || p[j - 1] === x);
        dp = next;
      }
      return dp[p.length] ? "YES" : "NO";
    },
    ["adceb\n*a*b", "acdcb\na*c?b", "a\n*", "abc\na??", "abc\n????"],
  ),
  define(
    "subsequence-count",
    "Count Ways to Form a Target Subsequence",
    "Dynamic programming",
    "Count subsequences of source s equal to target t. Different index choices count separately. Print the count modulo 1000000007.",
    TWO,
    "1 <= |s| <= 2000; 1 <= |t| <= 500; lowercase letters.",
    (s) => {
      const [a, b] = lines(s),
        dp = Array(b.length + 1).fill(0);
      dp[0] = 1;
      for (const x of a)
        for (let j = b.length; j > 0; j--)
          if (x === b[j - 1]) dp[j] = (dp[j] + dp[j - 1]) % MOD;
      return dp[b.length];
    },
    ["rabbbit\nrabbit", "babgbag\nbag", "a\na", "abc\nd", "aaaa\naa"],
  ),
  define(
    "word-segmentation",
    "Dictionary Word Segmentation",
    "Dynamic programming",
    "Determine if the entire string can be split into one or more words from a dictionary; a word may be reused. Print YES or NO.",
    "Input: string s on line 1; dictionary size d on line 2; then d words, one per line. Output: YES or NO.",
    "1 <= |s| <= 1000; 1 <= d <= 100; lowercase words with length 1..30.",
    (s) => {
      const t = lines(s),
        a = t[0],
        set = new Set(t.slice(2)),
        dp = Array(a.length + 1).fill(false);
      dp[0] = true;
      for (let i = 1; i <= a.length; i++)
        for (let j = Math.max(0, i - 30); j < i; j++)
          if (dp[j] && set.has(a.slice(j, i))) {
            dp[i] = true;
            break;
          }
      return dp[a.length] ? "YES" : "NO";
    },
    [
      "leetcode\n2\nleet\ncode",
      "catsandog\n5\ncats\ndog\nsand\nand\ncat",
      "aaaa\n1\na",
      "applepenapple\n2\napple\npen",
      "abc\n2\na\nbc",
    ],
  ),
  define(
    "shortest-common-supersequence",
    "Shortest Common Supersequence Length",
    "Dynamic programming",
    "Find the length of the shortest string containing both input strings as subsequences.",
    TWO,
    "1 <= |a|,|b| <= 1500; lowercase letters.",
    (s) => {
      const [a, b] = lines(s);
      let dp = Array(b.length + 1).fill(0);
      for (const x of a) {
        const next = [0];
        for (let j = 1; j <= b.length; j++)
          next[j] =
            x === b[j - 1] ? dp[j - 1] + 1 : Math.max(dp[j], next[j - 1]);
        dp = next;
      }
      return a.length + b.length - dp[b.length];
    },
    ["abac\ncab", "abc\nabc", "a\nb", "abc\ndef", "aaaa\naa"],
  ),
  define(
    "permutation-rank",
    "Lexicographic Rank of a Unique-Letter Word",
    "Combinatorics",
    "All letters in the word are distinct. Sort all permutations of these letters lexicographically and find this word's 1-based rank. Print the exact integer, using a sufficiently wide integer type.",
    "Input: one lowercase word with distinct characters. Output: its exact 1-based permutation rank.",
    "1 <= word length <= 20; lowercase letters a-z; all characters distinct; maximum answer is 20!.",
    (s) => {
      const a = s.trim(),
        f = [1n];
      for (let i = 1; i <= a.length; i++) f[i] = f[i - 1] * BigInt(i);
      let rank = 1n;
      for (let i = 0; i < a.length; i++) {
        let smaller = 0;
        for (let j = i + 1; j < a.length; j++) if (a[j] < a[i]) smaller++;
        rank += BigInt(smaller) * f[a.length - i - 1];
      }
      return rank.toString();
    },
    ["cab", "abc", "a", "dcba", "bca"],
  ),
  define(
    "repeated-dna",
    "Repeated DNA Windows",
    "Hashing",
    "Find all length-10 substrings occurring at least twice in a DNA string. Print each distinct repeated window in lexicographic order, one per line; print NONE when there are none.",
    "Input: a nonempty string over A,C,G,T. Output: sorted repeated windows, or NONE.",
    "1 <= length <= 100000.",
    (s) => {
      const a = s.trim(),
        seen = new Set<string>(),
        repeat = new Set<string>();
      for (let i = 0; i + 10 <= a.length; i++) {
        const x = a.slice(i, i + 10);
        if (seen.has(x)) repeat.add(x);
        seen.add(x);
      }
      return repeat.size ? [...repeat].sort().join("\n") : "NONE";
    },
    [
      "AAAAACCCCCAAAAACCCCCCAAAAAGGGTTT",
      "AAAAAAAAAAAAA",
      "ACGT",
      "ACGTACGTAC",
      "ACGTACGTACGTACGTACGT",
    ],
  ),
  define(
    "minimum-coins",
    "Fewest Coins for an Amount",
    "Dynamic programming",
    "Find the minimum coins needed to make amount using unlimited copies of the given distinct positive denominations. Print -1 if impossible.",
    "Input: n amount followed by n denominations. Output: minimum coins or -1.",
    "1 <= n <= 100; 0 <= amount <= 10000; 1 <= denomination <= 10000.",
    (s) => {
      const t = numbers(s),
        target = t[1],
        dp = Array(target + 1).fill(Infinity);
      dp[0] = 0;
      for (let x = 1; x <= target; x++)
        for (const c of t.slice(2))
          if (c <= x) dp[x] = Math.min(dp[x], dp[x - c] + 1);
      return dp[target] === Infinity ? -1 : dp[target];
    },
    ["3 11\n1 2 5", "1 3\n2", "1 0\n1", "2 6\n3 4", "3 7\n2 3 6"],
  ),
  define(
    "coin-combinations",
    "Unordered Coin Combinations",
    "Dynamic programming",
    "Count unordered combinations of unlimited coins summing to amount. Coin order does not distinguish combinations. Print modulo 1000000007.",
    "Input: n amount, followed by n distinct positive denominations. Output: number of combinations.",
    "1 <= n <= 100; 0 <= amount <= 10000; 1 <= denomination <= 10000.",
    (s) => {
      const t = numbers(s),
        v = t[1],
        dp = Array(v + 1).fill(0);
      dp[0] = 1;
      for (const c of t.slice(2))
        for (let j = c; j <= v; j++) dp[j] = (dp[j] + dp[j - c]) % MOD;
      return dp[v];
    },
    ["3 5\n1 2 5", "1 3\n2", "1 0\n5", "2 10\n2 5", "2 4\n1 3"],
  ),
  define(
    "unbounded-knapsack",
    "Reusable Items in a Knapsack",
    "Dynamic programming",
    "Each item type has a positive weight and value and may be selected any number of times. Maximize value with total weight at most capacity.",
    "Input: n capacity, then n lines weight value. Output: maximum value.",
    "1 <= n <= 100; 0 <= capacity <= 10000; 1 <= weight,value <= 1000.",
    (s) => {
      const t = numbers(s),
        cap = t[1],
        items = pairs(t, 2, t[0]),
        dp = Array(cap + 1).fill(0);
      for (let w = 1; w <= cap; w++)
        for (const [a, v] of items)
          if (a <= w) dp[w] = Math.max(dp[w], dp[w - a] + v);
      return dp[cap];
    },
    [
      "2 7\n2 3\n3 5",
      "1 5\n3 4",
      "1 0\n1 10",
      "3 8\n2 3\n3 4\n4 7",
      "2 3\n4 20\n5 30",
    ],
  ),
  define(
    "zero-one-knapsack",
    "Choose Each Item at Most Once",
    "Dynamic programming",
    "Each listed item can be selected at most once. Maximize total value without exceeding capacity.",
    "Input: n capacity, then n lines weight value. Output: maximum value.",
    "1 <= n <= 200; 0 <= capacity <= 10000; 1 <= weight,value <= 1000.",
    (s) => {
      const t = numbers(s),
        cap = t[1],
        dp = Array(cap + 1).fill(0);
      for (const [w, v] of pairs(t, 2, t[0]))
        for (let j = cap; j >= w; j--) dp[j] = Math.max(dp[j], dp[j - w] + v);
      return dp[cap];
    },
    [
      "3 5\n1 6\n2 10\n3 12",
      "1 5\n3 4",
      "2 0\n1 10\n2 20",
      "3 3\n2 5\n2 5\n2 5",
      "2 10\n3 4\n4 5",
    ],
  ),
  define(
    "subset-target-count",
    "Count Subsets with Target Sum",
    "Dynamic programming",
    "Count index subsets whose values sum to target. Include the empty subset when target is zero. Zeros and repeated values are distinct index choices. Print modulo 1000000007.",
    "Input: n target, followed by n nonnegative integers. Output: subset count.",
    "1 <= n <= 200; 0 <= target <= 10000; 0 <= value <= 1000.",
    (s) => {
      const t = numbers(s),
        target = t[1],
        dp = Array(target + 1).fill(0);
      dp[0] = 1;
      for (const x of t.slice(2))
        for (let j = target; j >= x; j--) dp[j] = (dp[j] + dp[j - x]) % MOD;
      return dp[target];
    },
    ["4 3\n1 2 2 3", "3 0\n0 0 0", "1 5\n4", "4 4\n1 1 1 1", "3 2\n0 1 2"],
  ),
  define(
    "signed-target",
    "Plus and Minus Target Expressions",
    "Dynamic programming",
    "Assign either + or - to every nonnegative value, keeping all values, to obtain target. Count sign assignments modulo 1000000007.",
    "Input: n target, followed by n values. Output: number of sign assignments.",
    "1 <= n <= 100; 0 <= value <= 100; |target| <= 10000; total sum <= 10000.",
    (s) => {
      const t = numbers(s),
        target = t[1];
      let dp = new Map([[0, 1]]);
      for (const x of t.slice(2)) {
        const next = new Map<number, number>();
        for (const [a, c] of dp)
          for (const v of [a + x, a - x])
            next.set(v, ((next.get(v) || 0) + c) % MOD);
        dp = next;
      }
      return dp.get(target) || 0;
    },
    ["5 3\n1 1 1 1 1", "1 2\n1", "2 0\n0 0", "3 -2\n1 1 2", "2 0\n2 2"],
  ),
  define(
    "increasing-subsequence",
    "Longest Strictly Increasing Subsequence",
    "Binary search",
    "Find the longest strictly increasing subsequence length. Equal consecutive chosen values are not allowed. Aim for O(n log n) time.",
    A,
    NC,
    (s) => {
      const tails: number[] = [];
      for (const x of array(s)) {
        const i = lower(tails, x);
        tails[i] = x;
      }
      return tails.length;
    },
    [
      "8\n10 9 2 5 3 7 101 18",
      "6\n0 1 0 3 2 3",
      "4\n7 7 7 7",
      "1\n-4",
      "5\n5 4 3 2 1",
    ],
  ),
  define(
    "number-of-lis",
    "Count Longest Increasing Subsequences",
    "Dynamic programming",
    "Count index-distinct strictly increasing subsequences having the maximum possible length. Print the count modulo 1000000007.",
    A,
    "1 <= n <= 2000; -1000000 <= value <= 1000000.",
    (s) => {
      const a = array(s),
        n = a.length,
        len = Array(n).fill(1),
        cnt = Array(n).fill(1);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < i; j++)
          if (a[j] < a[i]) {
            if (len[j] + 1 > len[i]) {
              len[i] = len[j] + 1;
              cnt[i] = cnt[j];
            } else if (len[j] + 1 === len[i]) cnt[i] = (cnt[i] + cnt[j]) % MOD;
          }
      const best = Math.max(...len);
      return cnt.reduce((v, c, i) => (len[i] === best ? (v + c) % MOD : v), 0);
    },
    ["5\n1 3 5 4 7", "5\n2 2 2 2 2", "1\n1", "4\n1 2 3 4", "6\n1 2 1 2 3 3"],
  ),
  define(
    "rod-revenue",
    "Maximum Rod-Cutting Revenue",
    "Dynamic programming",
    "A rod has length n, and price[i] is the sale price for a piece of length i+1. Cut it into positive integer lengths to maximize total revenue; sell the entire rod.",
    A,
    "1 <= n <= 2000; 0 <= price <= 1000000.",
    (s) => {
      const a = array(s),
        n = a.length,
        dp = Array(n + 1).fill(0);
      for (let x = 1; x <= n; x++)
        for (let cut = 1; cut <= x; cut++)
          dp[x] = Math.max(dp[x], a[cut - 1] + dp[x - cut]);
      return dp[n];
    },
    ["8\n1 5 8 9 10 17 17 20", "4\n2 5 7 8", "1\n9", "3\n0 0 0", "4\n1 1 1 10"],
  ),
  define(
    "permutation-minimum-swaps",
    "Fewest Arbitrary Swaps to Sort a Permutation",
    "Permutation cycles",
    "A permutation contains every integer from 1 to n exactly once. A move swaps values at any two positions. Find the minimum moves required to put the permutation in increasing order.",
    "Input: n followed by n permutation values. Output: minimum swaps.",
    "1 <= n <= 100000; values are a permutation of 1..n.",
    (s) => {
      const a = array(s),
        seen = Array(a.length).fill(false);
      let ans = 0;
      for (let i = 0; i < a.length; i++)
        if (!seen[i]) {
          let u = i,
            length = 0;
          while (!seen[u]) {
            seen[u] = true;
            length++;
            u = a[u] - 1;
          }
          ans += length - 1;
        }
      return ans;
    },
    ["4\n4 3 2 1", "5\n2 3 4 5 1", "1\n1", "4\n1 2 3 4", "5\n2 1 3 5 4"],
  ),
  define(
    "largest-one-square",
    "Largest All-One Square Area",
    "Grid dynamic programming",
    "Find the area of the largest square submatrix consisting entirely of ones.",
    "Input: rows columns followed by rows*columns binary values in row-major order. Output: maximum area.",
    "1 <= rows,columns <= 500; entries are 0 or 1.",
    (s) => {
      const { r, c, g } = matrix(s),
        dp = Array.from({ length: r + 1 }, () => Array(c + 1).fill(0));
      let b = 0;
      for (let i = 1; i <= r; i++)
        for (let j = 1; j <= c; j++)
          if (g[i - 1][j - 1]) {
            dp[i][j] =
              1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            b = Math.max(b, dp[i][j]);
          }
      return b * b;
    },
    [
      "3 4\n1 0 1 0\n1 1 1 1\n1 1 1 1",
      "2 2\n0 0\n0 0",
      "1 1\n1",
      "2 3\n1 1 1\n1 1 1",
      "1 4\n1 1 1 1",
    ],
  ),
  define(
    "minimum-grid-path",
    "Cheapest Right-and-Down Path",
    "Grid dynamic programming",
    "Move from the top-left to bottom-right cell using only right or down moves. Minimize the sum of visited values, including both endpoints.",
    "Input: rows columns followed by nonnegative cell values in row-major order. Output: minimum sum.",
    "1 <= rows,columns <= 500; 0 <= cell value <= 10000.",
    (s) => {
      const { r, c, g } = matrix(s),
        dp = Array(c).fill(Infinity);
      dp[0] = 0;
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          dp[j] = g[i][j] + Math.min(dp[j], j ? dp[j - 1] : Infinity);
      return dp[c - 1];
    },
    [
      "3 3\n1 3 1\n1 5 1\n4 2 1",
      "2 3\n1 2 3\n4 5 6",
      "1 1\n8",
      "1 3\n0 0 0",
      "3 1\n1\n2\n3",
    ],
  ),
  define(
    "obstacle-paths",
    "Count Paths around Obstacles",
    "Grid dynamic programming",
    "Count paths from top-left to bottom-right using only right and down. A 1 blocks a cell and a 0 is open. Print modulo 1000000007.",
    "Input: rows columns followed by binary cell values in row-major order. Output: number of paths.",
    "1 <= rows,columns <= 500; entries 0 or 1.",
    (s) => {
      const { r, c, g } = matrix(s),
        dp = Array(c).fill(0);
      dp[0] = 1;
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          dp[j] = g[i][j] ? 0 : (dp[j] + (j ? dp[j - 1] : 0)) % MOD;
      return dp[c - 1];
    },
    [
      "3 3\n0 0 0\n0 1 0\n0 0 0",
      "2 2\n0 1\n0 0",
      "1 1\n1",
      "1 1\n0",
      "2 3\n0 0 0\n1 1 0",
    ],
  ),
  define(
    "falling-path",
    "Minimum Falling Path Sum",
    "Grid dynamic programming",
    "Start in any top-row cell. Each step goes to the next row in the same column or an adjacent column. Find the minimum sum reaching the last row.",
    "Input: rows columns followed by signed cell values in row-major order. Output: minimum path sum.",
    "1 <= rows,columns <= 500; -10000 <= cell <= 10000.",
    (s) => {
      const { r, c, g } = matrix(s);
      let dp = [...g[0]];
      for (let i = 1; i < r; i++)
        dp = g[i].map(
          (x, j) =>
            x +
            Math.min(
              dp[j],
              j ? dp[j - 1] : Infinity,
              j + 1 < c ? dp[j + 1] : Infinity,
            ),
        );
      return Math.min(...dp);
    },
    [
      "3 3\n2 1 3\n6 5 4\n7 8 9",
      "2 2\n-19 57\n-40 -5",
      "1 1\n-7",
      "3 1\n1\n2\n3",
      "1 4\n4 3 2 1",
    ],
  ),
  define(
    "circular-house-robber",
    "Nonadjacent Houses on a Circle",
    "Dynamic programming",
    "Choose houses maximizing stolen value, with no two adjacent houses chosen. The first and last houses are adjacent; selecting none is allowed. With one house, it can be chosen.",
    A,
    "1 <= n <= 100000; 0 <= value <= 1000000.",
    (s) => {
      const a = array(s);
      if (a.length === 1) return a[0];
      const run = (b: number[]) => {
        let p = 0,
          q = 0;
        for (const x of b) [p, q] = [q, Math.max(q, p + x)];
        return q;
      };
      return Math.max(run(a.slice(1)), run(a.slice(0, -1)));
    },
    ["3\n2 3 2", "4\n1 2 3 1", "1\n9", "4\n0 0 0 0", "5\n10 1 1 10 1"],
  ),
  define(
    "stock-cooldown",
    "Stock Trading with a Rest Day",
    "Dynamic programming",
    "Make any number of buy/sell transactions, holding at most one share. After selling, the following day is a cooldown on which buying is forbidden. Maximize profit.",
    A,
    "1 <= n <= 100000; 0 <= price <= 1000000.",
    (s) => {
      const a = array(s);
      let hold = -Infinity,
        sold = -Infinity,
        rest = 0;
      for (const p of a)
        [hold, sold, rest] = [
          Math.max(hold, rest - p),
          hold + p,
          Math.max(rest, sold),
        ];
      return Math.max(sold, rest);
    },
    ["5\n1 2 3 0 2", "1\n5", "4\n5 4 3 2", "4\n1 2 1 3", "6\n1 4 2 7 1 5"],
  ),
  define(
    "stock-transaction-fee",
    "Stock Trading with a Selling Fee",
    "Dynamic programming",
    "Trade any number of times, holding at most one share. Pay fee whenever you sell. Find maximum profit; do not buy and sell multiple shares at once.",
    "Input: n fee followed by n prices. Output: maximum profit.",
    "1 <= n <= 100000; 0 <= price,fee <= 1000000.",
    (s) => {
      const t = numbers(s),
        fee = t[1];
      let cash = 0,
        hold = -Infinity;
      for (const p of t.slice(2))
        [cash, hold] = [
          Math.max(cash, hold + p - fee),
          Math.max(hold, cash - p),
        ];
      return cash;
    },
    [
      "6 2\n1 3 2 8 4 9",
      "1 0\n5",
      "4 10\n1 2 3 4",
      "4 0\n1 3 2 5",
      "5 1\n5 4 3 2 1",
    ],
  ),
  define(
    "decode-ways",
    "Count Alphabet Decodings",
    "Dynamic programming",
    "Map 1 to A through 26 to Z. Count ways to decode a digit string; a code cannot start with zero. Print modulo 1000000007.",
    "Input: one nonempty digit string. Output: number of valid decodings.",
    "1 <= length <= 100000.",
    (s) => {
      const a = s.trim();
      let p = 1,
        q = a[0] === "0" ? 0 : 1;
      for (let i = 1; i < a.length; i++) {
        const pair = Number(a.slice(i - 1, i + 1));
        [p, q] = [
          q,
          ((a[i] !== "0" ? q : 0) + (pair >= 10 && pair <= 26 ? p : 0)) % MOD,
        ];
      }
      return q;
    },
    ["226", "12", "06", "10", "11106"],
  ),
  define(
    "dice-total",
    "Ways to Roll an Exact Total",
    "Dynamic programming",
    "Roll n distinguishable dice with faces 1 through f. Count ordered outcomes summing to target, modulo 1000000007.",
    "Input: n f target. Output: number of outcomes.",
    "1 <= n <= 30; 1 <= f <= 30; 0 <= target <= 1000.",
    (s) => {
      const [n, f, target] = numbers(s);
      let dp = Array(target + 1).fill(0);
      dp[0] = 1;
      for (let i = 0; i < n; i++) {
        const next = Array(target + 1).fill(0);
        for (let x = 1; x <= target; x++)
          for (let v = 1; v <= f && v <= x; v++)
            next[x] = (next[x] + dp[x - v]) % MOD;
        dp = next;
      }
      return dp[target];
    },
    ["2 6 7", "1 6 3", "2 2 1", "3 2 4", "2 6 0"],
  ),
  define(
    "island-count",
    "Count Four-Connected Islands",
    "Grid traversal",
    "An island is a maximal four-directionally connected group of 1 cells. Count islands; diagonal contact does not connect them.",
    "Input: rows columns followed by binary cells in row-major order. Output: island count.",
    "1 <= rows,columns <= 500; entries 0 or 1.",
    (s) => {
      const { r, c, g } = matrix(s);
      let ans = 0;
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          if (g[i][j]) {
            ans++;
            const q = [[i, j]];
            g[i][j] = 0;
            for (let k = 0; k < q.length; k++)
              for (const [di, dj] of four) {
                const x = q[k][0] + di,
                  y = q[k][1] + dj;
                if (x >= 0 && x < r && y >= 0 && y < c && g[x][y]) {
                  g[x][y] = 0;
                  q.push([x, y]);
                }
              }
          }
      return ans;
    },
    gridCases,
  ),
  define(
    "largest-island",
    "Largest Island Area",
    "Grid traversal",
    "Find the number of cells in the largest four-connected component of 1 cells. Return 0 when there is no land.",
    "Input: rows columns followed by binary cells. Output: largest area.",
    "1 <= rows,columns <= 500; entries 0 or 1.",
    (s) => {
      const { r, c, g } = matrix(s);
      let best = 0;
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          if (g[i][j]) {
            const q = [[i, j]];
            g[i][j] = 0;
            for (let k = 0; k < q.length; k++)
              for (const [di, dj] of four) {
                const x = q[k][0] + di,
                  y = q[k][1] + dj;
                if (x >= 0 && x < r && y >= 0 && y < c && g[x][y]) {
                  g[x][y] = 0;
                  q.push([x, y]);
                }
              }
            best = Math.max(best, q.length);
          }
      return best;
    },
    gridCases,
  ),
  define(
    "rotting-oranges",
    "Time for Oranges to Rot",
    "Multi-source BFS",
    "A cell is empty (0), fresh (1) or rotten (2). Every minute, rotten oranges rot adjacent fresh oranges in four directions. Find the time until all fresh oranges rot, or -1 if impossible.",
    "Input: rows columns followed by cells. Output: minimum minutes, 0 if initially no fresh oranges, or -1.",
    "1 <= rows,columns <= 500; cell values 0,1,2.",
    (s) => {
      const { r, c, g } = matrix(s),
        q: number[][] = [];
      let fresh = 0,
        time = 0;
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          if (g[i][j] === 2) q.push([i, j, 0]);
          else if (g[i][j] === 1) fresh++;
      for (let k = 0; k < q.length; k++) {
        const [i, j, t] = q[k];
        time = t;
        for (const [di, dj] of four) {
          const x = i + di,
            y = j + dj;
          if (x >= 0 && x < r && y >= 0 && y < c && g[x][y] === 1) {
            fresh--;
            g[x][y] = 2;
            q.push([x, y, t + 1]);
          }
        }
      }
      return fresh ? -1 : time;
    },
    [
      "3 3\n2 1 1\n1 1 0\n0 1 1",
      "3 3\n2 1 1\n0 1 1\n1 0 1",
      "1 1\n0",
      "1 1\n1",
      "1 3\n2 1 1",
    ],
  ),
  define(
    "binary-grid-shortest-path",
    "Shortest Open Grid Route",
    "BFS",
    "Move from top-left to bottom-right through 0 cells using four directions. A 1 is blocked. Return the minimum number of moves (not cells), or -1 if impossible.",
    "Input: rows columns followed by binary cells. Output: moves or -1.",
    "1 <= rows,columns <= 500; entries 0 or 1.",
    (s) => {
      const { r, c, g } = matrix(s);
      if (g[0][0] || g[r - 1][c - 1]) return -1;
      const q = [[0, 0, 0]];
      g[0][0] = 1;
      for (let k = 0; k < q.length; k++) {
        const [i, j, d] = q[k];
        if (i === r - 1 && j === c - 1) return d;
        for (const [di, dj] of four) {
          const x = i + di,
            y = j + dj;
          if (x >= 0 && x < r && y >= 0 && y < c && !g[x][y]) {
            g[x][y] = 1;
            q.push([x, y, d + 1]);
          }
        }
      }
      return -1;
    },
    [
      "3 3\n0 0 0\n1 1 0\n0 0 0",
      "2 2\n0 1\n1 0",
      "1 1\n0",
      "1 1\n1",
      "2 3\n0 0 0\n0 0 0",
    ],
  ),
  define(
    "enclosed-regions",
    "Capture Enclosed Open Cells",
    "Grid traversal",
    "An open cell is 0 and a wall is 1. Count open cells not connected by four-directional moves to any border open cell. These cells would be captured if enclosed regions were filled.",
    "Input: rows columns followed by binary cells. Output: enclosed open-cell count.",
    "1 <= rows,columns <= 500.",
    (s) => {
      const { r, c, g } = matrix(s),
        q: number[][] = [];
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          if (
            (i === 0 || j === 0 || i === r - 1 || j === c - 1) &&
            g[i][j] === 0
          ) {
            g[i][j] = 2;
            q.push([i, j]);
          }
      for (let k = 0; k < q.length; k++)
        for (const [di, dj] of four) {
          const x = q[k][0] + di,
            y = q[k][1] + dj;
          if (x >= 0 && x < r && y >= 0 && y < c && g[x][y] === 0) {
            g[x][y] = 2;
            q.push([x, y]);
          }
        }
      return g.flat().filter((x) => x === 0).length;
    },
    [
      "3 3\n1 1 1\n1 0 1\n1 1 1",
      "3 3\n1 1 1\n1 0 1\n1 0 1",
      "1 1\n0",
      "4 4\n1 1 1 1\n1 0 0 1\n1 0 0 1\n1 1 1 1",
      "2 2\n0 0\n0 0",
    ],
  ),
  define(
    "undirected-cycle",
    "Cycle in an Undirected Graph",
    "Disjoint set",
    "Determine whether an undirected simple graph contains a cycle. The graph may be disconnected. Print YES or NO.",
    "Input: n m followed by m edges u v. Vertices are 0..n-1. Output: YES or NO.",
    "1 <= n <= 100000; 0 <= m <= 200000; no self-loops or duplicate edges.",
    (s) => {
      const { n, edges } = graphInput(s),
        d = dsu(n);
      for (const [u, v] of edges) if (!d.join(u, v)) return "YES";
      return "NO";
    },
    [
      "3 3\n0 1\n1 2\n2 0",
      "4 2\n0 1\n2 3",
      "1 0",
      "4 3\n0 1\n1 2\n2 3",
      "5 4\n0 1\n2 3\n3 4\n4 2",
    ],
  ),
  define(
    "bipartite-graph",
    "Two-Color Every Component",
    "Graph traversal",
    "Determine whether every vertex can receive one of two colors so that each edge joins different colors. The graph may be disconnected.",
    "Input: n m followed by m undirected edges u v. Vertices 0..n-1. Output: YES or NO.",
    "1 <= n <= 100000; 0 <= m <= 200000; simple graph.",
    (s) => {
      const { n, adj } = graphInput(s),
        color = Array(n).fill(-1);
      for (let i = 0; i < n; i++)
        if (color[i] === -1) {
          color[i] = 0;
          const q = [i];
          for (let k = 0; k < q.length; k++)
            for (const [v] of adj[q[k]])
              if (color[v] === -1) {
                color[v] = color[q[k]] ^ 1;
                q.push(v);
              } else if (color[v] === color[q[k]]) return "NO";
        }
      return "YES";
    },
    [
      "4 4\n0 1\n1 2\n2 3\n3 0",
      "3 3\n0 1\n1 2\n2 0",
      "1 0",
      "5 3\n0 1\n2 3\n3 4",
      "2 1\n0 1",
    ],
  ),
  define(
    "lexicographic-topological-order",
    "Smallest Valid Dependency Order",
    "Topological sorting",
    "Return the lexicographically smallest topological ordering of a directed graph. If it has a cycle, print IMPOSSIBLE.",
    "Input: n m followed by m directed edges u v meaning u must precede v. Vertices 0..n-1. Output: n ordered vertices, or IMPOSSIBLE.",
    "1 <= n <= 3000; 0 <= m <= 20000; no duplicate edges.",
    (s) => {
      const { n, adj, edges } = graphInput(s, true),
        deg = Array(n).fill(0),
        used = Array(n).fill(false),
        ans: number[] = [];
      for (const [, v] of edges) deg[v]++;
      for (let k = 0; k < n; k++) {
        const u = deg.findIndex((d, i) => !used[i] && d === 0);
        if (u < 0) return "IMPOSSIBLE";
        ans.push(u);
        used[u] = true;
        for (const [v] of adj[u]) deg[v]--;
      }
      return out(ans);
    },
    [
      "4 4\n0 2\n1 2\n1 3\n2 3",
      "3 3\n0 1\n1 2\n2 0",
      "1 0",
      "4 0",
      "4 2\n3 1\n2 0",
    ],
  ),
  define(
    "course-semesters",
    "Minimum Semesters for Prerequisites",
    "Topological sorting",
    "Each course takes one semester. Any number of courses can be taken together if all prerequisites were completed earlier. Find the minimum semesters to finish all courses, or -1 for a dependency cycle.",
    "Input: n m followed by m directed prerequisite edges u v. Vertices 0..n-1. Output: semesters or -1.",
    "1 <= n <= 100000; 0 <= m <= 200000; no duplicate edges.",
    (s) => {
      const { n, adj, edges } = graphInput(s, true),
        deg = Array(n).fill(0),
        depth = Array(n).fill(1),
        q: number[] = [];
      for (const [, v] of edges) deg[v]++;
      for (let i = 0; i < n; i++) if (!deg[i]) q.push(i);
      for (let k = 0; k < q.length; k++)
        for (const [v] of adj[q[k]]) {
          depth[v] = Math.max(depth[v], depth[q[k]] + 1);
          if (!--deg[v]) q.push(v);
        }
      return q.length === n ? Math.max(...depth) : -1;
    },
    [
      "4 3\n0 2\n1 2\n2 3",
      "2 2\n0 1\n1 0",
      "1 0",
      "4 0",
      "5 4\n0 1\n1 2\n2 3\n3 4",
    ],
  ),
  define(
    "weighted-shortest-route",
    "Shortest Route with Nonnegative Weights",
    "Shortest paths",
    "Find the minimum total edge weight from source to target in an undirected graph, or -1 if unreachable.",
    "Input: n m, m lines u v weight, then source target. Vertices 0..n-1. Output: distance or -1.",
    "1 <= n <= 2000; 0 <= m <= 20000; 0 <= weight <= 1000000; simple graph.",
    (s) => {
      const { n, adj, rest } = graphInput(s, false, true),
        [source, target] = rest,
        d = Array(n).fill(Infinity),
        used = Array(n).fill(false);
      d[source] = 0;
      for (let k = 0; k < n; k++) {
        let u = -1;
        for (let i = 0; i < n; i++)
          if (!used[i] && (u < 0 || d[i] < d[u])) u = i;
        if (u < 0 || d[u] === Infinity) break;
        used[u] = true;
        for (const [v, w] of adj[u]) d[v] = Math.min(d[v], d[u] + w);
      }
      return d[target] === Infinity ? -1 : d[target];
    },
    [
      "4 4\n0 1 4\n0 2 1\n2 1 2\n1 3 1\n0 3",
      "3 1\n0 1 2\n0 2",
      "1 0\n0 0",
      "3 2\n0 1 0\n1 2 0\n0 2",
      "3 3\n0 1 10\n1 2 10\n0 2 3\n0 2",
    ],
  ),
  define(
    "alternating-color-route",
    "Shortest Route with Alternating Edge Colors",
    "State-space BFS",
    "Every directed edge is red (0) or blue (1). Find the fewest edges on a route from vertex 0 to vertex n-1 in which consecutive edges have different colors. The first edge can have either color. Print -1 if no valid route exists.",
    "Input: n m followed by m lines u v color. Vertices are 0..n-1. Output: shortest alternating route length or -1.",
    "1 <= n <= 100000; 0 <= m <= 200000; color is 0 or 1; no duplicate (u,v,color) triples.",
    (s) => {
      const a = numbers(s),
        n = a[0],
        m = a[1],
        adj: number[][][] = Array.from({ length: n }, () => []);
      for (let i = 0; i < m; i++) {
        const [u, v, c] = a.slice(2 + 3 * i, 5 + 3 * i);
        adj[u].push([v, c]);
      }
      const dist = Array.from({ length: n }, () => [-1, -1]),
        q = [
          [0, 0],
          [0, 1],
        ];
      dist[0] = [0, 0];
      for (let k = 0; k < q.length; k++) {
        const [u, last] = q[k];
        if (u === n - 1) return dist[u][last];
        for (const [v, c] of adj[u])
          if (c !== last && dist[v][c] === -1) {
            dist[v][c] = dist[u][last] + 1;
            q.push([v, c]);
          }
      }
      return -1;
    },
    [
      "3 2\n0 1 0\n1 2 1",
      "3 2\n0 1 0\n1 2 0",
      "1 0",
      "4 4\n0 1 0\n1 3 1\n0 2 1\n2 3 0",
      "4 4\n0 1 0\n1 2 0\n0 2 1\n2 3 0",
    ],
  ),
  define(
    "network-rewiring",
    "Reconnect a Network by Moving Cables",
    "Disjoint set",
    "A cable joining two vertices may be removed and connected between any other pair. Find the minimum moves needed to connect all vertices, or -1 if there are too few cables.",
    "Input: n m followed by m undirected edges u v. Vertices 0..n-1. Output: moves or -1.",
    "1 <= n <= 100000; 0 <= m <= 200000; simple graph.",
    (s) => {
      const { n, m, edges } = graphInput(s);
      if (m < n - 1) return -1;
      const d = dsu(n);
      let components = n;
      for (const [u, v] of edges) if (d.join(u, v)) components--;
      return components - 1;
    },
    [
      "4 3\n0 1\n0 2\n1 2",
      "6 4\n0 1\n0 2\n0 3\n1 2",
      "1 0",
      "4 3\n0 1\n1 2\n2 3",
      "6 5\n0 1\n1 2\n2 0\n3 4\n4 5",
    ],
  ),
  define(
    "dynamic-connectivity",
    "Online Union and Connectivity Queries",
    "Disjoint set",
    "Process UNION u v operations joining components and ASK u v operations checking whether two vertices are connected. Initially every vertex is separate.",
    "Input: n q, followed by q lines UNION u v or ASK u v. Vertices 0..n-1. Output: YES or NO for each ASK, in order. At least one ASK occurs.",
    "1 <= n <= 100000; 1 <= q <= 200000.",
    (s) => {
      const a = lines(s),
        [n] = numbers(a[0]),
        d = dsu(n),
        ans: string[] = [];
      for (const line of a.slice(1)) {
        const [op, u, v] = line.split(/\s+/);
        if (op === "UNION") d.join(+u, +v);
        else ans.push(d.find(+u) === d.find(+v) ? "YES" : "NO");
      }
      return ans.join("\n");
    },
    [
      "4 5\nASK 0 1\nUNION 0 1\nUNION 1 2\nASK 0 2\nASK 2 3",
      "1 1\nASK 0 0",
      "3 3\nUNION 0 1\nUNION 0 1\nASK 1 2",
      "2 2\nUNION 0 1\nASK 0 1",
      "3 2\nASK 1 1\nASK 0 2",
    ],
  ),
  define(
    "unreachable-pairs",
    "Pairs in Different Components",
    "Disjoint set",
    "Count unordered pairs of distinct vertices that cannot reach each other in an undirected graph.",
    "Input: n m followed by m undirected edges u v. Vertices 0..n-1. Output: pair count.",
    "1 <= n <= 100000; 0 <= m <= 200000; simple graph.",
    (s) => {
      const { n, edges } = graphInput(s),
        d = dsu(n);
      for (const [u, v] of edges) d.join(u, v);
      let ans = 0,
        seen = 0;
      for (let i = 0; i < n; i++)
        if (d.find(i) === i) {
          ans += seen * d.size[i];
          seen += d.size[i];
        }
      return ans;
    },
    ["5 2\n0 1\n2 3", "3 0", "1 0", "4 3\n0 1\n1 2\n2 3", "6 3\n0 1\n1 2\n3 4"],
  ),
  define(
    "grid-one-removal",
    "Shortest Grid Route with One Wall Removal",
    "State-space BFS",
    "Move from top-left to bottom-right in four directions. Zero cells are open and one cells are blocked. You may remove at most one blocked cell, including a blocked start or destination. Find the minimum moves, or -1 if impossible. Standing in the starting cell costs zero moves.",
    "Input: rows columns followed by binary cells in row-major order. Output: minimum moves or -1.",
    "1 <= rows,columns <= 300; entries are 0 or 1.",
    (s) => {
      const { r, c, g } = matrix(s),
        seen = Array.from({ length: r }, () =>
          Array.from({ length: c }, () => [false, false]),
        ),
        q = [[0, 0, g[0][0], 0]];
      seen[0][0][g[0][0]] = true;
      for (let k = 0; k < q.length; k++) {
        const [i, j, used, d] = q[k];
        if (i === r - 1 && j === c - 1) return d;
        for (const [di, dj] of four) {
          const x = i + di,
            y = j + dj;
          if (x < 0 || x >= r || y < 0 || y >= c) continue;
          const next = used + g[x][y];
          if (next <= 1 && !seen[x][y][next]) {
            seen[x][y][next] = true;
            q.push([x, y, next, d + 1]);
          }
        }
      }
      return -1;
    },
    [
      "3 3\n0 1 0\n1 1 0\n0 0 0",
      "2 2\n1 1\n1 1",
      "1 1\n1",
      "1 1\n0",
      "1 3\n0 1 0",
    ],
  ),
  define(
    "eventually-safe-vertices",
    "Vertices Guaranteed to Terminate",
    "Topological elimination",
    "A vertex is safe if every directed path starting there eventually reaches a vertex with no outgoing edges; no path from it may enter a cycle. Print all safe vertices in increasing order, or NONE.",
    "Input: n m followed by m directed edges u v. Vertices 0..n-1. Output: safe vertex indices or NONE.",
    "1 <= n <= 100000; 0 <= m <= 200000; no duplicate edges.",
    (s) => {
      const { n, edges } = graphInput(s, true),
        rev: number[][] = Array.from({ length: n }, () => []),
        deg = Array(n).fill(0),
        q: number[] = [];
      for (const [u, v] of edges) {
        rev[v].push(u);
        deg[u]++;
      }
      for (let i = 0; i < n; i++) if (!deg[i]) q.push(i);
      for (let k = 0; k < q.length; k++)
        for (const p of rev[q[k]]) if (!--deg[p]) q.push(p);
      return q.length ? out(q.sort((a, b) => a - b)) : "NONE";
    },
    [
      "7 7\n0 1\n0 2\n1 2\n1 3\n2 5\n3 0\n4 5",
      "3 3\n0 1\n1 2\n2 0",
      "1 0",
      "3 2\n0 1\n1 2",
      "4 3\n0 0\n1 2\n2 3",
    ],
  ),
  define(
    "nearest-zero-distances",
    "Distance to the Nearest Zero",
    "Multi-source BFS",
    "For every cell, find the fewest four-directional moves needed to reach a 0 cell. At least one zero exists.",
    "Input: rows columns followed by binary cells. Output: a distance matrix with rows lines and columns space-separated values.",
    "1 <= rows,columns <= 500; entries 0 or 1; at least one 0.",
    (s) => {
      const { r, c, g } = matrix(s),
        d = Array.from({ length: r }, () => Array(c).fill(-1)),
        q: number[][] = [];
      for (let i = 0; i < r; i++)
        for (let j = 0; j < c; j++)
          if (!g[i][j]) {
            d[i][j] = 0;
            q.push([i, j]);
          }
      for (let k = 0; k < q.length; k++)
        for (const [di, dj] of four) {
          const x = q[k][0] + di,
            y = q[k][1] + dj;
          if (x >= 0 && x < r && y >= 0 && y < c && d[x][y] < 0) {
            d[x][y] = d[q[k][0]][q[k][1]] + 1;
            q.push([x, y]);
          }
        }
      return d.map(out).join("\n");
    },
    [
      "3 3\n0 0 0\n0 1 0\n1 1 1",
      "1 1\n0",
      "1 4\n1 1 1 0",
      "2 2\n0 1\n1 1",
      "2 3\n1 0 1\n1 1 0",
    ],
  ),
  define(
    "jump-board",
    "Minimum Dice Throws on a Jump Board",
    "BFS",
    "Squares are numbered 0 through n-1. A move rolls a chosen value 1..6 without overshooting. After landing, take exactly one forced jump if jump[square] is not -1. Find minimum throws to reach n-1, or -1 if impossible. Do not take a jump from the initial square before the first roll.",
    "Input: n followed by n integers jump[i], each -1 or a destination index. jump[0] and jump[n-1] are -1. Output: throws or -1.",
    "2 <= n <= 10000; every jump destination is in 0..n-1; jumps may form cycles.",
    (s) => {
      const a = numbers(s),
        n = a[0],
        jump = a.slice(1),
        q = [[0, 0]],
        seen = new Set([0]);
      for (let k = 0; k < q.length; k++) {
        const [u, d] = q[k];
        if (u === n - 1) return d;
        for (let v = u + 1; v <= Math.min(n - 1, u + 6); v++) {
          const w = jump[v] === -1 ? v : jump[v];
          if (!seen.has(w)) {
            seen.add(w);
            q.push([w, d + 1]);
          }
        }
      }
      return -1;
    },
    [
      "10\n-1 -1 8 -1 -1 -1 -1 -1 -1 -1",
      "2\n-1 -1",
      "8\n-1 0 0 0 0 0 0 -1",
      "8\n-1 -1 -1 -1 -1 -1 -1 -1",
      "9\n-1 7 -1 -1 -1 -1 -1 1 -1",
    ],
  ),
  define(
    "tree-diameter",
    "Longest Path in a Tree",
    "Tree traversal",
    "Find the tree diameter, measured in edges: the longest simple path between any pair of vertices.",
    "Input: n followed by n-1 undirected edges u v. Vertices 0..n-1; input is a tree. Output: diameter.",
    "1 <= n <= 100000.",
    (s) => {
      const { n, adj } = treeInput(s);
      const far = (root: number) => {
        const d = Array(n).fill(-1),
          q = [root];
        d[root] = 0;
        let best = root;
        for (let k = 0; k < q.length; k++)
          for (const v of adj[q[k]])
            if (d[v] === -1) {
              d[v] = d[q[k]] + 1;
              q.push(v);
              if (d[v] > d[best]) best = v;
            }
        return [best, d[best]];
      };
      return far(far(0)[0])[1];
    },
    [
      "5\n0 1\n1 2\n1 3\n3 4",
      "1",
      "4\n0 1\n0 2\n0 3",
      "4\n0 1\n1 2\n2 3",
      "2\n0 1",
    ],
  ),
  define(
    "tree-lca",
    "Lowest Common Ancestor in a Rooted Tree",
    "Trees",
    "Root the tree at vertex 0. Find the lowest common ancestor of two specified vertices: their deepest shared ancestor, counting a vertex as its own ancestor.",
    "Input: n, n-1 undirected edges u v, then query vertices a b. Output: LCA vertex index.",
    "1 <= n <= 100000; vertices 0..n-1; input is a tree.",
    (s) => {
      const { adj, rest } = treeInput(s),
        { parent } = treeOrder(adj);
      let [a, b] = rest;
      const seen = new Set<number>();
      while (true) {
        seen.add(a);
        if (a === 0) break;
        a = parent[a];
      }
      while (!seen.has(b)) b = parent[b];
      return b;
    },
    [
      "5\n0 1\n0 2\n1 3\n1 4\n3 4",
      "5\n0 1\n0 2\n1 3\n1 4\n3 2",
      "1\n0 0",
      "3\n0 1\n1 2\n1 2",
      "3\n0 1\n0 2\n0 2",
    ],
  ),
  define(
    "tree-right-view",
    "Rightmost Vertex at Every Depth",
    "Trees",
    "Treat vertex 0 as the root of a tree. At each vertex, visit child vertices in increasing index order. Print the last vertex in this left-to-right breadth-first ordering at every depth.",
    "Input: n followed by n-1 undirected edges u v. Vertices 0..n-1; input is a tree. Output: one space-separated vertex per depth.",
    "1 <= n <= 100000.",
    (s) => {
      const { adj } = treeInput(s),
        { parent } = treeOrder(adj),
        q = [[0, 0]],
        ans: number[] = [];
      for (const a of adj) a.sort((x, y) => x - y);
      for (let k = 0; k < q.length; k++) {
        const [u, d] = q[k];
        ans[d] = u;
        for (const v of adj[u]) if (parent[v] === u) q.push([v, d + 1]);
      }
      return out(ans);
    },
    [
      "5\n0 1\n0 2\n1 3\n1 4",
      "1",
      "4\n0 1\n1 2\n2 3",
      "4\n0 3\n0 2\n0 1",
      "6\n0 2\n0 1\n1 5\n2 3\n2 4",
    ],
  ),
  define(
    "zero-sum-submatrices",
    "Count Zero-Sum Submatrices",
    "Row compression and hashing",
    "Count axis-aligned nonempty rectangular submatrices whose cell values sum to zero. Different rectangle boundaries count separately.",
    "Input: rows columns followed by signed cell values in row-major order. Output: number of zero-sum rectangles.",
    "1 <= rows,columns <= 100; -1000 <= cell value <= 1000; use a signed 64-bit counter.",
    (s) => {
      const { r, c, g } = matrix(s);
      let ans = 0;
      for (let top = 0; top < r; top++) {
        const cols = Array(c).fill(0);
        for (let bottom = top; bottom < r; bottom++) {
          for (let j = 0; j < c; j++) cols[j] += g[bottom][j];
          let prefix = 0;
          const freq = new Map([[0, 1]]);
          for (const v of cols) {
            prefix += v;
            ans += freq.get(prefix) || 0;
            freq.set(prefix, (freq.get(prefix) || 0) + 1);
          }
        }
      }
      return ans;
    },
    [
      "2 2\n1 -1\n-1 1",
      "2 2\n1 2\n-1 -2",
      "1 1\n0",
      "2 3\n0 0 0\n0 0 0",
      "1 3\n1 2 3",
    ],
  ),
  define(
    "subtree-sizes",
    "Size of Every Rooted Subtree",
    "Tree dynamic programming",
    "Root the tree at 0. For each vertex, count itself and all its descendants.",
    "Input: n followed by n-1 undirected edges u v. Vertices 0..n-1. Output: n space-separated subtree sizes in vertex-index order.",
    "1 <= n <= 100000; input is a tree.",
    (s) => {
      const { n, adj } = treeInput(s),
        { parent, order } = treeOrder(adj),
        size = Array(n).fill(1);
      for (const u of order.reverse()) if (u !== 0) size[parent[u]] += size[u];
      return out(size);
    },
    [
      "5\n0 1\n0 2\n1 3\n1 4",
      "1",
      "4\n0 1\n1 2\n2 3",
      "4\n0 1\n0 2\n0 3",
      "3\n0 2\n2 1",
    ],
  ),
  define(
    "validate-bst",
    "Validate a Binary Search Tree",
    "Trees",
    "A binary tree is encoded by indexed nodes. Check the strict BST rule: every left-descendant value is smaller and every right-descendant value larger than its ancestor. Duplicates invalidate the tree.",
    "Input: n, then n lines value leftChild rightChild; -1 means no child. Root is node 0; all nodes form one valid binary tree. Output: YES or NO.",
    "1 <= n <= 100000; values between -1000000000 and 1000000000; child indices 0..n-1 or -1.",
    (s) => {
      const a = numbers(s),
        n = a[0],
        nodes = Array.from({ length: n }, (_, i) =>
          a.slice(1 + 3 * i, 4 + 3 * i),
        ),
        stack = [[0, -Infinity, Infinity]];
      while (stack.length) {
        const [u, lo, hi] = stack.pop()!,
          [v, l, r] = nodes[u];
        if (v <= lo || v >= hi) return "NO";
        if (l >= 0) stack.push([l, lo, v]);
        if (r >= 0) stack.push([r, v, hi]);
      }
      return "YES";
    },
    [
      "3\n2 1 2\n1 -1 -1\n3 -1 -1",
      "5\n5 1 2\n1 -1 -1\n6 3 4\n4 -1 -1\n7 -1 -1",
      "1\n0 -1 -1",
      "2\n2 1 -1\n2 -1 -1",
      "3\n0 1 2\n-2 -1 -1\n4 -1 -1",
    ],
  ),
  define(
    "bst-kth",
    "Kth Smallest in an Indexed BST",
    "Trees",
    "Given an indexed strict binary search tree, find the k-th smallest stored value. Use an inorder traversal rather than sorting the values.",
    "Input: n k, then n lines value leftChild rightChild, with -1 for no child. Root 0. Output: k-th smallest value (k is 1-based).",
    "1 <= k <= n <= 100000; values between -1000000 and 1000000; input is a valid BST.",
    (s) => {
      const a = numbers(s),
        n = a[0],
        k = a[1],
        nodes = Array.from({ length: n }, (_, i) =>
          a.slice(2 + 3 * i, 5 + 3 * i),
        ),
        st: number[] = [];
      let u = 0,
        count = 0;
      while (u !== -1 || st.length) {
        while (u !== -1) {
          st.push(u);
          u = nodes[u][1];
        }
        u = st.pop()!;
        if (++count === k) return nodes[u][0];
        u = nodes[u][2];
      }
      return 0;
    },
    [
      "3 2\n2 1 2\n1 -1 -1\n3 -1 -1",
      "1 1\n7 -1 -1",
      "3 1\n0 1 2\n-2 -1 -1\n4 -1 -1",
      "3 3\n2 1 2\n1 -1 -1\n3 -1 -1",
      "4 3\n5 1 2\n2 -1 3\n9 -1 -1\n4 -1 -1",
    ],
  ),
  define(
    "binary-tree-columns",
    "Vertical Columns of a Binary Tree",
    "Trees and sorting",
    "Root 0 has row 0,column 0; a left child has row+1,column-1, and right child row+1,column+1. Print each column from left to right. Within a column, sort by row then value, then node index for a remaining tie.",
    "Input: n, then n lines value leftChild rightChild; -1 means absent. All nodes form a valid tree rooted at 0. Output: number of columns, then one line of values per column.",
    "1 <= n <= 100000; -1000000 <= value <= 1000000.",
    (s) => {
      const a = numbers(s),
        n = a[0],
        nodes = Array.from({ length: n }, (_, i) =>
          a.slice(1 + 3 * i, 4 + 3 * i),
        ),
        q = [[0, 0, 0]],
        records: number[][] = [];
      for (let i = 0; i < q.length; i++) {
        const [u, row, col] = q[i],
          [v, l, r] = nodes[u];
        records.push([col, row, v, u]);
        if (l >= 0) q.push([l, row + 1, col - 1]);
        if (r >= 0) q.push([r, row + 1, col + 1]);
      }
      records.sort(
        (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3],
      );
      const cols: number[][] = [];
      let prev = Infinity;
      for (const [c, , v] of records) {
        if (c !== prev) {
          cols.push([]);
          prev = c;
        }
        cols.at(-1)!.push(v);
      }
      return cols.length + "\n" + cols.map(out).join("\n");
    },
    [
      "5\n3 1 2\n9 -1 -1\n20 3 4\n15 -1 -1\n7 -1 -1",
      "1\n1 -1 -1",
      "3\n1 1 2\n2 -1 -1\n3 -1 -1",
      "4\n1 1 -1\n2 2 -1\n3 3 -1\n4 -1 -1",
      "5\n1 1 2\n2 -1 3\n3 4 -1\n5 -1 -1\n4 -1 -1",
    ],
  ),
  define(
    "inversion-count",
    "Count Out-of-Order Index Pairs",
    "Merge sort",
    "Count pairs i<j with a[i]>a[j]. Equal values do not form inversions. Use O(n log n) time.",
    A,
    NC,
    (s) => {
      const a = array(s);
      const run = (b: number[]): [number[], number] => {
        if (b.length < 2) return [b, 0];
        const m = b.length >> 1,
          [l, x] = run(b.slice(0, m)),
          [r, y] = run(b.slice(m));
        let i = 0,
          j = 0,
          count = x + y;
        const v: number[] = [];
        while (i < l.length && j < r.length)
          if (l[i] <= r[j]) v.push(l[i++]);
          else {
            v.push(r[j++]);
            count += l.length - i;
          }
        return [v.concat(l.slice(i), r.slice(j)), count];
      };
      return run(a)[1];
    },
    ["5\n2 4 1 3 5", "5\n5 4 3 2 1", "1\n0", "4\n2 2 2 2", "4\n-1 -3 0 -2"],
  ),
  define(
    "range-add-queries",
    "Range Additions and Point Queries",
    "Fenwick tree",
    "Start with an all-zero array of length n. Process ADD l r delta, adding delta to every position in inclusive [l,r], and GET i queries.",
    "Input: n q, followed by q operation lines ADD l r delta or GET i. Indices are 0-based. Output: value for each GET on its own line. At least one GET occurs.",
    "1 <= n,q <= 100000; 0 <= l <= r < n; |delta| <= 1000000.",
    (s) => {
      const a = lines(s),
        [n] = numbers(a[0]),
        bit = Array(n + 2).fill(0),
        ans: number[] = [];
      const add = (i: number, x: number) => {
        for (i++; i <= n + 1; i += i & -i) bit[i] += x;
      };
      for (const line of a.slice(1)) {
        const t = line.split(/\s+/);
        if (t[0] === "ADD") {
          add(+t[1], +t[3]);
          add(+t[2] + 1, -Number(t[3]));
        } else {
          let v = 0;
          for (let i = +t[1] + 1; i > 0; i -= i & -i) v += bit[i];
          ans.push(v);
        }
      }
      return ans.join("\n");
    },
    [
      "5 5\nADD 1 3 2\nGET 0\nGET 2\nADD 2 4 -1\nGET 3",
      "1 2\nADD 0 0 7\nGET 0",
      "3 2\nGET 0\nGET 2",
      "3 4\nADD 0 2 5\nADD 1 1 3\nGET 1\nGET 2",
      "2 3\nADD 0 1 -2\nGET 0\nGET 1",
    ],
  ),
  define(
    "sliding-window-maximum",
    "Maximum in Every Sliding Window",
    "Monotonic deque",
    "Find the maximum value in every contiguous length-k window, from left to right, using O(n) time.",
    "Input: n k followed by n integers. Output: n-k+1 space-separated maxima.",
    NC + "; 1 <= k <= n.",
    (s) => {
      const a = numbers(s),
        k = a[1],
        v = a.slice(2),
        q: number[] = [],
        ans: number[] = [];
      let head = 0;
      for (let i = 0; i < v.length; i++) {
        while (q.length > head && q[head] <= i - k) head++;
        while (q.length > head && v[q.at(-1)!] <= v[i]) q.pop();
        q.push(i);
        if (i >= k - 1) ans.push(v[q[head]]);
      }
      return out(ans);
    },
    [
      "8 3\n1 3 -1 -3 5 3 6 7",
      "3 1\n2 1 3",
      "3 3\n2 1 3",
      "4 2\n4 4 4 4",
      "5 2\n5 4 3 2 1",
    ],
  ),
  define(
    "circular-next-greater",
    "Next Greater Value around a Circle",
    "Monotonic stack",
    "For each index, scan forward circularly (up to n-1 other positions) and return the first strictly greater value. Use -1 if none exists.",
    "Input: n followed by n integers. Output: n space-separated answers.",
    NC,
    (s) => {
      const a = array(s),
        n = a.length,
        ans = Array(n).fill(-1),
        st: number[] = [];
      for (let i = 0; i < 2 * n; i++) {
        while (st.length && a[st.at(-1)!] < a[i % n]) ans[st.pop()!] = a[i % n];
        if (i < n) st.push(i);
      }
      return out(ans);
    },
    ["3\n1 2 1", "4\n4 3 2 1", "1\n7", "4\n2 2 2 2", "5\n1 5 3 6 2"],
  ),
];
