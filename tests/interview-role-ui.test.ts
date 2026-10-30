// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  role: "hr",
  interview: {
    _id: "room-fixture",
    applicationId: "application-fixture",
    candidateName: "Test Candidate",
    companyName: "Test Company",
    jobTitle: "Backend Intern",
    duration: 45,
    type: "technical",
    difficulty: "Beginner",
    status: "live",
    scheduledAt: "2026-10-30T09:00:00Z",
    topics: ["REST APIs"],
    questions: [],
    answers: [],
    drafts: {},
  },
  room: {
    interviewerName: "Test HR",
    candidateName: "Test Candidate",
    cameraAccommodation: false,
    screenRequired: false,
    entireScreen: false,
    faceConsent: false,
    objectConsent: false,
    resumeId: "resume-fixture",
    resumeName: "Submitted resume",
    activeLanguage: "java",
    admittedAt: "2026-10-30T09:00:00Z",
  },
  face: vi.fn(),
  objects: vi.fn(),
}));
vi.mock("../src/auth-context", () => ({
  useAuth: () => ({
    user: {
      role: fixture.role,
      name: fixture.role === "hr" ? "Test HR" : "Test Candidate",
    },
  }),
}));
vi.mock("../src/api", () => ({
  api: vi.fn(async () => []),
  send: vi.fn(async () => fixture.interview),
  useResource: (path: string, initial: unknown) => ({
    data: path.endsWith("/room")
      ? fixture.room
      : path === "/services"
        ? { face: true, objects: true }
        : path.endsWith("/room/resumes")
          ? { resumes: [], recommendedId: "submitted-resume-fixture" }
          : /^\/interviews\/[^/]+$/.test(path)
            ? fixture.interview
            : initial,
    loading: false,
    error: "",
    reload: vi.fn(async () => {}),
    setData: vi.fn(),
  }),
}));
vi.mock("../src/interview-devices", () => ({
  useInterviewDevices: () => ({
    stream: null,
    screen: null,
    camera: true,
    mic: true,
    message: "Devices ready",
    check: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    stopScreen: vi.fn(),
    cancelRequest: vi.fn(),
  }),
}));
vi.mock("../src/live-call", () => ({
  useLiveCall: () => ({
    connection: "connected",
    stats: {},
    remote: null,
    remoteMedia: {},
    reconnect: vi.fn(),
  }),
}));
vi.mock("../src/monitoring", () => ({
  useMonitoring: () => ({
    record: vi.fn(),
    setConnection: vi.fn(),
    delivery: "saved",
    warningThreshold: 3,
    tabDepartures: 0,
    permissionDialog: (work: () => unknown) => work(),
    flush: vi.fn(async () => {}),
  }),
}));
vi.mock("../src/face-presence", () => ({
  useFacePresence: (options: unknown) => {
    fixture.face(options);
    return { status: "Face check off", state: "off", count: 0, retry: vi.fn() };
  },
}));
vi.mock("../src/object-detection", () => ({
  useObjectDetection: (options: unknown) => {
    fixture.objects(options);
    return {
      status: "Object check off",
      state: "off",
      ready: false,
      detections: [],
      frameAspect: 1,
      retry: vi.fn(),
    };
  },
}));
vi.mock("../src/ObjectDetectionControls", () => ({
  useObjectConsent: () => ({ enabled: false }),
  ObjectDetectionControls: () =>
    createElement("div", null, "Optional phone and book check"),
  ObjectDetectionOverlay: () => null,
  ObjectDetectionLabels: () => null,
}));
vi.mock("../src/draft-sync", () => ({ useDraftSync: () => "Saved" }));
vi.mock("../src/room-updates", () => ({ useRoomUpdates: () => "connected" }));
vi.mock("../src/RoomMedia", () => ({
  MediaVideo: ({ label }: { label: string }) =>
    createElement("div", { "aria-label": label }),
  MicrophoneLevel: () => null,
  MonitoringSummary: () => null,
}));
vi.mock("../src/InterviewMedia", () => ({ InterviewCapture: () => null }));
vi.mock("../src/RoomConversation", () => ({
  RoomConversation: () => createElement("p", null, "Interview questions"),
}));
vi.mock("../src/RoomDiagnostics", () => ({ RoomDiagnostics: () => null }));
vi.mock("../src/CalibratedGaze", () => ({ CalibratedGaze: () => null }));
vi.mock("../src/MonitoringReview", () => ({ EventReviewControls: () => null }));
vi.mock("../src/CodeExecutionNotice", () => ({
  CodeExecutionNotice: () => null,
}));
vi.mock("../src/theme", () => ({ ThemeToggle: () => null }));
vi.mock("../src/CodingEditor", () => ({
  default: () => createElement("div", null, "Code editor"),
}));
vi.mock("../src/RoomResume", () => ({
  default: () => createElement("div", null, "Resume document"),
}));

import HumanRoom from "../src/HumanRoom";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.face.mockClear();
  fixture.objects.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(role: string) {
  fixture.role = role;
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(HumanRoom, { id: "room-fixture" }),
      ),
    ),
  );
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  )!;
}

it("gives HR a simple device setup and never enables analysis of the HR camera", async () => {
  await render("hr");
  expect(host.textContent).toContain("Prepare to interview your candidate");
  expect(host.textContent).toContain("Your interview workflow");
  expect(host.textContent).not.toContain("Optional face presence check");
  expect(host.textContent).not.toContain("Optional phone and book check");
  expect(host.textContent).not.toContain("I understand and consent");
  expect(
    fixture.face.mock.calls.every(([options]) => options.enabled === false),
  ).toBe(true);
  expect(
    fixture.objects.mock.calls.every(([options]) => options.enabled === false),
  ).toBe(true);
});
it("gives candidates their own steps, monitoring notice and camera checks without HR policy controls", async () => {
  await render("candidate");
  expect(host.textContent).toContain("Prepare for your interview");
  expect(host.textContent).toContain("What you will do");
  expect(host.textContent).toContain("Your camera checks");
  expect(host.textContent).toContain("Optional phone and book check");
  expect(button("Use resume submitted for this job")).toBeDefined();
  const alternate = [...host.querySelectorAll("details")].find(
    (node) =>
      node.querySelector("summary")?.textContent ===
      "Use another resume (optional)",
  );
  expect(alternate?.open).toBe(false);
  expect(host.textContent).toContain("original application stay unchanged");
  expect(host.textContent).not.toContain("Approve camera accommodation");
  expect(host.textContent).not.toContain("Review assigned application");
});
it("gives live HR monitoring, code review and private notes while keeping candidate controls out", async () => {
  await render("hr");
  await act(async () => button("Open interview room").click());
  expect(host.textContent).toContain("INTERVIEWER WORKSPACE");
  expect(host.textContent).toContain("Review candidate code");
  expect(host.textContent).toContain("Candidate monitoring");
  expect(host.textContent).toContain("Candidate camera checks");
  expect(host.textContent).toContain("Private interviewer notes");
  expect(button("Run code")).toBeUndefined();
  expect(button("Share screen")).toBeUndefined();
  expect(button("Camera checks")).toBeUndefined();
  expect(host.querySelectorAll('input[type="checkbox"]').length).toBe(0);
});
it("keeps live candidate tasks free of HR private notes and review controls", async () => {
  await render("candidate");
  const consent = [...host.querySelectorAll('input[type="checkbox"]')].find(
    (node) =>
      node.parentElement?.textContent?.includes("I understand and consent"),
  ) as HTMLInputElement;
  await act(async () => consent.click());
  await act(async () => button("Enter waiting room").click());
  expect(host.textContent).toContain("CANDIDATE WORKSPACE");
  expect(host.textContent).toContain("Coding task");
  expect(host.textContent).not.toContain("Private interviewer notes");
  expect(host.textContent).not.toContain("Send candidate an instruction");
  expect(button("Share screen")).toBeDefined();
  expect(button("Camera checks")).toBeDefined();
  expect(button("End for everyone")).toBeUndefined();
});
