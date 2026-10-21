import mongoose, { type Connection } from "mongoose";
import { z } from "zod";

const address = z.email().max(254);
const objectId = /^[a-f0-9]{24}$/i;

export type PreviewCompanyScope = {
  companyEmails: string[];
  companyIds: string[];
};

export function previewCompanyEmails(
  primary: string | undefined,
  additional?: string,
): string[] {
  const values = [primary, ...(additional === undefined ? [] : [additional])];
  const emails = values.map((value) => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized || normalized.includes("*") || !address.safeParse(normalized).success)
      throw new Error("--company-email and --additional-company-email must be valid individual email addresses.");
    return normalized;
  });
  if (new Set(emails).size !== emails.length)
    throw new Error("The primary and additional company email addresses must be distinct.");
  return emails;
}

// Read only the approved owners and their workspaces. No registration, role
// changes, verification, sessions or record updates belong in preview startup.
export async function resolvePreviewCompanyScope(
  database: Pick<Connection, "collection">,
  requestedEmails: readonly string[],
): Promise<PreviewCompanyScope> {
  if (requestedEmails.length < 1 || requestedEmails.length > 2)
    throw new Error("Select one primary company and at most one additional company.");
  const companyEmails = previewCompanyEmails(requestedEmails[0], requestedEmails[1]);
  const companyIds: string[] = [];
  for (const email of companyEmails) {
    const owner = await database.collection("users").findOne(
      { email, role: "company" },
      { projection: { _id: 1, companyId: 1, role: 1 } },
    );
    if (!owner || owner.role !== "company" ||
        typeof owner.companyId !== "string" || !objectId.test(owner.companyId) ||
        !objectId.test(String(owner._id)))
      throw new Error("An approved company account does not exist or has no valid workspace.");
    const companyId = owner.companyId.toLowerCase();
    if (companyIds.includes(companyId))
      throw new Error("Approved company accounts must own distinct workspaces.");
    const ownerId = String(owner._id);
    const company = await database.collection("companies").findOne(
      { _id: new mongoose.Types.ObjectId(companyId), ownerId },
      { projection: { _id: 1, ownerId: 1 } },
    );
    if (!company || String(company._id).toLowerCase() !== companyId || company.ownerId !== ownerId)
      throw new Error("An approved company account does not own its workspace.");
    companyIds.push(companyId);
  }
  return { companyEmails, companyIds };
}
