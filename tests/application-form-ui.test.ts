// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationForm } from "../src/ApplicationForm";
import type { Application, Job, User } from "../shared/types";

const user = {
  name: "Profile Name",
  email: "verified@example.test",
  role: "candidate",
  profile: {
    phone: "+91 98765 43210",
    location: "Hubballi, Karnataka",
    education: "Computer Science degree",
    skills: ["Java"],
    experience: "",
    projects: "Java API",
    certifications: "",
    resumeId: "123456789012345678901234",
  },
} as User;
const job = {
  _id: "123456789012345678901235",
  title: "Java Developer",
  companyName: "Hiring company",
  location: "Remote",
  employment: "Full-time",
  shortlistThreshold: 80,
} as Job;
let root: Root, host: HTMLDivElement;
let requests: { url: string; body: any }[];
let submitted = vi.fn<(application: Application) => void>();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() {} },
    close: { configurable: true, value() {} },
  });
  requests = [];
  submitted = vi.fn<(application: Application) => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      return new Response(
        JSON.stringify({
          _id: "saved-application",
          screening: { state: "queued" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(ApplicationForm, {
        user,
        job,
        onClose: () => {},
        onSubmitted: (application) => submitted(application),
      }),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const input = (name: string) =>
  host.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it("prefills editable fields but never submits an old saved resume without explicit choice and review", async () => {
  expect(input("name").value).toBe("Profile Name");
  expect(input("city").value).toBe("Hubballi");
  expect(input("state").value).toBe("Karnataka");
  expect(input("resumeConfirmed").checked).toBe(false);
  await submit();
  expect(requests).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(
    "Confirm the resume",
  );
});

it("submits edited application contact and qualifications, confirms the saved PDF, and does not call profile mutation", async () => {
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('[name="resumeMode"][value="saved"]')!
      .click(),
  );
  input("name").value = "Application Name";
  input("email").value = "contact@example.test";
  input("skills").value = "Java, SQL";
  await act(async () => {
    input("resumeConfirmed").click();
    input("detailsConfirmed").click();
  });
  await submit();
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(`/api/jobs/${job._id}/apply`);
  expect(requests[0].body).toMatchObject({
    name: "Application Name",
    email: "contact@example.test",
    skills: ["Java", "SQL"],
    resumeId: user.profile.resumeId,
    resumeConfirmed: true,
    detailsConfirmed: true,
  });
  expect(submitted).toHaveBeenCalledOnce();
  expect(user.email).toBe("verified@example.test");
  expect(user.profile.skills).toEqual(["Java"]);
});

it("validates application phone client-side and clears resume confirmation when the chosen source changes", async () => {
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('[name="resumeMode"][value="saved"]')!
      .click(),
  );
  await act(async () => {
    input("resumeConfirmed").click();
    input("detailsConfirmed").click();
  });
  input("phone").value = "not a phone";
  await submit();
  expect(requests).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(
    "7–15 digits",
  );
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('[name="resumeMode"][value="upload"]')!
      .click(),
  );
  expect(input("resumeConfirmed").checked).toBe(false);
});

it("does not submit a previously selected hidden file after switching resume sources", async () => {
  Object.defineProperty(input("resume"), "files", {
    configurable: true,
    value: [new File(["%PDF-test"], "first.pdf", { type: "application/pdf" })],
  });
  await act(async () =>
    input("resume").dispatchEvent(new Event("change", { bubbles: true })),
  );
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('[name="resumeMode"][value="saved"]')!
      .click(),
  );
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('[name="resumeMode"][value="upload"]')!
      .click(),
  );
  expect(input("resume").required).toBe(true);
  await act(async () => {
    input("resumeConfirmed").click();
    input("detailsConfirmed").click();
  });
  await submit();
  expect(requests).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(
    "Select the PDF resume",
  );
});
