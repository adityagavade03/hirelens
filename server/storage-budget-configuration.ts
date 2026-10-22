const mebibyte = 1024 * 1024;

export function parseStorageBudget(value: string | undefined) {
  if (value === undefined || value === "") return undefined;
  if (!/^[1-9]\d*$/.test(value))
    throw new Error("STORAGE_BUDGET_MB must be a positive whole number.");
  const bytes = Number(value) * mebibyte;
  if (!Number.isSafeInteger(bytes))
    throw new Error("STORAGE_BUDGET_MB is too large.");
  return bytes;
}

export function parseStorageScope(value: string | undefined) {
  if (value === undefined || value === "" || value === "database")
    return "database" as const;
  if (value === "atlas-cluster") return value;
  throw new Error("STORAGE_BUDGET_SCOPE must be database or atlas-cluster.");
}
