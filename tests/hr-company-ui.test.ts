// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { User } from "../shared/types";

const a = "111111111111111111111111",
  b = "222222222222222222222222";
const hr = {
  _id: "333333333333333333333333",
  role: "hr",
  companyId: a,
} as User;
beforeEach(() => {
  vi.resetModules();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("restores the HR workspace after refresh and keeps its owner account with the selection", async () => {
  const context = await import("../src/hr-company-context");
  context.setApiUserContext(hr);
  vi.resetModules();
  expect(
    (await import("../src/hr-company-context")).getActiveHrCompanyId(),
  ).toBe(a);
  expect(
    JSON.parse(window.sessionStorage.getItem("hirelens:hr-company")!),
  ).toEqual({ userId: hr._id, companyId: a });
});

it("clears HR context when a different role signs in and keeps non-API URLs untouched", async () => {
  const context = await import("../src/hr-company-context");
  context.setApiUserContext(hr);
  expect(context.scopedApiUrl("https://example.test/api/file")).toBe(
    "https://example.test/api/file",
  );
  expect(context.scopedApiUrl("/jobs/one")).toBe("/jobs/one");
  context.setApiUserContext({ ...hr, role: "candidate", companyId: undefined });
  expect(context.getActiveHrCompanyId()).toBeUndefined();
  expect(window.sessionStorage.getItem("hirelens:hr-company")).toBeNull();
  expect(context.scopedApiUrl("/api/resumes/test")).toBe("/api/resumes/test");
});

it("retains other asset query parameters and overrides stale company selectors", async () => {
  const context = await import("../src/hr-company-context");
  context.setApiUserContext(hr);
  const url = new URL(
    context.scopedApiUrl(`/api/company/logo?v=7&hrCompanyId=${b}#preview`),
    "https://example.test",
  );
  expect(url.searchParams.get("v")).toBe("7");
  expect(url.searchParams.getAll("hrCompanyId")).toEqual([a]);
  expect(url.hash).toBe("#preview");
});

it("survives unavailable browser storage and rejects malformed persisted selection", async () => {
  window.sessionStorage.setItem(
    "hirelens:hr-company",
    JSON.stringify({ userId: hr._id, companyId: "invalid" }),
  );
  const context = await import("../src/hr-company-context");
  expect(context.getActiveHrCompanyId()).toBeUndefined();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  context.setApiUserContext(hr);
  expect(context.getActiveHrCompanyId()).toBe(a);
});

it("scopes authenticated requests but keeps sign-in requests free of stale HR context", async () => {
  const context = await import("../src/hr-company-context");
  context.setApiUserContext(hr);
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../src/api");
  await api("/jobs");
  await api("/auth/me");
  await api("/auth/login", { method: "POST", body: "{}" });
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get("X-HireLens-Company"),
  ).toBe(a);
  expect(
    new Headers(fetch.mock.calls[1][1]?.headers).get("X-HireLens-Company"),
  ).toBe(a);
  expect(
    new Headers(fetch.mock.calls[2][1]?.headers).has("X-HireLens-Company"),
  ).toBe(false);
});

it("ignores an old company's delayed access error after switching workspaces", async () => {
  const context = await import("../src/hr-company-context");
  context.setApiUserContext(hr);
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const lost = vi.fn();
  window.addEventListener("hirelens:company-access-lost", lost);
  try {
    const { api } = await import("../src/api");
    const result = api("/applications").catch((error) => error);
    context.setApiUserContext({ ...hr, companyId: b });
    finish(
      new Response(
        JSON.stringify({
          error: {
            message: "Membership removed",
            code: "HR_COMPANY_ACCESS_DENIED",
          },
        }),
        { status: 403 },
      ),
    );
    expect(await result).toMatchObject({ status: 403 });
    expect(lost).not.toHaveBeenCalled();
    expect(context.getActiveHrCompanyId()).toBe(b);
  } finally {
    window.removeEventListener("hirelens:company-access-lost", lost);
  }
});

it("notifies active workspace access loss while leaving failed switch validation on screen", async () => {
  const context = await import("../src/hr-company-context");
  context.setApiUserContext(hr);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Membership removed",
              code: "HR_COMPANY_ACCESS_DENIED",
            },
          }),
          { status: 403 },
        ),
    ),
  );
  const lost = vi.fn();
  window.addEventListener("hirelens:company-access-lost", lost);
  try {
    const { api } = await import("../src/api");
    await expect(api("/applications")).rejects.toMatchObject({ status: 403 });
    expect(lost).toHaveBeenCalledTimes(1);
    await expect(
      api("/hr/companies/active", {
        method: "PATCH",
        body: JSON.stringify({ companyId: b }),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(lost).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener("hirelens:company-access-lost", lost);
  }
});
