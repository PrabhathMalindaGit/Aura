import { describe, expect, it } from "vitest";

import type { PromDueCard } from "@/src/api/patient";
import type { ReminderReadState } from "@/src/types/reminder";
import type { PatientTaskItem } from "@/src/types/task";
import { buildReminderItems } from "@/src/utils/reminders";

const EMPTY_READ_STATE: ReminderReadState = {
  readById: {},
  updatedAt: 0,
};

describe("buildReminderItems PROM follow-through", () => {
  it("creates stable PROM reminder ids and direct PROM fill deep links", () => {
    const dueProms: PromDueCard[] = [
      {
        id: "prom-1",
        templateKey: "koos",
        title: "KOOS",
        dueAt: "2026-03-10T08:00:00.000Z",
        status: "due",
      },
    ];

    const firstPass = buildReminderItems(
      [],
      [],
      dueProms,
      EMPTY_READ_STATE,
      new Date("2026-03-09T12:00:00.000Z"),
    );

    expect(firstPass).toHaveLength(1);
    expect(firstPass[0].id).toBe("prom:prom-1:2026-03-10T08:00:00.000Z");
    expect(firstPass[0].sourceType).toBe("prom");
    expect(firstPass[0].linkedRoute).toEqual({
      pathname: "/prom-fill",
      params: { promId: "prom-1" },
    });

    const secondPass = buildReminderItems(
      [],
      [],
      dueProms,
      {
        readById: {
          [firstPass[0].id]: Date.now(),
        },
        updatedAt: Date.now(),
      },
      new Date("2026-03-09T12:00:00.000Z"),
    );

    expect(secondPass[0].id).toBe(firstPass[0].id);
    expect(secondPass[0].unread).toBe(false);
  });

  it("elevates overdue PROM reminders ahead of later due reminders", () => {
    const dueProms: PromDueCard[] = [
      {
        id: "prom-overdue",
        templateKey: "lefs",
        title: "LEFS",
        dueAt: "2026-03-07T08:00:00.000Z",
        status: "due",
      },
      {
        id: "prom-soon",
        templateKey: "promis",
        title: "PROMIS Function",
        dueAt: "2026-03-10T18:00:00.000Z",
        status: "due",
      },
    ];

    const reminders = buildReminderItems(
      [],
      [],
      dueProms,
      EMPTY_READ_STATE,
      new Date("2026-03-09T12:00:00.000Z"),
    );

    expect(reminders.map((item) => item.linkedEntityId)).toEqual(["prom-overdue", "prom-soon"]);
    expect(reminders[0].status).toBe("overdue");
    expect(reminders[0].group).toBe("attention");
    expect(reminders[1].status).toBe("due");
    expect(reminders[1].group).toBe("soon");
  });

  it("groups duplicate communication workflows into one patient reminder", () => {
    const tasks: PatientTaskItem[] = [
      {
        id: "task-urgent",
        title: "Urgent message follow-up",
        description:
          "Patient One has a message without clinician response since 2026-03-09T08:00:00.000Z",
        type: "communication",
        priority: "urgent",
        status: "open",
        dueAt: "2026-03-09T13:00:00.000Z",
        createdAt: "2026-03-09T08:00:00.000Z",
        updatedAt: "2026-03-09T08:10:00.000Z",
        sourceLabel: "Communication no-response escalation",
        linkedMessageId: "thread-1",
        patientCompletable: false,
        patientAction: {
          kind: "chat",
          label: "Reply in chat",
        },
      },
      {
        id: "task-duplicate",
        title: "Message follow-up",
        description:
          "Patient One has a message without clinician response since 2026-03-09T09:00:00.000Z",
        type: "communication",
        priority: "high",
        status: "open",
        dueAt: "2026-03-09T16:00:00.000Z",
        createdAt: "2026-03-09T09:00:00.000Z",
        updatedAt: "2026-03-09T09:05:00.000Z",
        sourceLabel: "Communication no-response escalation",
        linkedMessageId: "thread-1",
        patientCompletable: false,
        patientAction: {
          kind: "chat",
          label: "Reply in chat",
        },
      },
    ];

    const reminders = buildReminderItems(
      tasks,
      [],
      [],
      EMPTY_READ_STATE,
      new Date("2026-03-09T12:00:00.000Z"),
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0].linkedEntityId).toBe("task-urgent");
    expect(reminders[0].title).toBe("Please reply to your care team");
    expect(reminders[0].message).toBe(
      "Your care team is waiting for a reply. Open chat when you can.",
    );
    expect(reminders[0].chips).toEqual(["Due today", "Care team message"]);
    expect(reminders[0].timingLabel).toContain("Due today at");
    expect(reminders[0].message).not.toContain("2026-03-09T08:00:00.000Z");
  });
});
