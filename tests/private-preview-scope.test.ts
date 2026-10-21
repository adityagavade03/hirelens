import mongoose, { type Connection } from "mongoose";
import { expect, it, vi } from "vitest";
import { previewCompanyEmails, resolvePreviewCompanyScope } from "../scripts/private-preview-scope.js";

const primary = "primary@scope.example.test";
const additional = "additional@scope.example.test";
const firstOwner = "111111111111111111111111";
const secondOwner = "222222222222222222222222";
const firstCompany = "aaaaaaaaaaaaaaaaaaaaaaaa";
const secondCompany = "bbbbbbbbbbbbbbbbbbbbbbbb";

function mockDatabase() {
  const users = [
    { _id: new mongoose.Types.ObjectId(firstOwner), email: primary, role: "company", companyId: firstCompany },
    { _id: new mongoose.Types.ObjectId(secondOwner), email: additional, role: "company", companyId: secondCompany },
  ];
  const companies = [
    { _id: new mongoose.Types.ObjectId(firstCompany), ownerId: firstOwner },
    { _id: new mongoose.Types.ObjectId(secondCompany), ownerId: secondOwner },
  ];
  const findOwner = vi.fn(async (query: { email: string; role: string }) => users.find((user) => user.email === query.email && user.role === query.role) || null);
  const findCompany = vi.fn(async (query: { _id: mongoose.Types.ObjectId; ownerId: string }) => companies.find((company) => String(company._id) === String(query._id) && company.ownerId === query.ownerId) || null);
  const collection = vi.fn((name: string) => {
    if (name === "users") return { findOne: findOwner };
    if (name === "companies") return { findOne: findCompany };
    throw new Error("Unexpected collection access");
  });
  const database = { collection } as unknown as Pick<Connection, "collection">;
  return { database, users, companies, findOwner, findCompany, collection };
}

it("normalizes distinct individual approved company addresses without accepting lists or wildcards", () => {
  expect(previewCompanyEmails(` ${primary.toUpperCase()} `)).toEqual([primary]);
  expect(previewCompanyEmails(` ${primary.toUpperCase()} `, additional.toUpperCase())).toEqual([primary, additional]);
  for (const invalid of [undefined, "", "not-email", "*@scope.example.test", "owner@*", `${primary},${additional}`, "owner\n@scope.example.test"]) {
    expect(() => previewCompanyEmails(invalid)).toThrow("valid individual email addresses");
  }
  for (const invalid of ["", "not-email", "*@scope.example.test", `${primary},${additional}`]) {
    expect(() => previewCompanyEmails(primary, invalid)).toThrow("valid individual email addresses");
  }
  expect(() => previewCompanyEmails(primary, ` ${primary.toUpperCase()} `)).toThrow("must be distinct");
});

it("preserves the original one-company scope when no additional company is approved", async () => {
  const { database, findOwner, findCompany } = mockDatabase();
  expect(await resolvePreviewCompanyScope(database, [primary])).toEqual({ companyEmails: [primary], companyIds: [firstCompany] });
  expect(findOwner).toHaveBeenCalledTimes(1);
  expect(findCompany).toHaveBeenCalledTimes(1);
});

it("adds a separate owned company without replacing the primary company or broadening either account's role", async () => {
  const { database, users, findOwner, findCompany } = mockDatabase();
  users[0].companyId = firstCompany.toUpperCase();
  expect(await resolvePreviewCompanyScope(database, [` ${primary.toUpperCase()} `, additional])).toEqual({ companyEmails: [primary, additional], companyIds: [firstCompany, secondCompany] });
  expect(findOwner.mock.calls.map(([query]) => query.role)).toEqual(["company", "company"]);
  expect(findCompany.mock.calls.map(([query]) => query.ownerId)).toEqual([firstOwner, secondOwner]);
});

it("rejects duplicate, invalid or excessive requested scope before reading the database", async () => {
  const { database, collection } = mockDatabase();
  for (const emails of [[], [primary, primary.toUpperCase()], [primary, "*"], [primary, additional, "third@scope.example.test"]]) {
    await expect(resolvePreviewCompanyScope(database, emails)).rejects.toThrow();
  }
  expect(collection).not.toHaveBeenCalled();
});

it("fails the entire scope if either approved account is missing or has another role", async () => {
  for (const email of [primary, additional]) {
    const missing = mockDatabase();
    missing.users.splice(missing.users.findIndex((user) => user.email === email), 1);
    await expect(resolvePreviewCompanyScope(missing.database, [primary, additional])).rejects.toThrow("approved company account does not exist");
    const otherRole = mockDatabase();
    otherRole.users.find((user) => user.email === email)!.role = "hr";
    await expect(resolvePreviewCompanyScope(otherRole.database, [primary, additional])).rejects.toThrow("approved company account does not exist");
  }
});

it("rejects invalid or dangling workspace references and ownership mismatch", async () => {
  const malformed = mockDatabase();
  malformed.users[0].companyId = "not-an-object-id";
  await expect(resolvePreviewCompanyScope(malformed.database, [primary])).rejects.toThrow("no valid workspace");
  expect(malformed.findCompany).not.toHaveBeenCalled();
  for (const index of [0, 1]) {
    const dangling = mockDatabase();
    dangling.companies.splice(index, 1);
    await expect(resolvePreviewCompanyScope(dangling.database, [primary, additional])).rejects.toThrow("does not own its workspace");
    const mismatch = mockDatabase();
    mismatch.companies[index].ownerId = "333333333333333333333333";
    await expect(resolvePreviewCompanyScope(mismatch.database, [primary, additional])).rejects.toThrow("does not own its workspace");
  }
});

it("rejects two approved accounts pointing at the same workspace", async () => {
  const { database, users } = mockDatabase();
  users[1].companyId = firstCompany;
  await expect(resolvePreviewCompanyScope(database, [primary, additional])).rejects.toThrow("must own distinct workspaces");
});
