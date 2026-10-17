import { useState, type FormEvent } from "react";
import { send, useResource, dateLabel } from "./api";
import {
  PageTitle,
  Panel,
  Field,
  Submit,
  ErrorBox,
  Notice,
  formObject,
} from "./ui";
type Preview = {
  previewToken?: string;
  interviews: number;
  monitoringEvents: number;
  submissions: number;
  codeRevisions?: number;
  recordingSegments?: number;
  auditEvents: number;
};
type Audit = {
  _id: string;
  actorId: string;
  action: string;
  resourceId?: string;
  status: number;
  createdAt: string;
};
export function GovernancePage() {
  const [cursor, setCursor] = useState("");
  const audit = useResource<Audit[]>(
    `/company/audit${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`,
    [],
  );
  const [preview, setPreview] = useState<Preview>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function inspect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(undefined);
    const v = formObject(e);
    try {
      setPreview(
        await send<Preview>("/company/retention/preview", {
          days: Number(v.days),
          auditDays: Number(v.auditDays),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send("/company/retention/apply", {
        ...formObject(e),
        previewToken: preview?.previewToken,
      });
      setPreview(undefined);
      setMessage("Cleanup completed for the previewed records.");
      await audit.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Audit & retention"
        description="Review company activity and control retention of private interview artifacts."
      />
      <ErrorBox message={error || audit.error} />
      {message && <Notice>{message}</Notice>}
      <Panel title="Retention cleanup">
        <div className="panel-form">
          <Notice>
            Cleanup is manual and irreversible. Back up your database first.
            Only completed interviews with finalized reports are eligible.
            Cleanup removes monitoring events, coding submissions, editor
            snapshots, recordings and their transcripts, private notes and code
            drafts. Applications, resumes, questions, answers, feedback and
            hiring decisions remain. No cleanup runs automatically.
          </Notice>
          <form onSubmit={inspect}>
            <div className="form-grid">
              <Field label="Private interview artifacts older than (days)">
                <input
                  type="number"
                  name="days"
                  min={30}
                  max={3650}
                  defaultValue={180}
                  required
                />
              </Field>
              <Field label="Audit records older than (days)">
                <input
                  type="number"
                  name="auditDays"
                  min={365}
                  max={3650}
                  defaultValue={730}
                  required
                />
              </Field>
            </div>
            <Submit busy={busy}>Preview cleanup</Submit>
          </form>
          {preview && (
            <form onSubmit={apply}>
              <p>
                {preview.interviews} interviews · {preview.monitoringEvents}{" "}
                monitoring events · {preview.submissions} submissions ·{" "}
                {preview.auditEvents} audit records
                {" · "}
                {preview.codeRevisions || 0} editor snapshots
                {" · "}
                {preview.recordingSegments || 0} recording segments and
                transcripts
              </p>
              <Field
                label="Type DELETE PRIVATE INTERVIEW DATA to confirm"
                hint="The preview expires in five minutes."
              >
                <input
                  required
                  name="confirmation"
                  pattern="DELETE PRIVATE INTERVIEW DATA"
                  autoComplete="off"
                />
              </Field>
              <Submit busy={busy}>Delete previewed private data</Submit>
            </form>
          )}
        </div>
      </Panel>
      <Panel title="Company audit log">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor ID</th>
                <th>Action</th>
                <th>Resource</th>
                <th>HTTP status</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((e) => (
                <tr key={e._id}>
                  <td>{dateLabel(e.createdAt)}</td>
                  <td>{e.actorId}</td>
                  <td>{e.action}</td>
                  <td>{e.resourceId || "—"}</td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <button
            className="btn secondary"
            disabled={!cursor}
            onClick={() => setCursor("")}
          >
            Newest
          </button>
          <button
            className="btn secondary"
            disabled={audit.data.length < 100}
            onClick={() => setCursor(audit.data.at(-1)!.createdAt)}
          >
            Older records
          </button>
        </div>
      </Panel>
    </>
  );
}
