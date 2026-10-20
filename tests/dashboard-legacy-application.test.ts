// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Dashboard } from "../src/App";
import { useAuth } from "../src/auth-context";
import { useResource } from "../src/api";
import type { Application, User } from "../shared/types";

vi.mock("../src/auth-context", () => ({
  useAuth: vi.fn(),
  AuthContext: {},
}));
vi.mock("../src/api", () => ({
  api: vi.fn(),
  send: vi.fn(),
  useResource: vi.fn(),
  dateLabel: () => "Test date",
}));
vi.mock("../src/HrWorkload", () => ({ HrAvailabilityPanel: () => null }));
vi.mock("../src/company", () => ({
  CompanyDashboard: () => null,
  CompanyProfilePage: () => null,
  InterviewersPage: () => null,
  AssignmentsPage: () => null,
  NotificationsPage: () => null,
  HrRequestsSummary: () => null,
}));

const legacy = {
  _id: "legacy-application",
  candidateName: "Test Candidate",
  jobTitle: "Backend Developer",
  companyName: "Test Company",
  status: "Applied",
  assignedHrId: "hr-test",
  createdAt: "2026-10-19T00:00:00.000Z",
} as Application;
let application: Application;
beforeEach(() => {
  application = { ...legacy };
  vi.mocked(useResource).mockImplementation(
    (path, fallback) =>
      ({
        data: path === "/applications" ? [application] : fallback,
        error: "",
        loading: false,
        reload: vi.fn(),
        setData: vi.fn(),
      }) as ReturnType<typeof useResource>,
  );
});
function render(role: "candidate" | "hr") {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      _id: role === "hr" ? "hr-test" : "candidate-test",
      role,
      name: "Test User",
    } as User,
    refresh: vi.fn(),
    logout: vi.fn(),
  });
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(Dashboard)),
  );
}

it.each(["candidate", "hr"] as const)(
  "renders the %s dashboard without a legacy match object or invented zero score",
  (role) => {
    const output = render(role);
    expect(output).toContain("Backend Developer");
    expect(output).toContain("Not available");
    expect(output).not.toContain(">0%");
    expect(output).not.toContain("Awaiting screening");
  },
);

it("shows awaiting screening only when screening is queued or processing", () => {
  application = {
    ...legacy,
    screening: { state: "queued", threshold: 80, attempts: 0 },
  };
  expect(render("candidate")).toContain("Awaiting screening");
});

it.each(["candidate", "hr"] as const)(
  "preserves a genuine zero score even when legacy skill arrays are absent for %s",
  (role) => {
    application = { ...legacy, match: { score: 0 } as Application["match"] };
    const output = render(role);
    expect(output).toContain(">0%");
    expect(output).not.toContain("Not available");
  },
);
