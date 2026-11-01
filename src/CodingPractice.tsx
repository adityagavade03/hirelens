import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type {
  Interview,
  Problem,
  ServiceStatus,
  Submission,
} from "../shared/types";
import { codingLanguages, type CodingLanguage } from "../shared/languages";
import { send, useResource } from "./api";
import { ErrorBox, Field, Loading, Notice, PageTitle, Panel } from "./ui";
import { CodeExecutionNotice } from "./CodeExecutionNotice";
import {
  CodingProgramHelp,
  ExecutionLanguageStatus,
  useExecutionLanguages,
} from "./ExecutionLanguageStatus";
import {
  ExecutionResults,
  isCustomRun,
  submissionVerdict,
} from "./ExecutionResults";
import "./practice-bank.css";
const Editor = lazy(() => import("./CodingEditor"));
export default function CodingPractice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const record = useResource<Interview | null>(`/interviews/${id}`, null);
  const problem = useResource<Problem | null>(
    `/interviews/${id}/problem`,
    null,
  );
  const services = useResource<ServiceStatus | null>("/services", null);
  const submissions = useResource<Submission[]>(
    `/interviews/${id}/submissions`,
    [],
  );
  const [language, setLanguage] = useState<CodingLanguage>("python"),
    [code, setCode] = useState(""),
    [stdin, setStdin] = useState("");
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const [runningAction, setRunningAction] = useState("");
  const [result, setResult] = useState<Submission | null>(null);
  const drafts = useRef<Record<string, string>>({}),
    initialised = useRef<string | undefined>(undefined),
    saving = useRef(Promise.resolve());
  function persistDraft(source: string, lang: string) {
    saving.current = saving.current
      .catch(() => {})
      .then(() =>
        send(
          `/interviews/${id}/draft`,
          { language: lang, code: source },
          "PATCH",
        ).then(() => {}),
      );
    return saving.current;
  }
  const i = record.data,
    p = problem.data;
  const personalPractice =
    i?.type === "practice" && !i.companyId && !i.applicationId && !i.batchId;
  const publicDemoBlocked =
    !!services.data?.codePublicDemo && !personalPractice;
  const runner = useExecutionLanguages(
    !!services.data?.code && !publicDemoBlocked,
  );
  const available = runner.languages;
  useEffect(() => {
    if (!i || !p || initialised.current === i._id) return;
    drafts.current = { ...i.drafts };
    const lang = codingLanguages.some((l) => l.key === i.activeLanguage)
      ? (i.activeLanguage as CodingLanguage)
      : "python";
    setLanguage(lang);
    setCode(drafts.current[lang] ?? p.starter[lang] ?? "");
    setStdin(p.examples[0]?.input || "");
    initialised.current = i._id;
    setReady(true);
  }, [i, p]);
  useEffect(() => {
    if (!ready || !i || i.status !== "live" || i.type !== "practice") return;
    setSaved("Saving draft…");
    drafts.current[language] = code;
    let current = true;
    const timer = setTimeout(() => {
      void persistDraft(code, language)
        .then(() => {
          if (current) setSaved("Draft saved to your account");
        })
        .catch(() => {
          if (current)
            setSaved(
              "Could not save draft — check your connection and copy your code before leaving.",
            );
        });
    }, 600);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [ready, code, language, id, i?.status]);
  async function run(
    mode: "run" | "submit",
    runMode: "custom" | "examples" = "custom",
  ) {
    if (!services.data?.code || publicDemoBlocked || busy) return;
    setBusy(true);
    setRunningAction(
      mode === "submit"
        ? "Checking all public and hidden test cases…"
        : runMode === "examples"
          ? "Checking the visible examples…"
          : "Running your custom input…",
    );
    setError("");
    setResult(null);
    try {
      await persistDraft(code, language);
      const value = await send<Submission>(`/interviews/${id}/code`, {
        language,
        code,
        stdin,
        mode,
        ...(mode === "run" ? { runMode } : {}),
      });
      setResult(value);
      await submissions.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setRunningAction("");
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await persistDraft(code, language);
      await send(`/practice/coding/${id}/finish`);
      await record.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leavePractice() {
    setBusy(true);
    setError("");
    try {
      if (i?.status === "live") await persistDraft(code, language);
      navigate("/practice");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (record.loading || problem.loading) return <Loading />;
  if (!i || !p)
    return (
      <ErrorBox
        message={
          record.error || problem.error || "Practice session unavailable."
        }
      />
    );
  if (i.type !== "practice" || i.practiceMode !== "coding")
    return (
      <Notice>
        This page is for your coding practice sessions.{" "}
        <Link to="/practice">Open practice bank</Link>
      </Notice>
    );
  return (
    <>
      <PageTitle
        eyebrow="PERSONAL CODING PRACTICE"
        title={p.title}
        description={`${p.difficulty} · ${p.topic || "Warm-up"}`}
        action={
          <button
            className="btn secondary"
            disabled={busy || !ready}
            onClick={() => void leavePractice()}
          >
            Back to questions
          </button>
        }
      />
      <ErrorBox
        message={error || record.error || problem.error || services.error}
      />
      <CodeExecutionNotice
        publicDemo={services.data?.codePublicDemo}
        practice={personalPractice}
        available={services.data?.code}
      />
      {i.status === "live" ? (
        <div className="form-actions">
          <button
            className="btn secondary"
            disabled={busy || !ready}
            onClick={() => void finish()}
          >
            Finish coding practice
          </button>
        </div>
      ) : (
        <Notice>
          This practice session is complete. Your saved solution and execution
          history are available below.
        </Notice>
      )}
      {!services.data?.code && (
        <Notice>
          Run and Submit are unavailable until the private execution server is
          connected. You can read the problem, write code and save drafts.
        </Notice>
      )}
      <div className="coding-practice-layout">
        <Panel title="Problem statement">
          <div className="panel-form">
            <p className="question-statement">{p.description}</p>
            <h3>Constraints</h3>
            <p>{p.constraints}</p>
            {p.examples.map((example, n) => (
              <div key={n}>
                <h3>Example {n + 1}</h3>
                <p>Input</p>
                <pre>{example.input}</pre>
                <p>Expected output</p>
                <pre>{example.output}</pre>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Your solution"
          description="Write a complete program that reads standard input and prints the requested output."
        >
          <div className="panel-form">
            <CodingProgramHelp language={language} />
            <Field label="Programming language">
              <select
                value={language}
                disabled={busy}
                onChange={(e) => {
                  drafts.current[language] = code;
                  if (i.status === "live")
                    void persistDraft(code, language).catch(() =>
                      setSaved("Could not save draft — check your connection."),
                    );
                  const next = e.target.value as CodingLanguage;
                  setLanguage(next);
                  setCode(drafts.current[next] ?? p.starter[next] ?? "");
                  setResult(null);
                }}
              >
                {codingLanguages.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Suspense fallback={<Loading />}>
              <Editor
                height="440px"
                language={language === "c" ? "cpp" : language}
                value={code}
                onChange={(value) => setCode(value || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  readOnly: i.status !== "live",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                }}
              />
            </Suspense>
            <p role="status">{saved}</p>
            <Field label="Custom input">
              <textarea
                rows={4}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                maxLength={10000}
              />
            </Field>
            <div className="form-actions">
              <button
                className="btn secondary"
                disabled={
                  busy ||
                  !code.trim() ||
                  !services.data?.code ||
                  publicDemoBlocked ||
                  !available.includes(language) ||
                  i.status !== "live"
                }
                onClick={() => void run("run", "examples")}
              >
                Run examples
              </button>
              <button
                className="btn secondary"
                disabled={
                  busy ||
                  !code.trim() ||
                  !services.data?.code ||
                  publicDemoBlocked ||
                  !available.includes(language) ||
                  i.status !== "live"
                }
                onClick={() => void run("run", "custom")}
              >
                Run custom input
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  !code.trim() ||
                  !services.data?.code ||
                  publicDemoBlocked ||
                  !available.includes(language) ||
                  i.status !== "live"
                }
                onClick={() => void run("submit")}
              >
                Submit solution
              </button>
              <button
                className="btn secondary"
                disabled={busy || i.status !== "live"}
                onClick={() => {
                  setCode(p.starter[language] || "");
                  setResult(null);
                }}
              >
                Reset code
              </button>
            </div>
            <p>
              Run examples checks the visible cases. Submit solution checks all
              public and hidden cases. Custom input runs without grading.
            </p>
            {runningAction && (
              <p role="status">
                {runningAction} Results will appear when the execution service
                finishes.
              </p>
            )}
            {services.data?.code && !publicDemoBlocked && (
              <ExecutionLanguageStatus
                state={runner}
                language={language}
                disabled={busy}
              />
            )}
            {result && <ExecutionResults submission={result} />}
          </div>
        </Panel>
      </div>
      <Panel title="Submission history">
        <div className="panel-form">
          {submissions.data.length ? (
            <ul className="execution-history">
              {submissions.data.map((s) => (
                <li key={s._id}>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => setResult(s)}
                  >
                    {new Date(s.createdAt).toLocaleString()} · {s.language} ·{" "}
                    {isCustomRun(s)
                      ? "Custom input"
                      : s.mode === "submit"
                        ? "Submit"
                        : "Examples"}{" "}
                    · {submissionVerdict(s)}
                    {!isCustomRun(s) &&
                      ` · ${s.results.filter((r) => r.statusId === 3).length}/${s.total} tests passed`}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No code execution results yet.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
