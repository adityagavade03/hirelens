// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Field } from "../src/ui";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function references(control: Element, attribute: string) {
  return (control.getAttribute(attribute) || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const target = document.getElementById(id);
      expect(
        target,
        `${attribute} references an existing element`,
      ).not.toBeNull();
      return target!;
    });
}
function form(skillHint = "Separate skills with commas.") {
  return createElement(
    Fragment,
    null,
    createElement(Field, {
      label: "Skills",
      hint: skillHint,
      children: createElement("input", { id: "skills", name: "skills" }),
    }),
    createElement(Field, {
      label: "Experience",
      hint: "Enter full years.",
      children: createElement("input", {
        id: "experience",
        name: "experience",
        type: "number",
      }),
    }),
  );
}
it("gives repeated fields unique stable descriptions and keeps help text separate from their names", async () => {
  await act(async () => root.render(form()));
  const skills = host.querySelector<HTMLInputElement>("#skills")!;
  const experience = host.querySelector<HTMLInputElement>("#experience")!;
  expect(skills.labels).toHaveLength(1);
  expect(experience.labels).toHaveLength(1);
  expect(
    references(skills, "aria-labelledby").map((x) => x.textContent),
  ).toEqual(["Skills"]);
  expect(
    references(experience, "aria-labelledby").map((x) => x.textContent),
  ).toEqual(["Experience"]);
  const skillDescription = references(skills, "aria-describedby")[0];
  const experienceDescription = references(experience, "aria-describedby")[0];
  expect(skillDescription.textContent).toBe("Separate skills with commas.");
  expect(experienceDescription.textContent).toBe("Enter full years.");
  expect(skillDescription.id).not.toBe(experienceDescription.id);
  const before = [
    skills.getAttribute("aria-labelledby"),
    skills.getAttribute("aria-describedby"),
  ];
  skills.value = "React, TypeScript";
  await act(async () =>
    root.render(form("Include tools used in your projects.")),
  );
  expect(host.querySelector("#skills")).toBe(skills);
  expect(skills.value).toBe("React, TypeScript");
  expect([
    skills.getAttribute("aria-labelledby"),
    skills.getAttribute("aria-describedby"),
  ]).toEqual(before);
  expect(references(skills, "aria-describedby")[0].textContent).toBe(
    "Include tools used in your projects.",
  );
});
it("preserves custom labels, existing error descriptions and input behaviour", async () => {
  const changed = vi.fn();
  await act(async () =>
    root.render(
      createElement(
        Fragment,
        null,
        createElement("span", { id: "custom-name" }, "Official company email"),
        createElement("p", { id: "email-error" }, "Use your company address."),
        createElement(Field, {
          label: "Email",
          hint: "We send verification here.",
          children: createElement("input", {
            id: "email",
            "aria-labelledby": "custom-name",
            "aria-describedby": "email-error",
            type: "email",
            name: "companyEmail",
            required: true,
          }),
        }),
        createElement(Field, {
          label: "Consent",
          hint: "Optional recording only.",
          children: createElement("input", {
            id: "consent",
            type: "checkbox",
            "aria-label": "Consent to optional recording",
            "aria-describedby": "email-error",
            onChange: changed,
          }),
        }),
      ),
    ),
  );
  const email = host.querySelector<HTMLInputElement>("#email")!;
  expect(email.getAttribute("aria-labelledby")).toBe("custom-name");
  expect(
    references(email, "aria-describedby").map((x) => x.textContent),
  ).toEqual(["Use your company address.", "We send verification here."]);
  expect(email.type).toBe("email");
  expect(email.name).toBe("companyEmail");
  expect(email.required).toBe(true);
  const consent = host.querySelector<HTMLInputElement>("#consent")!;
  expect(consent.getAttribute("aria-label")).toBe(
    "Consent to optional recording",
  );
  expect(consent.hasAttribute("aria-labelledby")).toBe(false);
  expect(
    references(consent, "aria-describedby").map((x) => x.textContent),
  ).toEqual(["Use your company address.", "Optional recording only."]);
  await act(async () => consent.click());
  expect(changed).toHaveBeenCalledTimes(1);
  expect(consent.checked).toBe(true);
});
