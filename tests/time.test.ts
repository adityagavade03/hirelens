import { describe, it, expect } from "vitest";
import { wallTime, zonedTimeToUtc } from "../shared/time";
describe("Timezone-aware interview scheduling", () => {
  it("stores an Indian wall time as the right UTC instant", () => {
    expect(zonedTimeToUtc("2026-10-01T15:30", "Asia/Kolkata")).toBe(
      "2026-10-01T10:00:00.000Z",
    );
  });
  it("handles New York winter and summer offsets", () => {
    expect(zonedTimeToUtc("2026-01-15T09:00", "America/New_York")).toBe(
      "2026-01-15T14:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-07-15T09:00", "America/New_York")).toBe(
      "2026-07-15T13:00:00.000Z",
    );
  });
  it("rejects nonexistent spring-forward and ambiguous fall-back times", () => {
    expect(() =>
      zonedTimeToUtc("2026-03-08T02:30", "America/New_York"),
    ).toThrow("does not exist");
    expect(() =>
      zonedTimeToUtc("2026-11-01T01:30", "America/New_York"),
    ).toThrow("occurs twice");
  });
  it("round-trips an instant in another timezone", () => {
    const instant = "2026-10-01T10:00:00.000Z";
    expect(
      zonedTimeToUtc(wallTime(new Date(instant), "Asia/Tokyo"), "Asia/Tokyo"),
    ).toBe(instant);
  });
});
