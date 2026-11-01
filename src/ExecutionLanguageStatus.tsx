import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { ErrorBox } from "./ui";

export function useExecutionLanguages(enabled: boolean) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setLoading(true);
    setError("");
    try {
      const rows = await api<{ key: string }[]>("/languages", {
        signal: request.signal,
      });
      if (!request.signal.aborted) setLanguages(rows.map((row) => row.key));
    } catch (e) {
      if (!request.signal.aborted) {
        setLanguages([]);
        setError((e as Error).message);
      }
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (enabled) void reload();
    else {
      setLanguages([]);
      setError("");
      setLoading(false);
    }
    return () => pending.current?.abort();
  }, [enabled, reload]);
  return { languages, loading, error, reload };
}

export function ExecutionLanguageStatus({
  state,
  language,
  disabled = false,
}: {
  state: ReturnType<typeof useExecutionLanguages>;
  language: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <ErrorBox message={state.error} />
      <p role="status">
        {state.loading
          ? "Checking available programming languages…"
          : state.error
            ? "The runner check failed. Your draft is unchanged. Retry the check to enable Run and Submit."
            : !state.languages.includes(language)
              ? "The connected runner has not confirmed this language. Choose another language or check again. Your draft can still be saved."
              : "Runner ready for the selected language."}
      </p>
      <button
        type="button"
        className="btn secondary"
        disabled={state.loading || disabled}
        onClick={() => void state.reload()}
      >
        {state.loading
          ? "Checking code runner…"
          : state.error
            ? "Retry code runner"
            : "Refresh available languages"}
      </button>
    </div>
  );
}

const inputExamples: Record<string, string> = {
  python:
    "import sys\n\nvalues = list(map(int, sys.stdin.read().split()))\nprint(sum(values))",
  javascript:
    "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\nconst values = input ? input.split(/\\s+/).map(Number) : [];\nconsole.log(values.reduce((sum, value) => sum + value, 0));",
  java: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner input = new Scanner(System.in);\n        long sum = 0;\n        while (input.hasNextLong()) sum += input.nextLong();\n        System.out.println(sum);\n    }\n}",
  c: '#include <stdio.h>\n\nint main(void) {\n    long long value, sum = 0;\n    while (scanf("%lld", &value) == 1) sum += value;\n    printf("%lld\\n", sum);\n    return 0;\n}',
  cpp: "#include <iostream>\n\nint main() {\n    long long value, sum = 0;\n    while (std::cin >> value) sum += value;\n    std::cout << sum << '\\n';\n    return 0;\n}",
};

export function CodingProgramHelp({ language }: { language: string }) {
  return (
    <div>
      <p>
        Write a complete program that reads standard input and prints the
        requested output. A LeetCode-style function alone will not run here:
        call your solution from the program and print its result. Match the
        problem's input format and avoid extra prompts or debug output.
      </p>
      <details>
        <summary>How to read input and print output</summary>
        <p>
          This{" "}
          {language === "java"
            ? "Java"
            : language === "javascript"
              ? "JavaScript"
              : language === "cpp"
                ? "C++"
                : language === "c"
                  ? "C"
                  : "Python"}{" "}
          example reads space-separated numbers. Input <code>4 7</code>
          produces <code>11</code>. Adapt the input parsing and algorithm to the
          selected question; this is not its solution.
          {language === "java" && " Java must use a public class named Main."}
        </p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {inputExamples[language] || inputExamples.python}
        </pre>
      </details>
    </div>
  );
}
