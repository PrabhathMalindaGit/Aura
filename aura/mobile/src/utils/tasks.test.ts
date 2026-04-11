import { describe, expect, it } from "vitest";

import type { PatientTaskItem } from "@/src/types/task";
import {
  formatPatientTaskSourceLabel,
  formatTaskSupportText,
  formatTaskTitle,
  groupTasksByPatientIntent,
} from "@/src/utils/tasks";

const communicationTask = (
  overrides: Partial<PatientTaskItem> = {},
): PatientTaskItem => ({
  id: "task-1",
  title: "Urgent message follow-up",
  description:
    "Patient One has a message without clinician response since 2026-04-11T08:00:00.000Z",
  type: "communication",
  priority: "urgent",
  status: "open",
  dueAt: "2026-04-11T12:00:00.000Z",
  createdAt: "2026-04-11T08:00:00.000Z",
  updatedAt: "2026-04-11T08:10:00.000Z",
  sourceLabel: "Communication no-response escalation",
  linkedMessageId: "thread-1",
  patientCompletable: false,
  patientAction: {
    kind: "chat",
    label: "Reply in chat",
  },
  ...overrides,
});

describe("task copy normalization", () => {
  it("normalizes communication titles, text, and source labels for patient surfaces", () => {
    const task = communicationTask();

    expect(formatTaskTitle(task)).toBe("Please reply to your care team");
    expect(formatTaskSupportText(task)).toBe(
      "Your care team is waiting for a reply. Open chat when you can.",
    );
    expect(formatPatientTaskSourceLabel(task)).toBe("Care team message");
  });

  it("does not leak raw ISO timestamps in patient-facing task text", () => {
    const task = communicationTask();

    expect(formatTaskSupportText(task)).not.toContain("2026-04-11T08:00:00.000Z");
  });

  it("groups tasks that point to the same unresolved communication issue", () => {
    const grouped = groupTasksByPatientIntent([
      communicationTask(),
      communicationTask({
        id: "task-2",
        priority: "high",
        dueAt: "2026-04-11T14:00:00.000Z",
        updatedAt: "2026-04-11T09:00:00.000Z",
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe("task-1");
  });
});
