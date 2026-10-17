import { config } from "../server/config.js";
import { executeCode } from "../server/providers.js";

export async function checkCodeExecution() {
  const samples = {
    python: 'print("HIRELENS_CODE_OK")',
    javascript: 'console.log("HIRELENS_CODE_OK");',
    java: 'public class Main { public static void main(String[] args) { System.out.println("HIRELENS_CODE_OK"); } }',
    c: '#include <stdio.h>\nint main(void) { puts("HIRELENS_CODE_OK"); return 0; }',
    cpp: '#include <iostream>\nint main() { std::cout << "HIRELENS_CODE_OK" << std::endl; return 0; }',
  };
  for (const [language, code] of Object.entries(samples)) {
    const result = await executeCode(
      language,
      code,
      [{ input: "", output: "HIRELENS_CODE_OK", hidden: false }],
      "diagnostic",
    );
    if (!result[0]?.passed || result[0].stdout?.trim() !== "HIRELENS_CODE_OK")
      throw new Error(
        `${language} execution failed (${result[0]?.status || "no result"}). Check the Judge0 worker and Linux cgroup configuration.`,
      );
    console.log(
      `Passed: actual ${language} compilation/execution and expected output`,
    );
  }
  const failures = [
    {
      name: "C compilation error",
      language: "c",
      code: "int main(void) { invalid c syntax }",
      status: [6],
    },
    {
      name: "C++ compilation error",
      language: "cpp",
      code: "int main() { invalid cpp syntax }",
      status: [6],
    },
    {
      name: "Java compilation error",
      language: "java",
      code: "public class Main { invalid java syntax }",
      status: [6],
    },
    {
      name: "Python runtime error",
      language: "python",
      code: 'raise RuntimeError("HIRELENS_EXPECTED_ERROR")',
      status: [7, 8, 9, 10, 11, 12],
    },
    {
      name: "Python time limit",
      language: "python",
      code: "while True: pass",
      status: [5],
    },
    {
      name: "Wrong-answer verdict",
      language: "javascript",
      code: 'console.log("WRONG_OUTPUT");',
      status: [4],
    },
  ];
  for (const sample of failures) {
    const [result] = await executeCode(
      sample.language,
      sample.code,
      [{ input: "", output: "HIRELENS_CODE_OK", hidden: false }],
      "diagnostic",
    );
    if (!result || result.passed || !sample.status.includes(result.statusId))
      throw new Error(
        `${sample.name}: unexpected result (${result?.status || "no result"}). Do not enable coding until the worker passes this check.`,
      );
    console.log(`Passed: ${sample.name}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/check-code.ts")) {
  try {
    if (!config.judgeUrl)
      throw new Error(
        "No execution service is connected. Run npm run code:local on a compatible Docker/Linux host, or set JUDGE0_URL and provider credentials in .env. See docs/CODE-EXECUTION.md.",
      );
    await checkCodeExecution();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Execution check failed.",
    );
    process.exitCode = 1;
  }
}
