import type { PracticeDefinition } from "./types.js";

type Solver = (input: string) => string | number;
const nums = (s: string) => (s.trim() ? s.trim().split(/\s+/).map(Number) : []);
const vector = (s: string) => {
  const a = nums(s);
  return a.slice(1, a[0] + 1);
};
const lines = (s: string) => s.replace(/\r/g, "").split("\n");
const yn = (b: boolean) => (b ? "YES" : "NO");
const list = (a: (string | number)[]) => (a.length ? a.join(" ") : "EMPTY");
const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const matrix = (s: string) => {
  const a = nums(s),
    r = a[0],
    c = a[1];
  return Array.from({ length: r }, (_, i) =>
    a.slice(2 + i * c, 2 + (i + 1) * c),
  );
};
const square = (s: string) => {
  const a = nums(s),
    n = a[0];
  return Array.from({ length: n }, (_, i) =>
    a.slice(1 + i * n, 1 + (i + 1) * n),
  );
};
const arrays = (s: string) => {
  const a = nums(s),
    n = a[0],
    m = a[n + 1];
  return [a.slice(1, n + 1), a.slice(n + 2, n + 2 + m)];
};
const rows = (a: number[][]) => a.map((r) => list(r)).join("\n");
const prime = (n: number) => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
function d(
  id: string,
  title: string,
  topic: string,
  description: string,
  constraints: string,
  solve: Solver,
  inputs: string[],
): PracticeDefinition {
  const tests = inputs.map((input, i) => ({
    input,
    output: String(solve(input)),
    hidden: i >= 2,
  }));
  return {
    id: `easy-${id}`,
    title,
    difficulty: "Easy",
    topic,
    description: `Write a complete program that reads standard input and writes standard output. ${description}`,
    constraints,
    examples: tests.slice(0, 2).map(({ input, output }) => ({ input, output })),
    tests,
    solve: (input) => String(solve(input)),
  };
}

export const easyProblems: PracticeDefinition[] = [
  // Numbers and elementary mathematics: 1–30.
  d(
    "array-total",
    "Array total",
    "Arrays",
    "Input: n, followed by n integers. Output their sum.",
    "0 <= n <= 1000; each value is between -1000000 and 1000000.",
    (s) => vector(s).reduce((a, b) => a + b, 0),
    ["4\n2 3 -1 6", "3\n-2 -4 -6", "0", "1\n0", "5\n1 1 1 1 1"],
  ),
  d(
    "digit-product",
    "Product of decimal digits",
    "Numbers",
    "Input one nonnegative integer n. Output the product of its decimal digits. The product for n=0 is 0.",
    "0 <= n <= 1000000000.",
    (s) =>
      s
        .trim()
        .split("")
        .reduce((a, b) => a * Number(b), 1),
    ["234", "105", "0", "7", "99999"],
  ),
  d(
    "absolute-distance",
    "Distance on a number line",
    "Arithmetic",
    "Input two integers a and b. Output the absolute distance between them.",
    "-1000000000 <= a,b <= 1000000000.",
    (s) => {
      const [a, b] = nums(s);
      return Math.abs(a - b);
    },
    ["3 10", "-4 6", "0 0", "-8 -2", "1000000000 -1000000000"],
  ),
  d(
    "largest-three",
    "Largest of three",
    "Conditionals",
    "Input three integers. Output the largest value.",
    "Each integer is between -1000000000 and 1000000000.",
    (s) => Math.max(...nums(s)),
    ["4 9 2", "-5 -2 -8", "0 0 0", "7 7 3", "-1 0 1"],
  ),
  d(
    "parity-label",
    "Even or odd",
    "Conditionals",
    "Input one integer. Output EVEN if it is divisible by 2; otherwise output ODD.",
    "-1000000000 <= n <= 1000000000.",
    (s) => (Number(s.trim()) % 2 === 0 ? "EVEN" : "ODD"),
    ["12", "7", "0", "-3", "-8"],
  ),
  d(
    "leap-year",
    "Gregorian leap year",
    "Conditionals",
    "Input a year. Output YES if it is a Gregorian leap year, otherwise NO. Years divisible by 100 are leap years only when divisible by 400.",
    "1 <= year <= 9999.",
    (s) => {
      const y = Number(s);
      return yn(y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0));
    },
    ["2024", "1900", "2000", "1", "2100"],
  ),
  d(
    "factorial",
    "Small factorial",
    "Loops",
    "Input n. Output n!, where 0! equals 1.",
    "0 <= n <= 15; the answer fits an exact JavaScript integer and a signed 64-bit integer.",
    (s) => {
      let r = 1;
      for (let i = 2; i <= Number(s); i++) r *= i;
      return r;
    },
    ["5", "0", "1", "10", "15"],
  ),
  d(
    "fibonacci",
    "Fibonacci index",
    "Sequences",
    "Input n. Output F(n), where F(0)=0, F(1)=1 and F(n)=F(n-1)+F(n-2).",
    "0 <= n <= 40.",
    (s) => {
      let a = 0,
        b = 1;
      for (let i = 0; i < Number(s); i++) [a, b] = [b, a + b];
      return a;
    },
    ["7", "0", "1", "2", "40"],
  ),
  d(
    "triangular",
    "Triangular arrangement",
    "Arithmetic",
    "Input n, the number of rows of counters. Row i has i counters. Output the total counters in all n rows.",
    "0 <= n <= 1000000.",
    (s) => {
      const n = Number(s);
      return (n * (n + 1)) / 2;
    },
    ["4", "10", "0", "1", "1000000"],
  ),
  d(
    "integer-power",
    "Integer power",
    "Loops",
    "Input integers a and b. Output a raised to power b. For this problem, a^0 is 1, including 0^0.",
    "-10 <= a <= 10; 0 <= b <= 12.",
    (s) => {
      const [a, b] = nums(s);
      let r = 1;
      for (let i = 0; i < b; i++) r *= a;
      return r;
    },
    ["2 10", "-3 3", "0 0", "0 5", "-2 4"],
  ),
  d(
    "gcd",
    "Greatest common divisor",
    "Number theory",
    "Input two nonnegative integers a and b. Output their greatest common divisor. Define gcd(0,0)=0.",
    "0 <= a,b <= 1000000000.",
    (s) => {
      const [a, b] = nums(s);
      return gcd(a, b);
    },
    ["24 18", "17 13", "0 0", "0 9", "100 10"],
  ),
  d(
    "lcm",
    "Least common multiple",
    "Number theory",
    "Input two nonnegative integers. Output their least common multiple. If either input is zero, output 0.",
    "0 <= a,b <= 1000000; use a signed 64-bit integer for the answer.",
    (s) => {
      const [a, b] = nums(s);
      return a && b ? (a / gcd(a, b)) * b : 0;
    },
    ["6 8", "7 9", "0 8", "0 0", "1000000 999999"],
  ),
  d(
    "prime-check",
    "Is this number prime?",
    "Number theory",
    "Input n. Output YES exactly when n is prime. A prime has exactly two positive divisors.",
    "0 <= n <= 1000000.",
    (s) => yn(prime(Number(s))),
    ["29", "21", "0", "1", "2"],
  ),
  d(
    "divisor-count",
    "Count positive divisors",
    "Number theory",
    "Input a positive integer n. Output how many positive integers divide n exactly.",
    "1 <= n <= 1000000.",
    (s) => {
      const n = Number(s);
      let r = 0;
      for (let i = 1; i * i <= n; i++)
        if (n % i === 0) r += i * i === n ? 1 : 2;
      return r;
    },
    ["12", "25", "1", "2", "1000000"],
  ),
  d(
    "digit-sum",
    "Sum of decimal digits",
    "Numbers",
    "Input a nonnegative integer. Output the sum of its decimal digits.",
    "0 <= n <= 1000000000.",
    (s) =>
      s
        .trim()
        .split("")
        .reduce((a, b) => a + Number(b), 0),
    ["5073", "100", "0", "9", "999999999"],
  ),
  d(
    "reverse-number",
    "Reverse a nonnegative integer",
    "Numbers",
    "Input a nonnegative integer. Reverse its decimal digits and output the resulting integer without leading zeroes.",
    "0 <= n <= 1000000000.",
    (s) => Number(s.trim().split("").reverse().join("")),
    ["12340", "405", "0", "7", "1000000000"],
  ),
  d(
    "numeric-palindrome",
    "Decimal palindrome",
    "Numbers",
    "Input a nonnegative integer. Output YES if its ordinary decimal representation reads the same backward, otherwise NO.",
    "0 <= n <= 1000000000; input has no leading zeroes except 0.",
    (s) => yn(s.trim() === s.trim().split("").reverse().join("")),
    ["12321", "120", "0", "7", "100000001"],
  ),
  d(
    "armstrong",
    "Digit-power equality",
    "Numbers",
    "Input a nonnegative integer n with k decimal digits. Output YES if the sum of each digit raised to k equals n, otherwise NO. Zero has one digit.",
    "0 <= n <= 1000000000.",
    (s) => {
      const t = s.trim();
      return yn(
        [...t].reduce((a, b) => a + Number(b) ** t.length, 0) === Number(t),
      );
    },
    ["153", "154", "0", "9474", "10"],
  ),
  d(
    "binary-value",
    "Read a binary value",
    "Number bases",
    "Input a string consisting of binary digits. Output its decimal value.",
    "1 to 30 digits; leading zeroes are allowed.",
    (s) => parseInt(s.trim(), 2),
    ["101101", "00010", "0", "1", "111111111111111111111111111111"],
  ),
  d(
    "binary-format",
    "Write a binary value",
    "Number bases",
    "Input a nonnegative decimal integer. Output its binary representation with no leading zeroes, except output 0 for zero.",
    "0 <= n <= 1000000000.",
    (s) => Number(s).toString(2),
    ["45", "2", "0", "1", "1000000000"],
  ),
  d(
    "digital-root",
    "Repeated digit sum",
    "Numbers",
    "Input a nonnegative integer. Repeatedly replace it with the sum of its digits until a single digit remains. Output that digit.",
    "0 <= n <= 1000000000.",
    (s) => {
      let n = Number(s);
      while (n >= 10)
        n = String(n)
          .split("")
          .reduce((a, b) => a + Number(b), 0);
      return n;
    },
    ["9875", "38", "0", "9", "1000000000"],
  ),
  d(
    "factorial-zeroes",
    "Trailing zeroes of a factorial",
    "Number theory",
    "Input n. Output the number of zeroes at the end of the decimal representation of n!. Do not construct the factorial.",
    "0 <= n <= 1000000000.",
    (s) => {
      let n = Number(s),
        r = 0;
      while (n >= 5) {
        n = Math.floor(n / 5);
        r += n;
      }
      return r;
    },
    ["10", "25", "0", "4", "1000000000"],
  ),
  d(
    "perfect-number",
    "Perfect number",
    "Number theory",
    "Input n. Output YES if n equals the sum of its positive divisors smaller than n, otherwise NO.",
    "1 <= n <= 1000000.",
    (s) => {
      const n = Number(s);
      let sum = n === 1 ? 0 : 1;
      for (let i = 2; i * i <= n; i++)
        if (n % i === 0) sum += i + (i * i === n ? 0 : n / i);
      return yn(sum === n);
    },
    ["28", "12", "1", "6", "496"],
  ),
  d(
    "coprime-count",
    "Count coprime values",
    "Number theory",
    "Input n. Count integers x from 1 through n whose greatest common divisor with n is 1. Output the count.",
    "1 <= n <= 10000.",
    (s) => {
      const n = Number(s);
      let count = 0;
      for (let i = 1; i <= n; i++) if (gcd(i, n) === 1) count++;
      return count;
    },
    ["9", "10", "1", "2", "12"],
  ),
  d(
    "coin-count",
    "Standard coin change",
    "Greedy",
    "Input an amount in cents. Using unlimited coins worth 100, 50, 20, 10, 5, 2 and 1 cents, output the minimum number of coins needed.",
    "0 <= amount <= 1000000.",
    (s) => {
      let n = Number(s),
        r = 0;
      for (const c of [100, 50, 20, 10, 5, 2, 1]) {
        r += Math.floor(n / c);
        n %= c;
      }
      return r;
    },
    ["87", "203", "0", "1", "99"],
  ),
  d(
    "clock-angle",
    "Smaller angle on a clock",
    "Geometry",
    "Input hour h and minute m on an analog clock. The hour hand moves continuously. Output the smaller angle between the hands in degrees with exactly one digit after the decimal point.",
    "0 <= h <= 23; 0 <= m <= 59.",
    (s) => {
      const [h, m] = nums(s),
        a = Math.abs((h % 12) * 30 + m * 0.5 - m * 6);
      return Math.min(a, 360 - a).toFixed(1);
    },
    ["3 0", "12 30", "0 0", "23 59", "6 0"],
  ),
  d(
    "rectangle-fit",
    "Rectangle containment without rotation",
    "Geometry",
    "Input outer width W, outer height H, inner width w and inner height h. Output YES if the inner rectangle fits without rotation, otherwise NO.",
    "All dimensions are integers between 1 and 1000000.",
    (s) => {
      const [W, H, w, h] = nums(s);
      return yn(w <= W && h <= H);
    },
    ["10 8 6 7", "4 9 8 3", "1 1 1 1", "5 5 6 5", "10 10 9 10"],
  ),
  d(
    "manhattan",
    "City-block distance",
    "Geometry",
    "Input x1 y1 x2 y2 for two grid points. Output their Manhattan distance: the minimum number of unit horizontal or vertical steps between them.",
    "Coordinates are integers between -1000000 and 1000000.",
    (s) => {
      const [a, b, c, d] = nums(s);
      return Math.abs(a - c) + Math.abs(b - d);
    },
    ["1 2 4 6", "-2 -3 2 1", "0 0 0 0", "5 0 5 9", "-1 0 0 -1"],
  ),
  d(
    "packing-boxes",
    "Minimum boxes",
    "Arithmetic",
    "Input n items and capacity k items per box. Output the smallest number of boxes needed. Empty boxes need not be used.",
    "0 <= n <= 1000000000; 1 <= k <= 1000000000.",
    (s) => {
      const [n, k] = nums(s);
      return Math.ceil(n / k);
    },
    ["23 5", "20 5", "0 7", "1 100", "1000000000 3"],
  ),
  d(
    "ap-term",
    "Term in an arithmetic progression",
    "Sequences",
    "Input first term a, common difference d and a one-based index n. Output the nth term.",
    "-1000000 <= a,d <= 1000000; 1 <= n <= 1000000; use signed 64-bit arithmetic.",
    (s) => {
      const [a, d, n] = nums(s);
      return a + (n - 1) * d;
    },
    ["3 4 5", "10 -2 4", "0 0 1", "-5 3 1", "1 1 1000000"],
  ),
  // Arrays: 31–50.
  d(
    "array-range",
    "Range of an array",
    "Arrays",
    "Input n followed by n integers. Output the difference between the largest and smallest values.",
    "1 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s);
      return Math.max(...a) - Math.min(...a);
    },
    ["5\n8 2 10 -1 4", "3\n7 7 7", "1\n-5", "2\n-100 100", "4\n0 2 1 9"],
  ),
  d(
    "positive-negative",
    "Positive, negative and zero counts",
    "Arrays",
    "Input n followed by n integers. Output three space-separated counts: positive values, negative values, and zeroes.",
    "0 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s);
      return [
        a.filter((x) => x > 0).length,
        a.filter((x) => x < 0).length,
        a.filter((x) => x === 0).length,
      ].join(" ");
    },
    ["6\n1 -2 0 4 0 -8", "3\n1 2 3", "0", "1\n0", "3\n-1 -1 -1"],
  ),
  d(
    "second-largest",
    "Second largest distinct value",
    "Arrays",
    "Input n followed by n integers. Output the second largest distinct value, or NONE if fewer than two distinct values exist.",
    "1 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = [...new Set(vector(s))].sort((a, b) => b - a);
      return a.length > 1 ? a[1] : "NONE";
    },
    ["5\n4 9 9 2 7", "3\n5 5 5", "1\n0", "4\n-3 -8 -1 -1", "2\n1 2"],
  ),
  d(
    "nondecreasing",
    "Check nondecreasing order",
    "Arrays",
    "Input n followed by n integers. Output YES if every value is at least the previous value; otherwise NO. Empty and single-element arrays are sorted.",
    "0 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s);
      return yn(a.every((x, i) => i === 0 || x >= a[i - 1]));
    },
    ["5\n1 2 2 3 9", "3\n1 4 2", "0", "1\n5", "3\n-3 -2 -1"],
  ),
  d(
    "rotate-left",
    "Rotate left by k",
    "Arrays",
    "Input n and k, followed by n integers. Rotate the array left by k positions. Output the resulting values separated by spaces.",
    "1 <= n <= 1000; 0 <= k <= 1000000000; values between -1000000 and 1000000.",
    (s) => {
      const a = nums(s),
        n = a[0],
        k = a[1] % n,
        v = a.slice(2);
      return list([...v.slice(k), ...v.slice(0, k)]);
    },
    ["5 2\n1 2 3 4 5", "3 4\n7 8 9", "1 99\n4", "3 0\n-1 0 1", "4 4\n1 2 3 4"],
  ),
  d(
    "reverse-array",
    "Reverse array order",
    "Arrays",
    "Input n followed by n integers. Output them in reverse order, separated by spaces. For an empty array output EMPTY.",
    "0 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => list(vector(s).reverse()),
    ["4\n1 3 5 7", "3\n-1 0 2", "0", "1\n5", "5\n2 2 2 2 2"],
  ),
  d(
    "prefix-totals",
    "Prefix totals",
    "Arrays",
    "Input n followed by n integers. Output n prefix sums: output i is the sum of elements from the start through position i. Output EMPTY when n=0.",
    "0 <= n <= 1000; values between -1000000 and 1000000; use signed 64-bit arithmetic.",
    (s) => {
      let t = 0;
      return list(vector(s).map((x) => (t += x)));
    },
    ["4\n2 3 -1 5", "3\n-2 -3 -4", "0", "1\n9", "4\n0 0 0 0"],
  ),
  d(
    "suffix-maxima",
    "Largest value to the right",
    "Arrays",
    "Input n followed by n integers. For each position output the largest value in the suffix starting at that position.",
    "1 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s),
        r: number[] = [];
      let m = -Infinity;
      for (let i = a.length - 1; i >= 0; i--) r[i] = m = Math.max(m, a[i]);
      return list(r);
    },
    ["5\n3 1 8 2 4", "3\n9 7 1", "1\n-4", "3\n-5 -2 -8", "4\n1 2 3 4"],
  ),
  d(
    "query-frequencies",
    "Frequency queries",
    "Hashing",
    "Input n followed by n integers, then q followed by q query integers. For each query print its frequency in the array, one result per line.",
    "0 <= n <= 1000; 1 <= q <= 1000; values and queries between -1000000 and 1000000.",
    (s) => {
      const a = nums(s),
        n = a[0],
        f = new Map<number, number>();
      for (const x of a.slice(1, n + 1)) f.set(x, (f.get(x) || 0) + 1);
      return a
        .slice(n + 2)
        .map((x) => f.get(x) || 0)
        .join("\n");
    },
    [
      "5\n2 2 4 5 2\n3\n2 4 7",
      "3\n-1 0 -1\n2\n-1 0",
      "0\n1\n4",
      "1\n9\n2\n9 0",
      "4\n1 1 1 1\n1\n1",
    ],
  ),
  d(
    "missing-value",
    "Missing value from one through n",
    "Arrays",
    "Input n followed by n-1 distinct integers from 1 through n. Exactly one value is missing. Output that value.",
    "1 <= n <= 100000; the stated distinctness and range are guaranteed.",
    (s) => {
      const a = nums(s),
        n = a[0];
      return (n * (n + 1)) / 2 - a.slice(1).reduce((a, b) => a + b, 0);
    },
    ["5\n2 5 1 3", "4\n2 3 4", "1", "2\n1", "6\n1 2 3 4 5"],
  ),
  d(
    "majority",
    "Strict majority",
    "Hashing",
    "Input n followed by n integers. Output the value occurring more than n/2 times, or NONE if no such value exists.",
    "1 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s),
        m = new Map<number, number>();
      for (const x of a) m.set(x, (m.get(x) || 0) + 1);
      return [...m].find(([, c]) => c > a.length / 2)?.[0] ?? "NONE";
    },
    ["5\n2 1 2 2 3", "4\n1 1 2 2", "1\n-1", "3\n0 0 0", "6\n3 3 3 3 1 2"],
  ),
  d(
    "array-mode",
    "Most frequent, smallest on ties",
    "Hashing",
    "Input n followed by n integers. Output the most frequent value. If several tie, output the smallest of them.",
    "1 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const m = new Map<number, number>();
      for (const x of vector(s)) m.set(x, (m.get(x) || 0) + 1);
      return [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    },
    ["6\n4 2 4 2 9 9", "5\n3 3 1 2 3", "1\n8", "3\n-1 -2 -3", "4\n0 0 1 1"],
  ),
  d(
    "balance-index",
    "First balance index",
    "Prefix sums",
    "Input n followed by n integers. Output the smallest zero-based index with equal sums strictly to its left and right. Output -1 if none exists.",
    "1 <= n <= 1000; values between -1000000 and 1000000; empty-side sums are zero.",
    (s) => {
      const a = vector(s);
      let r = a.reduce((a, b) => a + b, 0),
        l = 0;
      for (let i = 0; i < a.length; i++) {
        r -= a[i];
        if (l === r) return i;
        l += a[i];
      }
      return -1;
    },
    ["7\n-7 1 5 2 -4 3 0", "3\n1 2 3", "1\n9", "3\n0 0 0", "3\n2 -2 0"],
  ),
  d(
    "move-zeroes",
    "Move zeroes to the end",
    "Arrays",
    "Input n followed by n integers. Move all zeroes to the end while preserving the order of nonzero values. Output the array; output EMPTY for n=0.",
    "0 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s);
      return list([...a.filter((x) => x !== 0), ...a.filter((x) => x === 0)]);
    },
    ["6\n0 1 0 3 2 0", "4\n1 2 3 4", "0", "3\n0 0 0", "4\n-1 0 -2 0"],
  ),
  d(
    "merge-sorted",
    "Merge sorted arrays",
    "Two pointers",
    "Input n followed by n sorted integers, then m followed by m sorted integers. Output their sorted merged sequence, keeping duplicates. Output EMPTY if both are empty.",
    "0 <= n,m <= 1000; both input arrays are nondecreasing; values between -1000000 and 1000000.",
    (s) =>
      list(
        arrays(s)
          .flat()
          .sort((a, b) => a - b),
      ),
    [
      "3\n1 4 8\n3\n2 4 9",
      "2\n-5 0\n1\n-1",
      "0\n0",
      "0\n2\n3 7",
      "3\n1 1 1\n2\n1 2",
    ],
  ),
  d(
    "deduplicate-sorted",
    "Remove duplicates from sorted input",
    "Two pointers",
    "Input n followed by n nondecreasing integers. Output each distinct value once, in the same sorted order. Output EMPTY if n=0.",
    "0 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => list([...new Set(vector(s))]),
    ["7\n1 1 2 4 4 4 9", "3\n-2 -2 0", "0", "1\n5", "4\n7 7 7 7"],
  ),
  d(
    "set-intersection",
    "Unique common values",
    "Sets",
    "Input n followed by n integers, then m followed by m integers. Output the distinct values appearing in both arrays, sorted increasingly. Output EMPTY if there are none.",
    "0 <= n,m <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const [a, b] = arrays(s),
        set = new Set(b);
      return list(
        [...new Set(a)].filter((x) => set.has(x)).sort((a, b) => a - b),
      );
    },
    [
      "4\n3 1 3 5\n3\n5 3 8",
      "2\n1 2\n2\n3 4",
      "0\n0",
      "1\n0\n2\n0 0",
      "3\n-2 -1 0\n2\n-1 -2",
    ],
  ),
  d(
    "set-union",
    "Unique combined values",
    "Sets",
    "Input n followed by n integers, then m followed by m integers. Output all distinct values appearing in either array, sorted increasingly. Output EMPTY if both are empty.",
    "0 <= n,m <= 1000; values between -1000000 and 1000000.",
    (s) => list([...new Set(arrays(s).flat())].sort((a, b) => a - b)),
    [
      "3\n3 1 3\n3\n2 1 4",
      "1\n-2\n1\n-2",
      "0\n0",
      "0\n2\n1 2",
      "2\n9 8\n2\n7 6",
    ],
  ),
  d(
    "minimum-gap",
    "Closest pair of values",
    "Sorting",
    "Input n followed by n integers. Output the smallest absolute difference between any two values at different positions.",
    "2 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s).sort((a, b) => a - b);
      let best = Infinity;
      for (let i = 1; i < a.length; i++) best = Math.min(best, a[i] - a[i - 1]);
      return best;
    },
    [
      "5\n8 1 5 3 9",
      "3\n7 7 10",
      "2\n-5 4",
      "4\n0 100 200 300",
      "3\n-3 -10 -7",
    ],
  ),
  d(
    "array-leaders",
    "Values greater than everything after them",
    "Arrays",
    "Input n followed by n integers. A leader is strictly greater than every value to its right; the final value is always a leader. Output leaders in original order.",
    "1 <= n <= 1000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s),
        r: number[] = [];
      let max = -Infinity;
      for (let i = a.length - 1; i >= 0; i--)
        if (a[i] > max) {
          max = a[i];
          r.push(a[i]);
        }
      return list(r.reverse());
    },
    ["6\n16 17 4 3 5 2", "4\n1 2 3 4", "1\n7", "3\n5 5 5", "4\n-1 -2 -3 -4"],
  ),
  // Strings: 51–70.
  d(
    "vowel-count",
    "Count English vowels",
    "Strings",
    "Input one line of English letters and spaces. Count the letters a, e, i, o, u, ignoring case, and output the count.",
    "The line has length 0 to 1000; y is not a vowel.",
    (s) => (lines(s)[0].match(/[aeiou]/gi) || []).length,
    ["Hello World", "AEIOU xyz", "", "rhythm", "Education"],
  ),
  d(
    "normalize-spaces",
    "Normalize spaces",
    "Strings",
    "Input one line containing words separated by ASCII spaces. Remove leading/trailing spaces and reduce each interior run of spaces to one. Output EMPTY if the line contains no words.",
    "Line length is 0 to 1000; words contain English letters.",
    (s) => lines(s)[0].trim().split(/ +/).filter(Boolean).join(" ") || "EMPTY",
    ["  coding   is fun  ", "hello", "", "    ", " a  b   c "],
  ),
  d(
    "reverse-word-order",
    "Reverse word order",
    "Strings",
    "Input one line of words separated by spaces. Output the words in reverse order, separated by one space. Output EMPTY if there are no words.",
    "Line length is 0 to 1000; words contain English letters.",
    (s) =>
      lines(s)[0].trim().split(/ +/).filter(Boolean).reverse().join(" ") ||
      "EMPTY",
    ["one two three", "hello world", "", "  alpha   beta  ", "single"],
  ),
  d(
    "phrase-palindrome",
    "Palindrome after filtering",
    "Strings",
    "Input one line of ASCII letters, digits and punctuation. Ignore non-alphanumeric characters and letter case. Output YES if the remaining sequence is a palindrome. An empty sequence is a palindrome.",
    "Line length is 0 to 1000.",
    (s) => {
      const t = lines(s)[0]
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
      return yn(t === [...t].reverse().join(""));
    },
    ["A man, a plan, a canal: Panama!", "hello", "", "!!!", "0P"],
  ),
  d(
    "anagram",
    "Lowercase anagrams",
    "Strings",
    "Input two lines, each containing only lowercase English letters. Output YES if their character frequencies are identical; otherwise NO. Empty strings are allowed.",
    "Each line has length 0 to 1000.",
    (s) => {
      const [a = "", b = ""] = lines(s);
      return yn([...a].sort().join("") === [...b].sort().join(""));
    },
    ["listen\nsilent", "apple\npapelx", "\n", "a\na", "aab\nabb"],
  ),
  d(
    "first-unique-character",
    "First non-repeating character",
    "Hashing",
    "Input a lowercase string. Output the zero-based index of its first character that occurs exactly once, or -1 if none exists.",
    "String length is 0 to 1000.",
    (s) => {
      const t = lines(s)[0];
      for (let i = 0; i < t.length; i++)
        if (t.indexOf(t[i]) === t.lastIndexOf(t[i])) return i;
      return -1;
    },
    ["swiss", "aabb", "", "a", "abac"],
  ),
  d(
    "run-length-encode",
    "Encode character runs",
    "Strings",
    "Input a nonempty string of lowercase letters. Replace each maximal run by its letter followed by its decimal length. Output the resulting encoding.",
    "String length is 1 to 1000; run lengths may have multiple digits.",
    (s) => lines(s)[0].replace(/(.)\1*/g, (run) => run[0] + run.length),
    ["aaabbc", "abcd", "a", "zzzzzzzzzzzz", "aabbaa"],
  ),
  d(
    "run-length-decode",
    "Decode character runs",
    "Strings",
    "Input an encoding made of lowercase letters each followed by a positive decimal count. Output the expanded string. The encoding is valid.",
    "1 to 100 runs; total expanded length is at most 1000; counts have no leading zeroes.",
    (s) =>
      Array.from(s.trim().matchAll(/([a-z])(\d+)/g), (m) =>
        m[1].repeat(Number(m[2])),
      ).join(""),
    ["a3b2c1", "x1y4", "z1", "a10", "a2b2a2"],
  ),
  d(
    "cancel-neighbors",
    "Repeated adjacent-pair cancellation",
    "Stacks",
    "Input a lowercase string. Repeatedly delete adjacent equal character pairs until none remain. Output the final string, or EMPTY if all characters are removed.",
    "String length is 0 to 1000; process pairs using a left-to-right stack.",
    (s) => {
      const st: string[] = [];
      for (const c of lines(s)[0]) st.at(-1) === c ? st.pop() : st.push(c);
      return st.join("") || "EMPTY";
    },
    ["abbaca", "azxxzy", "", "aaaa", "abc"],
  ),
  d(
    "balanced-parentheses",
    "Balanced parentheses",
    "Stacks",
    "Input a string containing only ( and ). Output YES if every closing bracket matches an earlier unmatched opening bracket and all openings are closed, otherwise NO.",
    "String length is 0 to 1000.",
    (s) => {
      let n = 0;
      for (const c of lines(s)[0]) {
        n += c === "(" ? 1 : -1;
        if (n < 0) return "NO";
      }
      return yn(n === 0);
    },
    ["(()())", "())(", "", "(", "()()"],
  ),
  d(
    "caesar",
    "Caesar shift",
    "Strings",
    "Input k on the first line and a lowercase string on the second. Shift each letter forward k positions, wrapping z to a. Output the shifted string, or EMPTY for an empty string.",
    "0 <= k <= 1000000; string length 0 to 1000.",
    (s) => {
      const [k, t = ""] = lines(s);
      return (
        [...t]
          .map((c) =>
            String.fromCharCode(97 + ((c.charCodeAt(0) - 97 + Number(k)) % 26)),
          )
          .join("") || "EMPTY"
      );
    },
    ["3\nxyzabc", "26\nhello", "0\na", "5\n", "27\nz"],
  ),
  d(
    "longest-word",
    "First longest word",
    "Strings",
    "Input one line containing nonempty words separated by spaces. Output the longest word. If tied, choose the first word in the input.",
    "Line length 1 to 1000; at least one word; words contain English letters.",
    (s) =>
      lines(s)[0]
        .trim()
        .split(/ +/)
        .reduce((best, w) => (w.length > best.length ? w : best), ""),
    [
      "red green blue",
      "one two six",
      "x",
      "alpha beta gamma",
      "  aa   bbbb  cccc ",
    ],
  ),
  d(
    "title-case",
    "Capitalize word initials",
    "Strings",
    "Input one line of words made of English letters, separated by spaces. Output them with uppercase initials and lowercase remaining letters, using one separating space. Output EMPTY for no words.",
    "Line length 0 to 1000.",
    (s) =>
      lines(s)[0]
        .trim()
        .split(/ +/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(" ") || "EMPTY",
    ["hELLo wORLD", "java SCRIPT", "", "a", "  MIXED   case  "],
  ),
  d(
    "letter-histogram",
    "Alphabet histogram",
    "Hashing",
    "Input a lowercase string. Output 26 space-separated frequencies, in a through z order.",
    "String length 0 to 1000.",
    (s) => {
      const counts = Array(26).fill(0);
      for (const c of lines(s)[0]) counts[c.charCodeAt(0) - 97]++;
      return counts.join(" ");
    },
    ["banana", "xyz", "", "a", "abcdefghijklmnopqrstuvwxyz"],
  ),
  d(
    "substring-count",
    "Count overlapping occurrences",
    "Strings",
    "Input text on the first line and a nonempty pattern on the second. Output the number of starting positions where the pattern occurs. Overlapping occurrences count.",
    "Text length 0 to 1000; pattern length 1 to 100; both contain lowercase letters.",
    (s) => {
      const [t = "", p] = lines(s);
      let n = 0;
      for (let i = 0; i + p.length <= t.length; i++)
        if (t.slice(i, i + p.length) === p) n++;
      return n;
    },
    ["aaaa\naa", "banana\nana", "\na", "abc\nabcdef", "ababab\nab"],
  ),
  d(
    "common-prefix",
    "Longest common prefix",
    "Strings",
    "Input n followed by n lines of lowercase strings. Output their longest common prefix, or EMPTY if there is none.",
    "1 <= n <= 100; each string length 0 to 100.",
    (s) => {
      const a = lines(s),
        n = Number(a[0]),
        v = a.slice(1, n + 1);
      let p = v[0] || "";
      for (const t of v) while (!t.startsWith(p)) p = p.slice(0, -1);
      return p || "EMPTY";
    },
    [
      "3\nflower\nflow\nflight",
      "2\ndog\ncat",
      "1\nhello",
      "2\n\nabc",
      "3\na\na\na",
    ],
  ),
  d(
    "identifier",
    "ASCII identifier validation",
    "Strings",
    "Input one line. Output YES if its first character is an English letter or underscore, and every later character is an English letter, digit or underscore. Otherwise output NO. An empty string is invalid.",
    "Line length 0 to 1000; ASCII characters only.",
    (s) => yn(/^[A-Za-z_][A-Za-z0-9_]*$/.test(lines(s)[0])),
    ["user_name2", "2users", "", "_", "bad-name"],
  ),
  d(
    "swap-case",
    "Swap English letter case",
    "Strings",
    "Input one line of ASCII text. Replace uppercase English letters with lowercase and lowercase with uppercase; preserve all other characters. Output EMPTY for an empty line.",
    "Line length 0 to 1000.",
    (s) =>
      lines(s)[0].replace(/[A-Za-z]/g, (c) =>
        c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase(),
      ) || "EMPTY",
    ["Hello 123!", "JAVA script", "", "aZ", "!? 42"],
  ),
  d(
    "camel-to-snake",
    "Camel case to snake case",
    "Strings",
    "Input a nonempty camelCase identifier containing English letters and digits and beginning with a lowercase letter. Insert an underscore before each uppercase letter, then lowercase it. Output the converted identifier.",
    "Length 1 to 100; existing underscores do not occur; consecutive uppercase letters are converted separately.",
    (s) => s.trim().replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
    ["userName", "parseHTML", "x", "item2Count", "already"],
  ),
  d(
    "hamming",
    "Hamming distance",
    "Strings",
    "Input two equal-length binary strings on separate lines. Output the number of positions whose bits differ.",
    "Each string has length 0 to 1000.",
    (s) => {
      const [a = "", b = ""] = lines(s);
      return [...a].filter((c, i) => c !== b[i]).length;
    },
    ["10101\n11100", "000\n000", "\n", "0\n1", "1111\n0000"],
  ),
  // Matrices: 71–80.
  d(
    "row-totals",
    "Matrix row totals",
    "Matrices",
    "Input rows r and columns c, followed by r*c integers in row-major order. Output one row sum per line.",
    "1 <= r,c <= 30; values between -1000 and 1000.",
    (s) =>
      matrix(s)
        .map((r) => r.reduce((a, b) => a + b, 0))
        .join("\n"),
    [
      "2 3\n1 2 3\n4 5 6",
      "3 1\n-2\n0\n7",
      "1 1\n5",
      "1 3\n-1 -2 -3",
      "2 2\n0 0\n0 0",
    ],
  ),
  d(
    "transpose",
    "Matrix transpose",
    "Matrices",
    "Input r and c followed by r*c integers in row-major order. Output the c-by-r transpose, one row per line and values separated by spaces.",
    "1 <= r,c <= 30; values between -1000 and 1000.",
    (s) => {
      const a = matrix(s);
      return rows(a[0].map((_, j) => a.map((r) => r[j])));
    },
    [
      "2 3\n1 2 3\n4 5 6",
      "1 3\n7 8 9",
      "1 1\n-1",
      "3 1\n1\n2\n3",
      "2 2\n0 1\n1 0",
    ],
  ),
  d(
    "diagonal-difference",
    "Diagonal difference",
    "Matrices",
    "Input n followed by an n-by-n integer matrix. Output the absolute difference between the main-diagonal sum and anti-diagonal sum.",
    "1 <= n <= 30; values between -1000 and 1000.",
    (s) => {
      const a = square(s);
      return Math.abs(a.reduce((v, r, i) => v + r[i] - r[a.length - 1 - i], 0));
    },
    [
      "3\n11 2 4\n4 5 6\n10 8 -12",
      "2\n1 2\n3 4",
      "1\n99",
      "2\n0 0\n0 0",
      "3\n1 0 0\n0 1 0\n0 0 1",
    ],
  ),
  d(
    "identity-matrix",
    "Identity matrix check",
    "Matrices",
    "Input n followed by an n-by-n matrix. Output YES exactly when all main-diagonal entries are 1 and every other entry is 0.",
    "1 <= n <= 30; entries are integers from -10 to 10.",
    (s) => {
      const a = square(s);
      return yn(a.every((r, i) => r.every((x, j) => x === (i === j ? 1 : 0))));
    },
    ["2\n1 0\n0 1", "2\n1 1\n0 1", "1\n1", "1\n0", "3\n1 0 0\n0 1 0\n0 0 1"],
  ),
  d(
    "boundary-total",
    "Matrix boundary sum",
    "Matrices",
    "Input r and c followed by an r-by-c matrix. Output the sum of entries in the first/last row or first/last column. Count every boundary cell only once.",
    "1 <= r,c <= 30; entries between -1000 and 1000.",
    (s) => {
      const a = matrix(s);
      return a.reduce(
        (v, r, i) =>
          v +
          r.reduce(
            (w, x, j) =>
              w +
              (i === 0 || i === a.length - 1 || j === 0 || j === r.length - 1
                ? x
                : 0),
            0,
          ),
        0,
      );
    },
    [
      "3 3\n1 2 3\n4 5 6\n7 8 9",
      "1 3\n1 2 3",
      "1 1\n7",
      "3 1\n1\n2\n3",
      "2 2\n-1 -2\n-3 -4",
    ],
  ),
  d(
    "matrix-search",
    "First matching matrix cell",
    "Matrices",
    "Input r and c, then an r-by-c matrix, then target x. Output the zero-based row and column of the first match in row-major order. Output -1 if absent.",
    "1 <= r,c <= 30; entries and target between -1000 and 1000.",
    (s) => {
      const a = nums(s),
        r = a[0],
        c = a[1],
        x = a[2 + r * c];
      for (let i = 0; i < r * c; i++)
        if (a[2 + i] === x) return `${Math.floor(i / c)} ${i % c}`;
      return -1;
    },
    [
      "2 3\n1 2 3\n4 5 6\n5",
      "2 2\n1 2\n3 4\n9",
      "1 1\n0\n0",
      "2 2\n7 7\n7 7\n7",
      "1 3\n-1 -2 -3\n-3",
    ],
  ),
  d(
    "matrix-addition",
    "Add two matrices",
    "Matrices",
    "Input r and c, followed by all entries of matrix A and then all entries of matrix B, each in row-major order. Output A+B as r rows of c integers.",
    "1 <= r,c <= 30; entries between -1000 and 1000.",
    (s) => {
      const a = nums(s),
        r = a[0],
        c = a[1],
        n = r * c;
      return rows(
        Array.from({ length: r }, (_, i) =>
          Array.from(
            { length: c },
            (_, j) => a[2 + i * c + j] + a[2 + n + i * c + j],
          ),
        ),
      );
    },
    [
      "2 2\n1 2\n3 4\n5 6\n7 8",
      "1 3\n1 -2 3\n-1 2 -3",
      "1 1\n0\n0",
      "2 1\n1\n2\n3\n4",
      "1 2\n1000 -1000\n1000 -1000",
    ],
  ),
  d(
    "symmetric-matrix",
    "Symmetric matrix",
    "Matrices",
    "Input n followed by an n-by-n matrix. Output YES if each entry at (i,j) equals the entry at (j,i), otherwise NO.",
    "1 <= n <= 30; entries between -1000 and 1000.",
    (s) => {
      const a = square(s);
      return yn(a.every((r, i) => r.every((x, j) => x === a[j][i])));
    },
    [
      "3\n1 2 3\n2 5 6\n3 6 9",
      "2\n1 2\n3 4",
      "1\n-5",
      "2\n0 0\n0 0",
      "2\n1 -2\n-2 3",
    ],
  ),
  d(
    "rotate-matrix",
    "Rotate square matrix clockwise",
    "Matrices",
    "Input n followed by an n-by-n matrix. Output the matrix after a 90-degree clockwise rotation, one row per line.",
    "1 <= n <= 30; entries between -1000 and 1000.",
    (s) => {
      const a = square(s),
        n = a.length;
      return rows(
        Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => a[n - 1 - j][i]),
        ),
      );
    },
    [
      "2\n1 2\n3 4",
      "3\n1 2 3\n4 5 6\n7 8 9",
      "1\n7",
      "2\n0 1\n1 0",
      "2\n-1 -2\n-3 -4",
    ],
  ),
  d(
    "tic-tac-toe",
    "Tic-tac-toe result",
    "Simulation",
    "Input three lines of three characters each: X, O, or . for an empty cell. Output X or O if that player has a complete row, column or diagonal; otherwise output DRAW if full, or PENDING if an empty cell remains. At most one player has won.",
    "Exactly 3 rows of length 3; at most one winner is guaranteed; move-order validity need not be checked.",
    (s) => {
      const a = lines(s).slice(0, 3),
        all = [
          ...a,
          ...[0, 1, 2].map((j) => a.map((r) => r[j]).join("")),
          a.map((r, i) => r[i]).join(""),
          a.map((r, i) => r[2 - i]).join(""),
        ];
      for (const p of ["X", "O"]) if (all.includes(p.repeat(3))) return p;
      return a.some((r) => r.includes(".")) ? "PENDING" : "DRAW";
    },
    [
      "XXX\nOO.\n...",
      "XOX\nOXO\nOXO",
      "...\n...\n...",
      "OOO\nXX.\nX..",
      "X..\n.X.\n..X",
    ],
  ),
  // Search, simulation and introductory greedy algorithms: 81–100.
  d(
    "linear-search",
    "First occurrence",
    "Searching",
    "Input n followed by n integers, then target x. Output the zero-based index of the first occurrence of x, or -1 if absent.",
    "0 <= n <= 1000; values and target between -1000000 and 1000000.",
    (s) => {
      const a = nums(s),
        n = a[0];
      return a.slice(1, n + 1).indexOf(a[n + 1]);
    },
    ["5\n4 2 7 2 9\n2", "3\n1 2 3\n8", "0\n5", "1\n0\n0", "3\n-1 -2 -3\n-3"],
  ),
  d(
    "binary-search",
    "Find a value in sorted input",
    "Binary search",
    "Input n followed by n strictly increasing integers, then target x. Output its zero-based index if present, otherwise -1. Use binary search.",
    "0 <= n <= 100000; values and target between -1000000000 and 1000000000.",
    (s) => {
      const a = nums(s),
        n = a[0],
        x = a[n + 1];
      let l = 0,
        r = n - 1;
      while (l <= r) {
        const m = Math.floor((l + r) / 2);
        if (a[m + 1] === x) return m;
        if (a[m + 1] < x) l = m + 1;
        else r = m - 1;
      }
      return -1;
    },
    ["5\n1 3 5 7 9\n7", "4\n2 4 6 8\n5", "0\n1", "1\n-2\n-2", "3\n-5 0 10\n10"],
  ),
  d(
    "insertion-position",
    "Sorted insertion position",
    "Binary search",
    "Input n followed by n nondecreasing integers, then value x. Output the smallest zero-based index where x can be inserted while preserving sorted order, before any existing equal values.",
    "0 <= n <= 100000; values and x between -1000000000 and 1000000000.",
    (s) => {
      const a = nums(s),
        n = a[0],
        x = a[n + 1];
      let l = 0,
        r = n;
      while (l < r) {
        const m = Math.floor((l + r) / 2);
        if (a[m + 1] < x) l = m + 1;
        else r = m;
      }
      return l;
    },
    ["4\n1 3 5 6\n5", "4\n1 3 5 6\n2", "0\n9", "3\n2 2 2\n2", "3\n1 2 3\n9"],
  ),
  d(
    "two-sum",
    "First pair reaching a target",
    "Hashing",
    "Input n and target t, followed by n integers. Find distinct indices i<j with a[i]+a[j]=t. Choose the smallest j, then the smallest i for that j. Output i and j, or NONE.",
    "0 <= n <= 10000; values and target between -1000000 and 1000000.",
    (s) => {
      const a = nums(s),
        n = a[0],
        t = a[1],
        seen = new Map<number, number>();
      for (let j = 0; j < n; j++) {
        const x = a[j + 2];
        if (seen.has(t - x)) return `${seen.get(t - x)} ${j}`;
        if (!seen.has(x)) seen.set(x, j);
      }
      return "NONE";
    },
    ["4 9\n2 7 11 15", "4 6\n3 3 2 4", "0 5", "1 6\n3", "4 0\n-1 2 1 -2"],
  ),
  d(
    "stock-profit",
    "One stock transaction",
    "Greedy",
    "Input n followed by daily nonnegative stock prices. Buy once and sell on a later day, or do nothing. Output the maximum profit; output 0 if no profitable trade exists.",
    "1 <= n <= 100000; 0 <= each price <= 1000000.",
    (s) => {
      let min = Infinity,
        best = 0;
      for (const x of vector(s)) {
        best = Math.max(best, x - min);
        min = Math.min(min, x);
      }
      return best;
    },
    ["6\n7 1 5 3 6 4", "5\n7 6 4 3 1", "1\n10", "4\n1 2 3 4", "3\n0 0 0"],
  ),
  d(
    "consecutive-ones",
    "Longest streak of ones",
    "Arrays",
    "Input n followed by n values, each 0 or 1. Output the longest contiguous run of ones.",
    "0 <= n <= 100000.",
    (s) => {
      let cur = 0,
        best = 0;
      for (const x of vector(s)) {
        cur = x ? cur + 1 : 0;
        best = Math.max(best, cur);
      }
      return best;
    },
    ["8\n1 1 0 1 1 1 0 1", "4\n0 0 0 0", "0", "1\n1", "5\n1 1 1 1 1"],
  ),
  d(
    "longest-run",
    "Longest equal-character run",
    "Strings",
    "Input a lowercase string. Output the length of its longest run of identical consecutive characters. Output 0 for an empty string.",
    "String length 0 to 100000.",
    (s) => {
      let last = "",
        cur = 0,
        best = 0;
      for (const c of lines(s)[0]) {
        cur = c === last ? cur + 1 : 1;
        last = c;
        best = Math.max(best, cur);
      }
      return best;
    },
    ["abbcccdd", "abcdef", "", "a", "zzzzzz"],
  ),
  d(
    "robot-origin",
    "Robot returns to origin",
    "Simulation",
    "Input a string of moves U,D,L,R. A robot starts at (0,0), and each move changes one coordinate by one. Output YES if it returns to (0,0), otherwise NO.",
    "Move string length 0 to 100000.",
    (s) => {
      let x = 0,
        y = 0;
      for (const c of lines(s)[0]) {
        if (c === "U") y++;
        if (c === "D") y--;
        if (c === "L") x--;
        if (c === "R") x++;
      }
      return yn(x === 0 && y === 0);
    },
    ["UDLR", "UUR", "", "LLLLRRRR", "UDUD"],
  ),
  d(
    "date-validity",
    "Validate a calendar date",
    "Conditionals",
    "Input day d, month m and year y. Output YES if they describe a valid date in the Gregorian calendar, otherwise NO.",
    "0 <= d <= 32; 0 <= m <= 13; 1 <= y <= 9999.",
    (s) => {
      const [d, m, y] = nums(s),
        days = [
          31,
          y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0) ? 29 : 28,
          31,
          30,
          31,
          30,
          31,
          31,
          30,
          31,
          30,
          31,
        ];
      return yn(m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]);
    },
    ["29 2 2024", "29 2 1900", "1 1 1", "31 4 2026", "0 12 2026"],
  ),
  d(
    "interval-intersection",
    "Length of interval intersection",
    "Intervals",
    "Input a b c d for closed real-line intervals [a,b] and [c,d], with integer endpoints. Output the length of their intersection; touching at one point has length 0.",
    "-1000000 <= a <= b <= 1000000; -1000000 <= c <= d <= 1000000.",
    (s) => {
      const [a, b, c, d] = nums(s);
      return Math.max(0, Math.min(b, d) - Math.max(a, c));
    },
    ["1 7 4 9", "1 2 3 4", "0 0 0 0", "-5 5 -2 2", "1 3 3 5"],
  ),
  d(
    "meeting-attendance",
    "Can every meeting be attended?",
    "Sorting",
    "Input n followed by n start/end pairs. Meetings occupy [start,end), so a meeting ending when another starts does not conflict. Output YES if no two meetings overlap, otherwise NO.",
    "0 <= n <= 1000; 0 <= start < end <= 1000000.",
    (s) => {
      const a = nums(s),
        v = Array.from({ length: a[0] }, (_, i) => [
          a[1 + 2 * i],
          a[2 + 2 * i],
        ]).sort((x, y) => x[0] - y[0]);
      return yn(v.every((x, i) => i === 0 || v[i - 1][1] <= x[0]));
    },
    ["3\n1 3\n3 5\n7 9", "2\n1 4\n2 3", "0", "1\n0 1", "2\n5 8\n1 5"],
  ),
  d(
    "queue-commands",
    "Queue command interpreter",
    "Queues",
    "Input q, followed by q lines. PUSH x adds integer x to the back. POP removes and prints the front value, or prints EMPTY if empty. FRONT prints the front without removing it, or EMPTY. Output one line for each POP or FRONT; if there are none output NONE.",
    "1 <= q <= 1000; -1000000 <= x <= 1000000; commands are validly formatted.",
    (s) => {
      const a = lines(s),
        q = Number(a[0]),
        queue: number[] = [],
        out: (number | string)[] = [];
      for (const line of a.slice(1, q + 1)) {
        const [c, x] = line.split(" ");
        if (c === "PUSH") queue.push(Number(x));
        else
          out.push(
            queue.length ? (c === "POP" ? queue.shift()! : queue[0]) : "EMPTY",
          );
      }
      return out.join("\n") || "NONE";
    },
    [
      "5\nPUSH 4\nPUSH 7\nFRONT\nPOP\nFRONT",
      "2\nPOP\nFRONT",
      "1\nPUSH 0",
      "3\nPUSH -2\nPOP\nPOP",
      "3\nPUSH 1\nPUSH 2\nPOP",
    ],
  ),
  d(
    "stack-commands",
    "Stack command interpreter",
    "Stacks",
    "Input q, followed by q commands. PUSH x adds x on top. POP removes and prints the top, or EMPTY if empty. TOP prints the top without removing it, or EMPTY. Output one line per POP or TOP; if there are none output NONE.",
    "1 <= q <= 1000; -1000000 <= x <= 1000000.",
    (s) => {
      const a = lines(s),
        q = Number(a[0]),
        st: number[] = [],
        out: (number | string)[] = [];
      for (const line of a.slice(1, q + 1)) {
        const [c, x] = line.split(" ");
        if (c === "PUSH") st.push(Number(x));
        else
          out.push(
            st.length ? (c === "POP" ? st.pop()! : st.at(-1)!) : "EMPTY",
          );
      }
      return out.join("\n") || "NONE";
    },
    [
      "5\nPUSH 4\nPUSH 7\nTOP\nPOP\nTOP",
      "2\nPOP\nTOP",
      "1\nPUSH 0",
      "3\nPUSH -2\nPOP\nPOP",
      "3\nPUSH 1\nPUSH 2\nPOP",
    ],
  ),
  d(
    "roman-value",
    "Read a Roman numeral",
    "Strings",
    "Input a valid uppercase Roman numeral using I,V,X,L,C,D,M. Convert it to a decimal integer. A smaller symbol immediately before a larger one is subtracted.",
    "Input is a canonical Roman numeral representing 1 to 3999.",
    (s) => {
      const v: Record<string, number> = {
          I: 1,
          V: 5,
          X: 10,
          L: 50,
          C: 100,
          D: 500,
          M: 1000,
        },
        t = s.trim();
      return [...t].reduce(
        (sum, c, i) => sum + (v[c] < (v[t[i + 1]] || 0) ? -v[c] : v[c]),
        0,
      );
    },
    ["MCMXCIV", "XLII", "I", "IV", "MMMCMXCIX"],
  ),
  d(
    "parenthesis-depth",
    "Maximum nesting depth",
    "Stacks",
    "Input a balanced string of parentheses. Output its maximum nesting depth. Empty input has depth 0.",
    "Length 0 to 10000; the string is guaranteed balanced.",
    (s) => {
      let cur = 0,
        best = 0;
      for (const c of lines(s)[0]) {
        cur += c === "(" ? 1 : -1;
        best = Math.max(best, cur);
      }
      return best;
    },
    ["(()(()))", "()()", "", "()", "(((())))"],
  ),
  d(
    "compare-versions",
    "Compare dotted versions",
    "Parsing",
    "Input two version strings on separate lines. Each is a sequence of nonnegative integers separated by dots. Compare components numerically, treating missing trailing components as zero. Output -1, 0 or 1 if the first version is smaller, equal or larger.",
    "1 to 20 components per version; each component from 0 to 1000000; leading zeroes allowed.",
    (s) => {
      const [x, y] = lines(s),
        a = x.split(".").map(Number),
        b = y.split(".").map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i++)
        if ((a[i] || 0) !== (b[i] || 0))
          return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
      return 0;
    },
    ["1.2\n1.10", "2.0\n2", "0\n0.0.0", "01.002\n1.2", "3.0.1\n3"],
  ),
  d(
    "password-categories",
    "Password character categories",
    "Strings",
    "Input a nonempty ASCII password with no whitespace. Output four space-separated 0/1 flags indicating whether it contains a lowercase letter, uppercase letter, decimal digit, and a non-alphanumeric character, in that order. This is a character-class exercise, not a security assessment.",
    "Length 1 to 1000; printable ASCII except spaces.",
    (s) => {
      const t = s.trim();
      return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
        .map((r) => Number(r.test(t)))
        .join(" ");
    },
    ["Hello123!", "abcdef", "123", "!@#", "ABCxyz"],
  ),
  d(
    "closest-temperature",
    "Temperature nearest zero",
    "Arrays",
    "Input n followed by n integer temperatures. Output the temperature with smallest absolute value. If equally close positive and negative values exist, prefer the positive one.",
    "1 <= n <= 1000; -1000000 <= temperature <= 1000000.",
    (s) => vector(s).sort((a, b) => Math.abs(a) - Math.abs(b) || b - a)[0],
    ["5\n-5 -2 2 7 3", "3\n-7 -4 -1", "1\n0", "2\n-8 8", "4\n9 6 3 1"],
  ),
  d(
    "lemonade-change",
    "Make change at a stand",
    "Greedy",
    "Input n followed by n customer bills, each 5, 10 or 20. An item costs 5. Starting with no cash, serve customers in order and give exact change. Output YES if all customers can be served, otherwise NO.",
    "0 <= n <= 10000; bills are only 5, 10 or 20.",
    (s) => {
      let five = 0,
        ten = 0;
      for (const x of vector(s)) {
        if (x === 5) five++;
        else if (x === 10) {
          five--;
          ten++;
        } else if (ten > 0) {
          ten--;
          five--;
        } else five -= 3;
        if (five < 0) return "NO";
      }
      return "YES";
    },
    ["5\n5 5 5 10 20", "5\n5 5 10 10 20", "0", "1\n10", "3\n5 10 5"],
  ),
  d(
    "mountain-peak",
    "Strict mountain array",
    "Arrays",
    "Input n followed by n integers. Output YES if the sequence first strictly increases and then strictly decreases, with at least one step in each direction. Otherwise output NO.",
    "0 <= n <= 10000; values between -1000000 and 1000000.",
    (s) => {
      const a = vector(s);
      let i = 0;
      while (i + 1 < a.length && a[i] < a[i + 1]) i++;
      if (i === 0 || i === a.length - 1) return "NO";
      while (i + 1 < a.length && a[i] > a[i + 1]) i++;
      return yn(i === a.length - 1);
    },
    ["5\n1 3 5 4 2", "3\n1 2 3", "0", "3\n1 2 1", "4\n1 2 2 1"],
  ),
];
