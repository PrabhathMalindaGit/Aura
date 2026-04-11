import { describe, expect, it } from "vitest";

import {
  formatISOToHuman,
  formatPatientCardTimestamp,
  formatPatientChatTimestamp,
  formatPatientDueLabel,
  formatPatientDueTimestamp,
} from "@/src/utils/date";

describe("patient-safe date formatters", () => {
  const now = new Date("2026-04-11T10:30:00.000Z");

  it("formats card timestamps without exposing raw ISO strings", () => {
    expect(formatPatientCardTimestamp("2026-04-11T09:15:00.000Z", now)).toContain("Today at");
    expect(formatPatientCardTimestamp("2026-04-10T09:15:00.000Z", now)).toContain(
      "Yesterday at",
    );
  });

  it("formats chat timestamps for patient surfaces", () => {
    expect(formatPatientChatTimestamp("2026-04-11T09:15:00.000Z", now)).toBeTruthy();
    expect(formatPatientChatTimestamp("2026-04-09T09:15:00.000Z", now)).toContain("Apr 9");
  });

  it("formats due labels and details safely", () => {
    expect(formatPatientDueLabel("2026-04-11T16:00:00.000Z", now)).toBe("Due today");
    expect(formatPatientDueTimestamp("2026-04-11T16:00:00.000Z", now)).toContain(
      "Due today at",
    );
    expect(formatPatientDueLabel("2026-04-10T08:00:00.000Z", now)).toBe("Overdue");
    expect(formatPatientDueTimestamp("2026-04-10T08:00:00.000Z", now)).toContain("Was due");
  });

  it("falls back safely when an ISO string is invalid", () => {
    expect(formatISOToHuman("not-a-date")).toBe("Date unavailable");
  });
});
