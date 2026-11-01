// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AuthPage from "../src/AuthPage";
import { send } from "../src/api";

const fixture = vi.hoisted(() => ({
  options: {
    companyVerification: false,
    localCompanyRegistration: false,
    unverifiedCompanyRegistration: true,
    companyOtp: true,
    email: true,
    messagePreview: false,
    demo: false,
  },
}));
vi.mock("../src/App", () => ({ Brand: () => "HireLens" }));
vi.mock("../src/theme", () => ({ ThemeToggle: () => null }));
vi.mock("../src/api", () => ({
  send: vi.fn(),
  useResource: () => ({ data: fixture.options, loading: false, error: "" }),
}));

let host: HTMLDivElement;
let root: Root;
const button = (label: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  )!;
const input = (name: string, value: string) => {
  const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  )!;
  element.value = value;
};
async function submit(label: string) {
  const control = button(label);
  await act(async () => {
    control.form!.dispatchEvent(
      new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: control,
      }),
    );
  });
}
async function openSignup() {
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/auth/company"] },
        createElement(AuthPage, { onLogin: vi.fn() }),
      ),
    ),
  );
  await act(async () => button("Sign up").click());
}
function fillIdentity() {
  for (const [name, value] of Object.entries({
    companyName: "Ordinary UI Company",
    officialEmail: "OWNER@company.example.test",
    website: "https://company.example.test",
    registrationNumber: "TEST-12345",
    country: "in",
    industry: "Software",
    address: "10 Test Street",
    location: "Test City",
    phone: "+919876543210",
  }))
    input(name, value);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  fixture.options.companyVerification = false;
  fixture.options.localCompanyRegistration = false;
  fixture.options.unverifiedCompanyRegistration = true;
  vi.mocked(send).mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("opens ordinary company signup without a verification provider and submits the distinct account path", async () => {
  vi.mocked(send).mockResolvedValue({
    registered: true,
    message: "Company account created",
  });
  await openSignup();
  expect(host.textContent).toContain("Your company stays unverified");
  expect(button("Verify company & continue")).toBeUndefined();
  expect(button("Continue with local setup")).toBeUndefined();
  fillIdentity();
  await submit("Continue without business verification");
  expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Business verification pending");
  expect(host.textContent).not.toContain("Company verified.");
  expect(host.textContent).toContain("Public job publishing stays restricted");
  input("name", "Owner Fixture");
  input("username", "ordinary-ui-owner");
  input("confirmPassword", "SignupUiPassword!2026");
  const email = host.querySelector<HTMLInputElement>(
    'input[autocomplete="email"]',
  )!;
  expect(email.value).toBe("owner@company.example.test");
  expect(email.readOnly).toBe(true);
  const password = host.querySelector<HTMLInputElement>(
    'input[autocomplete="new-password"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(password, "SignupUiPassword!2026");
    password.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit("Create company account");
  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(
    "/auth/register",
    expect.objectContaining({
      role: "company",
      username: "ordinary-ui-owner",
      email: "owner@company.example.test",
      password: "SignupUiPassword!2026",
      companyDetails: expect.objectContaining({
        companyName: "Ordinary UI Company",
        country: "IN",
      }),
      localCompanyDetails: undefined,
      verificationToken: undefined,
    }),
  );
  expect(host.textContent).toContain("Company account created");
});

it("does not offer ordinary registration when secure email signup is unavailable", async () => {
  fixture.options.unverifiedCompanyRegistration = false;
  await openSignup();
  expect(host.textContent).toContain(
    "Company account registration needs email sign-in verification",
  );
  expect(button("Continue without business verification")).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

it("keeps the real business verification flow available alongside ordinary signup", async () => {
  fixture.options.companyVerification = true;
  vi.mocked(send).mockResolvedValue({
    verificationToken: "a".repeat(64),
    legalName: "Verified Legal Company",
  });
  await openSignup();
  expect(button("Continue without business verification")).toBeDefined();
  fillIdentity();
  await submit("Verify company & continue");
  expect(send).toHaveBeenCalledWith(
    "/auth/company/verify",
    expect.objectContaining({
      officialEmail: "owner@company.example.test",
      country: "IN",
    }),
  );
  expect(host.textContent).toContain("Verified Legal Company");
  expect(host.textContent).toContain("Company verified.");
  expect(host.textContent).not.toContain("Business verification pending");
});
