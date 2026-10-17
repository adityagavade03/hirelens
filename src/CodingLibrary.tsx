import { useState, type FormEvent } from "react";
import type { Problem } from "../shared/types";
import { blankStarters, codingLanguages } from "../shared/languages";
import { send, useResource } from "./api";
import {
  PageTitle,
  Panel,
  Field,
  Submit,
  ErrorBox,
  Notice,
  Loading,
} from "./ui";
type Content = Omit<Problem, "id"> & {
  tests: { input: string; output: string; hidden: boolean }[];
};
const initial: Content = {
  title: "",
  description: "",
  constraints: "",
  difficulty: "Beginner",
  examples: [{ input: "", output: "" }],
  tests: [
    { input: "", output: "", hidden: false },
    { input: "", output: "", hidden: true },
  ],
  starter: { ...blankStarters },
};
export function CodingLibrary() {
  const library = useResource<{ _id: string; content: Content }[]>(
    "/problem-library",
    [],
  );
  const [id, setId] = useState<string>(),
    [draft, setDraft] = useState<Content>(initial);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const field = (key: keyof Content, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const row = await send<{ _id: string }>(
        `/problem-library${id ? `/${id}` : ""}`,
        draft,
        id ? "PUT" : "POST",
      );
      setId(row._id);
      setSaved(true);
      await library.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Coding question library"
        description="Create company questions with public examples and private test cases."
      />
      <ErrorBox message={error || library.error} />
      <Panel title="Company questions">
        <div className="panel-form">
          <button
            className="btn secondary"
            onClick={() => {
              setId(undefined);
              setDraft(structuredClone(initial));
              setSaved(false);
            }}
          >
            New question
          </button>
          {library.loading ? (
            <Loading />
          ) : (
            library.data.map((p) => (
              <button
                className="text-link"
                key={p._id}
                onClick={() => {
                  setId(p._id);
                  setDraft(structuredClone(p.content));
                  setSaved(false);
                }}
              >
                {p.content.title}
              </button>
            ))
          )}
        </div>
      </Panel>
      <Panel title={id ? "Edit question" : "New question"}>
        <form className="panel-form" onSubmit={save}>
          {saved && (
            <Notice>
              Question saved. HR can choose it when scheduling an interview.
            </Notice>
          )}
          <Notice>
            Changes apply to newly scheduled interviews. Existing interviews
            keep their original question and tests. Candidates never receive
            hidden test inputs or expected outputs.
          </Notice>
          <Field label="Title">
            <input
              required
              minLength={3}
              maxLength={150}
              value={draft.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </Field>
          <Field label="Difficulty">
            <select
              value={draft.difficulty}
              onChange={(e) => field("difficulty", e.target.value)}
            >
              {["Beginner", "Intermediate", "Advanced"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Problem statement"
            hint="Explain input and output formats."
          >
            <textarea
              required
              minLength={20}
              rows={6}
              value={draft.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </Field>
          <Field label="Constraints">
            <textarea
              rows={2}
              value={draft.constraints}
              onChange={(e) => field("constraints", e.target.value)}
            />
          </Field>
          <h3>Public examples</h3>
          {draft.examples.map((test, i) => (
            <div className="form-grid" key={i}>
              {(["input", "output"] as const).map((k) => (
                <Field key={k} label={`Example ${i + 1} ${k}`}>
                  <textarea
                    value={test[k]}
                    onChange={(e) =>
                      field(
                        "examples",
                        draft.examples.map((t, j) =>
                          j === i ? { ...t, [k]: e.target.value } : t,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              <button
                type="button"
                className="text-button"
                disabled={draft.examples.length === 1}
                onClick={() =>
                  field(
                    "examples",
                    draft.examples.filter((_, j) => i !== j),
                  )
                }
              >
                Remove example
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn secondary"
            disabled={draft.examples.length >= 5}
            onClick={() =>
              field("examples", [...draft.examples, { input: "", output: "" }])
            }
          >
            Add example
          </button>
          <h3>Execution tests</h3>
          {draft.tests.map((test, i) => (
            <div key={i}>
              <div className="form-grid">
                {(["input", "output"] as const).map((k) => (
                  <Field key={k} label={`Test ${i + 1} ${k}`}>
                    <textarea
                      value={test[k]}
                      onChange={(e) =>
                        field(
                          "tests",
                          draft.tests.map((t, j) =>
                            i === j ? { ...t, [k]: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={test.hidden}
                  onChange={(e) =>
                    field(
                      "tests",
                      draft.tests.map((t, j) =>
                        i === j ? { ...t, hidden: e.target.checked } : t,
                      ),
                    )
                  }
                />{" "}
                Hidden test
              </label>
              <button
                type="button"
                className="text-button"
                disabled={draft.tests.length <= 2}
                onClick={() =>
                  field(
                    "tests",
                    draft.tests.filter((_, j) => i !== j),
                  )
                }
              >
                Remove test
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn secondary"
            disabled={draft.tests.length >= 20}
            onClick={() =>
              field("tests", [
                ...draft.tests,
                { input: "", output: "", hidden: true },
              ])
            }
          >
            Add test
          </button>
          <h3>Starter code</h3>
          {codingLanguages.map(({ key: language, label }) => (
            <Field label={label} key={language}>
              <textarea
                rows={5}
                spellCheck={false}
                value={draft.starter[language] ?? blankStarters[language]}
                onChange={(e) =>
                  field("starter", {
                    ...draft.starter,
                    [language]: e.target.value,
                  })
                }
              />
            </Field>
          ))}
          <Submit busy={busy}>Save question</Submit>
        </form>
      </Panel>
    </>
  );
}
