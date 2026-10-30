import { useMemo, useState } from "react";
import type { Interview, Problem } from "../shared/types";
import { useNavigate } from "react-router-dom";
import { send } from "./api";
import { Badge, Empty, ErrorBox, Field, Loading, Notice, Panel } from "./ui";
import "./practice-bank.css";

const levels = ["Easy", "Medium", "Hard"] as const;
export function filterPracticeProblems(
  problems: Problem[],
  search: string,
  difficulty: string,
  topic: string,
) {
  const term = search.trim().toLowerCase();
  return problems.filter(
    (p) =>
      (difficulty === "All" || p.difficulty === difficulty) &&
      (topic === "All" || (p.topic || "Warm-up") === topic) &&
      (!term ||
        `${p.title} ${p.topic || ""} ${p.description}`
          .toLowerCase()
          .includes(term)),
  );
}

export function PracticeQuestionBank({
  problems,
  loading,
  error,
  executionAvailable,
}: {
  problems: Problem[];
  loading: boolean;
  error: string;
  executionAvailable?: boolean;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(""),
    [difficulty, setDifficulty] = useState("All"),
    [topic, setTopic] = useState("All"),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Problem | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const filtered = useMemo(
    () => filterPracticeProblems(problems, search, difficulty, topic),
    [problems, search, difficulty, topic],
  );
  const topics = [...new Set(problems.map((p) => p.topic || "Warm-up"))].sort();
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, pages);
  async function start(problem: Problem) {
    setBusy(true);
    setFailure("");
    try {
      const session = await send<Interview>("/practice/coding", {
        problemId: problem.id,
      });
      navigate(`/practice/code/${session._id}`);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Coding question bank"
      description="Choose a problem, read the examples, then open your private coding workspace."
    >
      <div className="panel-form">
        <ErrorBox message={error || failure} />
        <div
          className="practice-bank-counts"
          aria-label="Questions by difficulty"
        >
          {levels.map((level) => (
            <Badge key={level}>
              {level}: {problems.filter((p) => p.difficulty === level).length}
            </Badge>
          ))}
        </div>
        {executionAvailable === false && (
          <Notice>
            Private code execution is awaiting server setup. You can read
            questions and save code; Run and Submit will become available after
            the private runner is connected.
          </Notice>
        )}
        <div className="practice-bank-filters">
          <Field label="Search coding questions">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by title, topic or keyword"
            />
          </Field>
          <Field label="Difficulty">
            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value);
                setPage(1);
              }}
            >
              <option value="All">All difficulties</option>
              {levels.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </Field>
          <Field label="Topic">
            <select
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setPage(1);
              }}
            >
              <option value="All">All topics</option>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        {loading ? (
          <Loading />
        ) : !filtered.length ? (
          <Empty
            title="No matching coding questions"
            detail="Try another search, topic or difficulty."
          />
        ) : (
          <>
            <p role="status">
              {filtered.length} matching questions · Page {current} of {pages}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Difficulty</th>
                    <th>Topic</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((current - 1) * 20, current * 20).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => setSelected(p)}
                        >
                          {p.title}
                        </button>
                      </td>
                      <td>{p.difficulty}</td>
                      <td>{p.topic || "Warm-up"}</td>
                      <td>
                        <button
                          className="btn secondary"
                          disabled={busy}
                          onClick={() => void start(p)}
                        >
                          Practice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="practice-bank-paging">
              <button
                className="btn secondary"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </button>
              <span>
                Page {current} of {pages}
              </span>
              <button
                className="btn secondary"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
        {selected && (
          <section
            className="practice-question-detail"
            aria-label="Selected coding question"
          >
            <div className="practice-question-heading">
              <h3>{selected.title}</h3>
              <button
                className="btn secondary"
                onClick={() => setSelected(null)}
              >
                Close question
              </button>
            </div>
            <p>
              {selected.difficulty} · {selected.topic || "Warm-up"}
            </p>
            <p className="question-statement">{selected.description}</p>
            <h4>Constraints</h4>
            <p>{selected.constraints}</p>
            {selected.examples.map((sample, i) => (
              <div key={i}>
                <h4>Example {i + 1}</h4>
                <p>Input</p>
                <pre>{sample.input}</pre>
                <p>Expected output</p>
                <pre>{sample.output}</pre>
              </div>
            ))}
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void start(selected)}
            >
              Open coding workspace
            </button>
          </section>
        )}
      </div>
    </Panel>
  );
}
