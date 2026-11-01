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
    facilitator: "human",
    activeLanguage: "java",
    scheduledAt: "2026-10-30T09:00:00Z",
    topics: ["REST APIs"],
    questions: [] as any[],
    answers: [],
    drafts: {} as Record<string, string>,
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
  services: {
    face: true,
    objects: true,
    code: false,
    codePublicDemo: false,
    transcription: false,
  },
  problem: {
    id: "test-problem",
    title: "Add two numbers",
    difficulty: "Beginner",
    description: "Read two integers and print their sum.",
    constraints: "Whole numbers.",
    starter: {
      java: "// java solution",
      python: "print(sum(map(int, input().split())))",
    },
    examples: [{ input: "4 7", output: "11" }],
  },
  submissions: [] as any[],
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
  dateLabel: (value: string) => value,
  api: vi.fn(async (path: string) =>
    path === "/languages" ? [{ key: "java" }, { key: "python" }] : [],
  ),
  send: vi.fn(async (path: string, data?: any) => {
    if (path.endsWith("/code")) {
      const result = {
        _id: `submission-${fixture.submissions.length}`,
        interviewId: "room-fixture",
        code: data.code,
        language: data.language,
        mode: data.mode,
        runMode: data.runMode,
        total: 1,
        passed: 1,
        createdAt: "2026-10-30T12:00:00Z",
        results: [
          {
            statusId: 3,
            status: "Accepted",
            passed: true,
            hidden: false,
            input: "4 7",
            expectedOutput: data.runMode === "custom" ? undefined : "11",
            stdout: "11\n",
          },
        ],
      };
      fixture.submissions.unshift(result);
      return result;
    }
    return fixture.interview;
  }),
  useResource: (path: string, initial: unknown) => ({
    data: path.endsWith("/room")
      ? fixture.room
      : path === "/services"
        ? fixture.services
        : path.endsWith("/problem")
          ? fixture.problem
          : path.endsWith("/submissions")
            ? fixture.submissions
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
vi.mock("../src/room-updates", () => ({ useRoomUpdates: () => "connected" }));
vi.mock("../src/RoomMedia", () => ({
  MediaVideo: ({ label }: { label: string }) =>
    createElement("div", { "aria-label": label }),
  MicrophoneLevel: () => null,
  MonitoringSummary: () => null,
  LiveMonitoring: () => null,
}));
vi.mock("../src/InterviewMedia", () => ({ InterviewCapture: () => null }));
vi.mock("../src/RoomConversation", () => ({
  RoomConversation: () => createElement("p", null, "Interview questions"),
}));
vi.mock("../src/RoomDiagnostics", () => ({ RoomDiagnostics: () => null }));
vi.mock("../src/CalibratedGaze", () => ({ CalibratedGaze: () => null }));
vi.mock("../src/MonitoringReview", () => ({ EventReviewControls: () => null }));
vi.mock("../src/theme", () => ({ ThemeToggle: () => null }));
vi.mock("../src/CodingEditor", () => ({
  default: ({
    options,
    value,
  }: {
    options?: { readOnly?: boolean };
    value?: string;
  }) =>
    createElement(
      "div",
      { "data-read-only": options?.readOnly, "data-code-value": value },
      "Code editor",
    ),
}));
vi.mock("../src/RoomResume", () => ({
  default: () => createElement("div", null, "Resume document"),
}));

import HumanRoom from "../src/HumanRoom";
import Room from "../src/Room";
import { api, send } from "../src/api";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  fixture.face.mockClear();
  fixture.objects.mockClear();
  vi.mocked(send).mockClear();
  vi.mocked(api).mockClear();
  sessionStorage.clear();
  fixture.interview.type = "technical";
  fixture.interview.applicationId = "application-fixture";
  fixture.interview.facilitator = "human";
  fixture.interview.status = "live";
  fixture.interview.questions = [];
  fixture.interview.activeLanguage = "java";
  fixture.interview.drafts = {};
  fixture.room.activeLanguage = "java";
  fixture.services.code = false;
  fixture.services.codePublicDemo = false;
  fixture.services.transcription = false;
  fixture.submissions = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
async function enterCandidate() {
  await render("candidate");
  const consent = [...host.querySelectorAll('input[type="checkbox"]')].find(
    (node) =>
      node.parentElement?.textContent?.includes("I understand and consent"),
  ) as HTMLInputElement;
  await act(async () => consent.click());
  await act(async () => button("Enter waiting room").click());
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
it("keeps all live coding actions unavailable until a private runner is connected", async () => {
  await enterCandidate();
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    expect(button(label).disabled).toBe(true);
  expect(host.textContent).toContain("no results are simulated");
});
it("runs examples and custom input separately, submits all cases and reuses detailed results", async () => {
  fixture.services.code = true;
  await enterCandidate();
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    await act(async () => button(label).click());
  const requests = vi
    .mocked(send)
    .mock.calls.filter(([path]) => String(path).endsWith("/code"));
  expect(
    requests.map(([, data]) => ({
      mode: (data as any).mode,
      runMode: (data as any).runMode,
    })),
  ).toEqual([
    { mode: "run", runMode: "examples" },
    { mode: "run", runMode: "custom" },
    { mode: "submit", runMode: undefined },
  ]);
  expect(
    host.querySelector('[aria-label="Execution result"]')?.textContent,
  ).toContain("Full submission");
  expect(
    host.querySelector('[aria-label="Execution result"]')?.textContent,
  ).toContain("Expected output");
  const select = [...host.querySelectorAll("select")].find((s) =>
    s.parentElement?.textContent?.includes("Execution attempt"),
  )!;
  await act(async () => {
    select.value = "submission-1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    host.querySelector('[aria-label="Execution result"]')?.textContent,
  ).toContain("Custom input run");
  expect(
    host.querySelector('[aria-label="Execution result"]')?.textContent,
  ).toContain("Executed");
  expect(
    host.querySelector('[aria-label="Execution result"]')?.textContent,
  ).not.toContain("tests passed");
});
it("does not expose execution actions to HR even when a runner is configured", async () => {
  fixture.services.code = true;
  fixture.submissions = [
    {
      _id: "older-attempt",
      mode: "run",
      runMode: "custom",
      language: "python",
      code: "older code",
      createdAt: "2026-10-30T12:00:00Z",
      passed: 1,
      total: 1,
      results: [
        { status: "Accepted", statusId: 3, passed: true, hidden: false },
      ],
    },
  ];
  await render("hr");
  await act(async () => button("Open interview room").click());
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    expect(button(label)).toBeUndefined();
  expect(host.querySelector('[data-read-only="true"]')).not.toBeNull();
  expect(host.textContent).toContain(
    "Ask the candidate to run the current code",
  );
});
it("does not send a real interview's code to a public practice runner", async () => {
  fixture.services.code = true;
  fixture.services.codePublicDemo = true;
  await enterCandidate();
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    expect(button(label).disabled).toBe(true);
});
it("keeps a company-linked session blocked even when labelled practice", async () => {
  fixture.interview.type = "practice";
  fixture.services.code = true;
  fixture.services.codePublicDemo = true;
  fixture.role = "candidate";
  await act(async () =>
    root.render(createElement(MemoryRouter, null, createElement(Room))),
  );
  await act(async () => button("Start my practice").click());
  await act(async () => button("Coding exercise").click());
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    expect(button(label).disabled).toBe(true);
  expect(host.textContent).toContain(
    "The public demo cannot run candidate assessments",
  );
  expect(
    vi.mocked(send).mock.calls.some(([path]) => String(path).endsWith("/code")),
  ).toBe(false);
});
it("enables the public runner only in personal practice and shows its data-sharing notice", async () => {
  fixture.interview.type = "practice";
  fixture.interview.applicationId = "";
  fixture.services.code = true;
  fixture.services.codePublicDemo = true;
  fixture.role = "candidate";
  await act(async () =>
    root.render(createElement(MemoryRouter, null, createElement(Room))),
  );
  await act(async () => button("Start my practice").click());
  await act(async () => button("Coding exercise").click());
  expect(host.textContent).toContain("Public Judge0 runner");
  expect(host.textContent).toContain("submitted code may be stored");
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    expect(button(label).disabled).toBe(false);
  await act(async () => button("Run examples").click());
  expect(
    vi
      .mocked(send)
      .mock.calls.filter(([path]) => String(path).endsWith("/code")),
  ).toHaveLength(1);
});
it("uses the same checked example and full-submit results in AI practice without adding HR controls", async () => {
  fixture.interview.type = "practice";
  fixture.services.code = true;
  fixture.role = "candidate";
  await act(async () =>
    root.render(createElement(MemoryRouter, null, createElement(Room))),
  );
  await act(async () => button("Start my practice").click());
  await act(async () => button("Coding exercise").click());
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    await act(async () => button(label).click());
  const requests = vi
    .mocked(send)
    .mock.calls.filter(([path]) => String(path).endsWith("/code"));
  expect(
    requests.map(([, data]) => ({
      mode: (data as any).mode,
      runMode: (data as any).runMode,
    })),
  ).toEqual([
    { mode: "run", runMode: "examples" },
    { mode: "run", runMode: "custom" },
    { mode: "submit", runMode: undefined },
  ]);
  expect(host.querySelectorAll('[aria-label="Execution result"]')).toHaveLength(
    3,
  );
  expect(host.textContent).toContain("Expected output");
});
it("keeps HR's AI-interview editor read only without exposing candidate run controls", async () => {
  fixture.interview.facilitator = "ai";
  fixture.services.code = true;
  fixture.role = "hr";
  await act(async () =>
    root.render(createElement(MemoryRouter, null, createElement(Room))),
  );
  await act(async () => button("Join interview").click());
  await act(async () => button("Coding exercise").click());
  for (const label of ["Run examples", "Run custom input", "Submit solution"])
    expect(button(label)).toBeUndefined();
  expect(host.querySelector('[data-read-only="true"]')).not.toBeNull();
  expect(host.querySelector(".run-controls")).toBeNull();
});
it("restores the candidate's saved Python draft before autosaving instead of resetting the interview to Java", async () => {
  vi.useFakeTimers();
  fixture.interview.activeLanguage = "python";
  fixture.room.activeLanguage = "python";
  fixture.interview.drafts = { python: "print(12)", java: "KEEP_JAVA_DRAFT" };
  await enterCandidate();
  const language = [...host.querySelectorAll("select")].find((node) =>
    [...node.options].some((option) => option.value === "python"),
  )!;
  expect(language.value).toBe("python");
  expect(
    host.querySelector("[data-code-value]")?.getAttribute("data-code-value"),
  ).toBe("print(12)");
  await act(async () => vi.advanceTimersByTimeAsync(550));
  const saved = vi
    .mocked(api)
    .mock.calls.filter(([path]) => String(path).endsWith("/draft"))
    .map(([, options]) => JSON.parse(String(options?.body)));
  expect(saved).toEqual([{ code: "print(12)", language: "python" }]);
  // A resource refresh must not replace an initialized candidate's local editor.
  fixture.interview.drafts.python = "STALE_SERVER_SNAPSHOT";
  await render("candidate");
  expect(language.value).toBe("python");
  expect(
    host.querySelector("[data-code-value]")?.getAttribute("data-code-value"),
  ).toBe("print(12)");
});
it("keeps the language and its draft paired when switching after restoring a session", async () => {
  vi.useFakeTimers();
  fixture.interview.activeLanguage = "python";
  fixture.room.activeLanguage = "python";
  fixture.interview.drafts = { python: "print(12)", java: "KEEP_JAVA_DRAFT" };
  await enterCandidate();
  const language = [...host.querySelectorAll("select")].find((node) =>
    [...node.options].some((option) => option.value === "python"),
  )!;
  await act(async () => {
    language.value = "java";
    language.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(550));
  const saved = vi
    .mocked(api)
    .mock.calls.filter(([path]) => String(path).endsWith("/draft"))
    .map(([, options]) => JSON.parse(String(options?.body)));
  expect(saved).toEqual([{ code: "KEEP_JAVA_DRAFT", language: "java" }]);
  await act(async () => {
    language.value = "python";
    language.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    host.querySelector("[data-code-value]")?.getAttribute("data-code-value"),
  ).toBe("print(12)");
});

class SpeechRecorder {
  static instances: SpeechRecorder[] = [];
  static failure: "" | "start" | "construct" = "";
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    if (SpeechRecorder.failure === "construct")
      throw new Error("Recorder construction failed");
    SpeechRecorder.instances.push(this);
  }
  start() {
    if (SpeechRecorder.failure === "start")
      throw new Error("Recorder startup failed");
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({
        data: new Blob(["synthetic microphone bytes"]),
      });
      this.onstop?.();
    });
  }
}
async function spokenPractice() {
  SpeechRecorder.instances = [];
  SpeechRecorder.failure = "";
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  });
  vi.stubGlobal("MediaRecorder", SpeechRecorder);
  fixture.interview.type = "practice";
  fixture.interview.questions = [
    { id: "q1", text: "Explain transactions.", topic: "Databases", rubric: [] },
    { id: "q2", text: "Explain isolation.", topic: "Databases", rubric: [] },
  ];
  fixture.services.transcription = true;
  fixture.role = "candidate";
  await act(async () =>
    root.render(createElement(MemoryRouter, null, createElement(Room))),
  );
  await act(async () => button("Start my practice").click());
  return track;
}
it.each(["construct", "start"] as const)(
  "closes the practice microphone after recorder %s failure",
  async (failure) => {
    const track = await spokenPractice();
    SpeechRecorder.failure = failure;
    await act(async () => button("Record spoken answer").click());
    expect(track.stop).toHaveBeenCalled();
    expect(host.textContent).toContain(
      failure === "start"
        ? "Recorder startup failed"
        : "Recorder construction failed",
    );
    expect(button("Record spoken answer").disabled).toBe(false);
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([path]) => String(path).endsWith("/transcribe")),
    ).toBe(false);
  },
);
it("keeps practice speech attached to its question and does not transcribe recorder-error fragments", async () => {
  const track = await spokenPractice();
  await act(async () => button("Record spoken answer").click());
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="Question 2"]')!
      .disabled,
  ).toBe(true);
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="Your answer"]')!
      .disabled,
  ).toBe(true);
  await act(async () => SpeechRecorder.instances[0].onerror?.());
  expect(track.stop).toHaveBeenCalled();
  expect(host.textContent).toContain("Audio capture stopped");
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([path]) => String(path).endsWith("/transcribe")),
  ).toBe(false);
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="Question 2"]')!
      .disabled,
  ).toBe(false);
});
it("ignores a practice transcript arriving after the interview ends", async () => {
  await spokenPractice();
  let resolve!: (value: { text: string }) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  await act(async () => button("Record spoken answer").click());
  await act(async () => button("Stop & transcribe").click());
  fixture.interview.status = "completed";
  await act(async () =>
    root.render(createElement(MemoryRouter, null, createElement(Room))),
  );
  await act(async () =>
    resolve({ text: "Late transcription must not overwrite an answer." }),
  );
  expect(host.textContent).not.toContain(
    "Late transcription must not overwrite an answer",
  );
  expect(host.textContent).not.toContain(
    "I reviewed and corrected the transcription",
  );
});
