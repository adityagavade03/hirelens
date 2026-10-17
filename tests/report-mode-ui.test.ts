// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "in_person", role: "hr" }));
vi.mock("../src/auth-context", () => ({
  useAuth: () => ({ user: { _id: "hr", role: state.role } }),
}));
vi.mock("../src/api", async (original) => ({
  ...(await original<typeof import("../src/api")>()),
  useResource: (path: string) => ({
    loading: false,
    error: "",
    reload: async () => {},
    data:
      path === "/analytics/performance"
        ? {
            rows: [
              {
                reportId: "report",
                jobTitle: "Frontend Developer",
                candidateName: "Candidate",
                date: "2026-10-18T10:00:00Z",
                mode: state.mode,
                humanRatings: {
                  technical: 4,
                  problemSolving: 4,
                  communication: 3,
                },
                technical: 80,
                coding: 70,
                problemSolving: 60,
                communication: 90,
                decision: "pending",
                stale: false,
              },
            ],
          }
        : {
            report: {
              _id: "report",
              interviewId: "interview",
              summary: "Explained React components clearly.",
              decision: "pending",
              finalized: false,
              released: false,
              ratings: { technical: 4, communication: 3, problemSolving: 4 },
            },
            interview: {
              _id: "interview",
              candidateName: "Candidate",
              jobTitle: "Frontend Developer",
              scheduledAt: "2026-10-18T10:00:00Z",
              type: "technical",
              mode: state.mode,
              venue: "Interview room A",
              notes: "Private observation for hiring team",
              questions: [
                {
                  id: "q",
                  text: "Explain React state",
                  rubric: ["Correctness"],
                  source: "curated",
                },
              ],
              answers: [],
            },
            application: {
              match: {
                score: 90,
                method: "Reviewed resume match",
                matching: ["React"],
                missing: [],
                evidence: [],
              },
            },
            submissions: [],
            events: [],
            coding: null,
            integrity: null,
            assessmentStale: false,
          },
  }),
}));
vi.mock("../src/Assessment", () => ({
  AssessmentPanel: () => "Online AI assessment",
  PerformanceHistory: () => null,
}));
vi.mock("../src/CodeHistory", () => ({ CodeHistory: () => "Coding process" }));
vi.mock("../src/InterviewMedia", () => ({
  MediaReview: () => "Recording and transcript",
  SimilarityPanel: () => "Code similarity",
}));
vi.mock("../src/ProctoringSummary", () => ({
  ProctoringSummary: () => "AI proctoring summary",
}));
import { ReportPage } from "../src/management";
const { PerformanceHistory } =
  await vi.importActual<typeof import("../src/Assessment")>(
    "../src/Assessment",
  );

function render() {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/reports/report"] },
      createElement(ReportPage),
    ),
  );
}
it("keeps human ratings, notes and resume evidence for in-person reports without online-only panels", () => {
  state.mode = "in_person";
  state.role = "hr";
  const html = render();
  expect(html).toContain("Your assessment");
  expect(html).toContain('name="ratingTechnical"');
  expect(html).toContain('name="ratingCommunication"');
  expect(html).toContain('name="ratingProblemSolving"');
  expect(html).toContain("Private observation for hiring team");
  expect(html).toContain("Résumé evidence");
  expect(html).toContain("Interview question guide");
  for (const label of [
    "Online AI assessment",
    "Coding process",
    "Coding evidence",
    "Recording and transcript",
    "Code similarity",
    "Monitoring timeline",
    "AI proctoring summary",
    "No answer submitted",
  ])
    expect(html).not.toContain(label);
});
it("preserves online evidence panels for video reports", () => {
  state.mode = "video";
  state.role = "hr";
  const html = render();
  for (const label of [
    "Online AI assessment",
    "Coding process",
    "Coding evidence",
    "Recording and transcript",
    "Code similarity",
    "Monitoring timeline",
    "AI proctoring summary",
  ])
    expect(html).toContain(label);
  expect(html).toContain('name="ratingTechnical"');
});
it("keeps private notes out of the candidate's in-person report", () => {
  state.mode = "in_person";
  state.role = "candidate";
  const html = render();
  expect(html).toContain("Review summary");
  expect(html).toContain("Human ratings (out of 5)");
  expect(html).not.toContain("Private observation for hiring team");
  expect(html).not.toContain('name="ratingTechnical"');
});
it("shows explicit human ratings and non-applicable coding for in-person performance history", () => {
  state.mode = "in_person";
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(PerformanceHistory)),
  );
  expect(html.match(/Human: 4\/5/g)).toHaveLength(2);
  expect(html).toContain("Human: 3/5");
  expect(html).toContain("Not applicable");
  expect(html).not.toContain("80%");
});
it("preserves AI percentages in video performance history", () => {
  state.mode = "video";
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(PerformanceHistory)),
  );
  for (const value of ["80%", "70%", "60%", "90%"])
    expect(html).toContain(value);
  expect(html).not.toContain("Human:");
  expect(html).not.toContain("Not applicable");
});
