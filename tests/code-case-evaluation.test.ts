import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../server/app";
import { config } from "../server/config";
import {
  connectDatabase,
  InterviewModel,
  SessionModel,
  SubmissionModel,
  UserModel,
} from "../server/models";
import { hashToken } from "../server/security";

const app = createApp();
const original = { ...config };
let database: MongoMemoryServer;
let candidate: Awaited<ReturnType<typeof actor>>,
  stranger: Awaited<ReturnType<typeof actor>>,
  hr: Awaited<ReturnType<typeof actor>>;

async function actor(role: "candidate" | "hr") {
  const user = await UserModel.create({
    role,
    name: "Case evaluation fixture",
    email: `${randomUUID()}@example.test`,
    passwordHash: "unused-fixture",
  });
  const token = randomBytes(32).toString("hex");
  await SessionModel.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const client = request.agent(app);
  client.jar.setCookie(`hirelens_session=${token}`);
  return { user, client };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create({ binary: { version: "7.0.24" } });
  await connectDatabase(database.getUri("code_case_evaluation_only"));
});
beforeEach(async () => {
  candidate = await actor("candidate");
  stranger = await actor("candidate");
  hr = await actor("hr");
  config.judgeUrl = "https://private-executor.example.test";
  config.judgeKey = "synthetic-private-key";
  config.judgeHeader = "X-Auth-Token";
});
afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

const languages = [
  { id: 71, name: "Python (3.12.0)" },
  { id: 63, name: "JavaScript (Node.js 20.0.0)" },
  { id: 62, name: "Java (OpenJDK 17.0.0)" },
  { id: 50, name: "C (GCC 12.2.0)" },
  { id: 54, name: "C++ (GCC 12.2.0)" },
];
const descriptions: Record<number, string> = {
  3: "Accepted",
  4: "Wrong Answer",
  5: "Time Limit Exceeded",
  6: "Compilation Error",
  11: "Runtime Error (NZEC)",
};
type Submitted = {
  language_id: number;
  stdin: string;
  expected_output?: string;
  source_code: string;
  enable_network: boolean;
};
function privateRunner(
  statuses: number[] = [],
  output?: (index: number, submission: Submitted) => string,
) {
  const submitted: Submitted[] = [];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      expect(String(url)).toMatch(
        /^https:\/\/private-executor\.example\.test\//,
      );
      expect(new Headers(options?.headers).get("X-Auth-Token")).toBe(
        "synthetic-private-key",
      );
      if (String(url).endsWith("/languages"))
        return new Response(JSON.stringify(languages));
      if (options?.method === "POST") {
        const payload = JSON.parse(String(options.body)) as Submitted;
        expect(payload.enable_network).toBe(false);
        submitted.push(payload);
        return new Response(
          JSON.stringify({ token: `submission-${submitted.length - 1}` }),
        );
      }
      const index = Number(
        new URL(String(url)).pathname
          .split("/")
          .at(-1)!
          .replace("submission-", ""),
      );
      const submission = submitted[index];
      const id = statuses[index] ?? 3;
      return new Response(
        JSON.stringify({
          status: { id, description: descriptions[id] || "Runtime Error" },
          stdout: Buffer.from(
            output?.(index, submission) ??
              (submission.expected_output
                ? Buffer.from(submission.expected_output, "base64").toString()
                : "custom output"),
          ).toString("base64"),
          stderr: Buffer.from(`diagnostic stderr ${index}`).toString("base64"),
          compile_output: Buffer.from(
            `diagnostic compiler output ${index}`,
          ).toString("base64"),
          time: "0.012",
          memory: 2048,
        }),
      );
    });
  return { submitted, spy };
}
async function session() {
  const created = await candidate.client
    .post("/api/practice/coding")
    .send({ problemId: "sum-pairs" });
  expect(created.status).toBe(201);
  return created.body._id as string;
}
const program = {
  language: "python",
  code: "a,b=map(int,input().split()); print(a+b)",
};
const decoded = (value: string | undefined) =>
  value === undefined
    ? undefined
    : Buffer.from(value, "base64").toString("utf8");

it("Run examples checks every public sample against its expected output and skips hidden cases", async () => {
  const fixture = privateRunner();
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({
      ...program,
      mode: "run",
      runMode: "examples",
      stdin: "client input ignored for examples",
    });
  expect(response.status).toBe(201);
  expect(response.body.runMode).toBe("examples");
  expect(response.body.total).toBe(2);
  expect(response.body.passed).toBe(2);
  expect(fixture.submitted.map((t) => decoded(t.stdin))).toEqual([
    "4 7",
    "-3 8",
  ]);
  expect(fixture.submitted.map((t) => decoded(t.expected_output))).toEqual([
    "11",
    "5",
  ]);
  expect(response.body.results[0]).toMatchObject({
    input: "4 7",
    expectedOutput: "11",
    stdout: "11",
    hidden: false,
    time: "0.012",
    memory: 2048,
  });
  expect(
    response.body.results.every((result: any) => result.hidden === false),
  ).toBe(true);
});

it("Run custom uses only supplied stdin without comparing it to a sample answer", async () => {
  const fixture = privateRunner();
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, mode: "run", runMode: "custom", stdin: "12 30" });
  expect(response.status).toBe(201);
  expect(response.body.runMode).toBe("custom");
  expect(response.body.total).toBe(1);
  expect(fixture.submitted).toHaveLength(1);
  expect(decoded(fixture.submitted[0].stdin)).toBe("12 30");
  expect(fixture.submitted[0]).not.toHaveProperty("expected_output");
  expect(response.body.results[0]).toMatchObject({
    input: "12 30",
    stdout: "custom output",
    hidden: false,
  });
  expect(response.body.results[0]).not.toHaveProperty("expectedOutput");
});

it("legacy Run requests remain custom-input runs", async () => {
  const fixture = privateRunner();
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, mode: "run", stdin: "1 9" });
  expect(response.status).toBe(201);
  expect(fixture.submitted).toHaveLength(1);
  expect(decoded(fixture.submitted[0].stdin)).toBe("1 9");
  expect(fixture.submitted[0]).not.toHaveProperty("expected_output");
});

it("Submit runs all four public and hidden cases even after wrong answers and runtime failures", async () => {
  const fixture = privateRunner([4, 3, 11, 5], (index) =>
    index === 0 ? "WRONG" : `private result ${index}`,
  );
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({
      ...program,
      mode: "submit",
      runMode: "examples",
      stdin: "bypass attempt",
      tests: [{ input: "bypass", output: "bypass", hidden: false }],
    });
  expect(response.status).toBe(201);
  expect(response.body.total).toBe(4);
  expect(response.body.passed).toBe(1);
  expect(fixture.submitted.map((t) => decoded(t.stdin))).toEqual([
    "4 7",
    "-3 8",
    "0 0",
    "-1000000 1000000",
  ]);
  expect(response.body.results.map((r: any) => r.statusId)).toEqual([
    4, 3, 11, 5,
  ]);
  expect(response.body.results[0]).toMatchObject({
    input: "4 7",
    expectedOutput: "11",
    stdout: "WRONG",
  });
  for (const result of response.body.results.filter((r: any) => r.hidden)) {
    for (const field of [
      "input",
      "expectedOutput",
      "stdout",
      "stderr",
      "compileOutput",
    ])
      expect(result).not.toHaveProperty(field);
    expect(result).toMatchObject({ time: "0.012", memory: 2048 });
  }
  const history = await candidate.client.get(
    `/api/interviews/${id}/submissions`,
  );
  expect(history.body[0].results[0].input).toBe("4 7");
  for (const result of history.body[0].results.filter((r: any) => r.hidden))
    expect(result).not.toHaveProperty("expectedOutput");
});

it("compilation errors remain failures and do not expose hidden compiler diagnostics", async () => {
  const fixture = privateRunner([6, 6, 6, 6]);
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, code: "invalid syntax", mode: "submit" });
  expect(response.status).toBe(201);
  expect(fixture.submitted).toHaveLength(4);
  expect(response.body.passed).toBe(0);
  expect(
    response.body.results.every(
      (r: any) => r.statusId === 6 && r.passed === false,
    ),
  ).toBe(true);
  expect(response.body.results[0].compileOutput).toBe(
    "diagnostic compiler output 0",
  );
  expect(response.body.results[2]).not.toHaveProperty("compileOutput");
});

it.each([
  ["python", 71],
  ["javascript", 63],
  ["java", 62],
  ["c", 50],
  ["cpp", 54],
] as const)(
  "%s example execution uses the connected compiler and both public cases",
  async (language, compiler) => {
    const fixture = privateRunner();
    const id = await session();
    const response = await candidate.client
      .post(`/api/interviews/${id}/code`)
      .send({ ...program, language, mode: "run", runMode: "examples" });
    expect(response.status).toBe(201);
    expect(fixture.submitted).toHaveLength(2);
    expect(fixture.submitted.every((t) => t.language_id === compiler)).toBe(
      true,
    );
  },
);

it("provider transport failure saves no partial or fabricated accepted submission", async () => {
  let created = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).endsWith("/languages"))
      return new Response(JSON.stringify(languages));
    if (options?.method === "POST") {
      created++;
      return new Response(JSON.stringify({ token: `case-${created}` }));
    }
    if (created === 1)
      return new Response(
        JSON.stringify({
          status: { id: 3, description: "Accepted" },
          stdout: Buffer.from("11").toString("base64"),
        }),
      );
    throw new Error("synthetic network interruption");
  });
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, mode: "submit" });
  expect(response.status).toBe(502);
  expect(created).toBe(2);
  expect(await SubmissionModel.countDocuments({ interviewId: id })).toBe(0);
});

it("runner infrastructure errors are not treated as candidate verdicts or saved", async () => {
  const fixture = privateRunner([13]);
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, mode: "submit" });
  expect(response.status).toBe(502);
  expect(fixture.submitted).toHaveLength(1);
  expect(await SubmissionModel.countDocuments({ interviewId: id })).toBe(0);
});

it("a queued case that exceeds its deadline returns a timeout without saving a partial score", async () => {
  const realNow = Date.now.bind(Date);
  let elapsed = 0;
  let polls = 0;
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + elapsed);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).endsWith("/languages"))
      return new Response(JSON.stringify(languages));
    if (options?.method === "POST")
      return new Response(JSON.stringify({ token: "queued-case" }));
    polls++;
    elapsed = 25000;
    return new Response(
      JSON.stringify({ status: { id: 1, description: "In Queue" } }),
    );
  });
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, mode: "submit" });
  expect(response.status).toBe(504);
  expect(polls).toBe(1);
  expect(await SubmissionModel.countDocuments({ interviewId: id })).toBe(0);
});

it("unavailable private service does not contact a public runner or invent results", async () => {
  config.judgeUrl = "";
  config.judgeKey = "";
  const fetch = vi.spyOn(globalThis, "fetch");
  const id = await session();
  const response = await candidate.client
    .post(`/api/interviews/${id}/code`)
    .send({ ...program, mode: "run", runMode: "examples" });
  expect(response.status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
  expect(await SubmissionModel.countDocuments({ interviewId: id })).toBe(0);
});

it("checks ownership and session state before sending code to any executor", async () => {
  const fixture = privateRunner();
  const id = await session();
  expect(
    (
      await stranger.client
        .post(`/api/interviews/${id}/code`)
        .send({ ...program, mode: "submit" })
    ).status,
  ).toBe(404);
  expect(
    (
      await hr.client
        .post(`/api/interviews/${id}/code`)
        .send({ ...program, mode: "submit" })
    ).status,
  ).toBe(403);
  await InterviewModel.updateOne(
    { _id: id },
    { $set: { status: "completed", endedAt: new Date() } },
  );
  expect(
    (
      await candidate.client
        .post(`/api/interviews/${id}/code`)
        .send({ ...program, mode: "run", runMode: "examples" })
    ).status,
  ).toBe(409);
  expect(fixture.spy).not.toHaveBeenCalled();
});
