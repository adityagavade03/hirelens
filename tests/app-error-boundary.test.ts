// @vitest-environment jsdom
import { act, createElement, lazy, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "../src/AppErrorBoundary";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
}
it("catches a real render failure, focuses its alert, and only retries when requested", async () => {
  let fail = true;
  const reload = vi.fn();
  function Child() {
    if (fail)
      throw new Error(
        "Internal implementation detail should stay out of the fallback",
      );
    return createElement("p", null, "Recovered content");
  }
  await act(async () =>
    root.render(
      createElement(AppErrorBoundary, {
        resetKey: "/candidate",
        reload,
        children: createElement(Child),
      }),
    ),
  );
  expect(host.querySelector("h1")?.textContent).toBe(
    "We couldn’t open this page",
  );
  expect(host.textContent).not.toContain("Internal implementation detail");
  expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
  expect(reload).not.toHaveBeenCalled();
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/");
  fail = false;
  await act(async () => button("Try again").click());
  expect(host.textContent).toBe("Recovered content");
  expect(reload).not.toHaveBeenCalled();
});
it("handles rejected lazy imports with an explicit user-controlled reload", async () => {
  const reload = vi.fn();
  const BrokenPage = lazy(async () => {
    throw new Error(
      "Failed to fetch dynamically imported module: /src/HumanRoom.tsx",
    );
  });
  await act(async () =>
    root.render(
      createElement(AppErrorBoundary, {
        resetKey: "/room/example",
        reload,
        children: createElement(
          Suspense,
          { fallback: "Loading" },
          createElement(BrokenPage),
        ),
      }),
    ),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Part of this page could not be loaded",
  );
  expect(host.textContent).not.toContain("/src/HumanRoom.tsx");
  expect(button("Try again")).toBeUndefined();
  expect(reload).not.toHaveBeenCalled();
  await act(async () => button("Reload page").click());
  expect(reload).toHaveBeenCalledTimes(1);
});
it("recovers on route changes without remounting healthy page content", async () => {
  function Broken(): never {
    throw new Error("render failure");
  }
  await act(async () =>
    root.render(
      createElement(AppErrorBoundary, {
        resetKey: "/broken",
        children: createElement(Broken),
      }),
    ),
  );
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () =>
    root.render(
      createElement(AppErrorBoundary, {
        resetKey: "/profile",
        children: createElement("input", { "aria-label": "Unsaved draft" }),
      }),
    ),
  );
  const input = host.querySelector("input")!;
  input.value = "Keep this draft";
  await act(async () =>
    root.render(
      createElement(AppErrorBoundary, {
        resetKey: "/profile/other",
        children: createElement("input", { "aria-label": "Unsaved draft" }),
      }),
    ),
  );
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("Keep this draft");
});
