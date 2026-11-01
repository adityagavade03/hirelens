// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountSecurityPanel } from "../src/AccountFeatures";

const fixture = vi.hoisted(() => ({
  data: { sms: false, messagePreview: false },
  loading: false,
  error: "",
  send: vi.fn(async () => ({ message: "Verification requested." })),
}));
vi.mock("../src/App", () => ({ Brand: () => null }));
vi.mock("../src/api", () => ({
  send: fixture.send,
  useResource: () => fixture,
}));
vi.mock("../src/auth-context", () => ({
  useAuth: () => ({
    user: { email: "synthetic@example.test", emailVerifiedAt: "2026-10-31" },
    refresh: async () => {},
  }),
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.data = { sms: false, messagePreview: false };
  fixture.loading = false;
  fixture.error = "";
  fixture.send.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      createElement(MemoryRouter, null, createElement(AccountSecurityPanel)),
    ),
  );
function form() {
  return host.querySelector('input[name="phone"]')!.closest("form")!;
}

it("shows the missing SMS service and blocks even a directly dispatched phone form submission", async () => {
  await render();
  expect(form().querySelector("button")!.disabled).toBe(true);
  expect(host.textContent).toContain("SMS delivery is not connected yet");
  await act(async () =>
    form().dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(fixture.send).not.toHaveBeenCalled();
});

it("keeps phone verification disabled while checking availability or after a failed status request", async () => {
  fixture.data.sms = true;
  fixture.loading = true;
  await render();
  expect(host.textContent).toContain("Checking SMS availability");
  expect(form().querySelector("button")!.disabled).toBe(true);
  fixture.loading = false;
  fixture.error = "Service status could not be loaded.";
  await render();
  expect(host.textContent).toContain(fixture.error);
  expect(host.textContent).not.toContain("SMS delivery is not connected yet");
  expect(form().querySelector("button")!.disabled).toBe(true);
});

it.each([false, true])(
  "requests phone verification when configured, preview=%s",
  async (messagePreview) => {
    fixture.data = { sms: true, messagePreview };
    await render();
    const input = form().querySelector("input")!;
    input.value = "+919876543210";
    expect(form().querySelector("button")!.disabled).toBe(false);
    await act(async () =>
      form().dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(fixture.send).toHaveBeenCalledWith(
      "/account/verify-phone",
      { phone: "+919876543210" },
      "POST",
    );
    expect(host.textContent).toContain("Verification requested.");
    if (messagePreview)
      expect(host.textContent).toContain("No email or SMS is sent.");
  },
);
