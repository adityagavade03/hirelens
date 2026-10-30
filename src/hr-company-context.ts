import type { User } from "../shared/types";

const storageKey = "hirelens:hr-company";
type Selection = { userId: string; companyId: string };
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
function readSelection(): Selection | undefined {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(storageKey) || "null",
    );
    if (isId(value?.userId) && isId(value?.companyId)) return value;
  } catch {
    // The current tab still works when browser storage is unavailable.
  }
}
let selection = readSelection();

/** Tab-local scope; the server independently checks membership on every request. */
export const getActiveHrCompanyId = () => selection?.companyId;
export function clearHrCompanyContext() {
  selection = undefined;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {}
}
export function setApiUserContext(user: User) {
  if (user.role !== "hr" || !isId(user.companyId)) {
    clearHrCompanyContext();
    return;
  }
  selection = { userId: user._id, companyId: user.companyId };
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(selection));
  } catch {}
}

/** Media elements and browser downloads cannot send the API context header. */
export function scopedApiUrl(path: string) {
  if (!selection || !path.startsWith("/api/")) return path;
  const url = new URL(path, "https://hirelens.invalid");
  url.searchParams.set("hrCompanyId", selection.companyId);
  return `${url.pathname}${url.search}${url.hash}`;
}
