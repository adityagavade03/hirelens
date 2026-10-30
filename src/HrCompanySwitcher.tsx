import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Check } from "lucide-react";
import { useAuth } from "./auth-context";
import { useResource } from "./api";
import { Badge, Empty, ErrorBox, Loading, Panel } from "./ui";

type HrCompany = { _id: string; name: string; active: boolean };
export function HrCompanySwitcher({
  expanded = false,
}: {
  expanded?: boolean;
}) {
  const { user, switchCompany } = useAuth();
  const companies = useResource<HrCompany[]>("/hr/companies", []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => void companies.reload();
    window.addEventListener("hirelens:companies-changed", update);
    return () =>
      window.removeEventListener("hirelens:companies-changed", update);
  }, [companies.reload]);
  async function change(companyId: string) {
    if (!switchCompany || !companyId || companyId === user.companyId) return;
    setBusy(true);
    setError("");
    try {
      await switchCompany(companyId);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (expanded)
    return (
      <Panel
        title="My companies"
        description="One HR account can join several companies. Switch workspaces to manage each company's assigned jobs and candidates."
      >
        <ErrorBox message={companies.error || error} />
        {companies.loading ? (
          <Loading />
        ) : companies.data.length ? (
          companies.data.map((company) => (
            <div className="member-row hr-company-member" key={company._id}>
              <Building2 size={20} aria-hidden="true" />
              <div>
                <strong>{company.name}</strong>
              </div>
              {company._id === user.companyId ? (
                <Badge tone="green">
                  <Check size={14} /> Active
                </Badge>
              ) : (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void change(company._id)}
                >
                  Switch to {company.name}
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="No companies joined yet"
            detail="Accept a company invitation below to join its hiring team. You can accept invitations from multiple companies."
          />
        )}
      </Panel>
    );
  return (
    <div className="hr-company-switcher">
      <label htmlFor="hr-active-company">Company workspace</label>
      <select
        id="hr-active-company"
        value={user.companyId || ""}
        onChange={(event) => void change(event.target.value)}
        disabled={companies.loading || busy || !companies.data.length}
        aria-describedby="hr-company-scope-note"
      >
        {!companies.data.length && (
          <option value={user.companyId || ""}>
            {companies.loading ? "Loading companies…" : "Join a company"}
          </option>
        )}
        {companies.data.map((company) => (
          <option key={company._id} value={company._id}>
            {company.name}
          </option>
        ))}
      </select>
      <small id="hr-company-scope-note">
        Jobs and candidates for the selected company.
      </small>
      <ErrorBox message={companies.error || error} />
      <Link className="text-link" to="/team">
        Companies & invitations
      </Link>
    </div>
  );
}
