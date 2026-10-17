import { useState } from "react";
import { api, useResource, dateLabel } from "./api";
import { Panel, ErrorBox, Notice } from "./ui";
export function CodeHistory({ interviewId }: { interviewId: string }) {
  const rows = useResource<
    { _id: string; language: string; createdAt: string }[]
  >(`/interviews/${interviewId}/code-history`, []);
  const [revision, setRevision] = useState<{
      code: string;
      language: string;
      createdAt: string;
    } | null>(null),
    [error, setError] = useState("");
  return (
    <Panel
      title="Coding process"
      description="Saved editor snapshots and submission results help reviewers follow how the solution developed."
    >
      <div className="panel-form">
        <ErrorBox message={error || rows.error} />
        <Notice>
          Snapshots are captured at most once every 15 seconds while edits are
          saved, up to 300 per session. They are not a complete keystroke
          recording.
        </Notice>
        <div className="form-actions">
          {rows.data.map((r) => (
            <button
              key={r._id}
              className="btn secondary"
              onClick={async () => {
                setError("");
                try {
                  setRevision(
                    await api(
                      `/interviews/${interviewId}/code-history/${r._id}`,
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {dateLabel(r.createdAt)} · {r.language}
            </button>
          ))}
        </div>
        {!rows.data.length && <p>No editor snapshots recorded.</p>}
        {revision && (
          <div>
            <h3>
              {revision.language} · {dateLabel(revision.createdAt)}
            </h3>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {revision.code}
            </pre>
          </div>
        )}
      </div>
    </Panel>
  );
}
