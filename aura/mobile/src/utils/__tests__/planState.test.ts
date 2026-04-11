import { describe, expect, it } from "vitest";

import type { TodayPlanResponse } from "@/src/api/patient";
import { derivePlanUiState } from "@/src/utils/planState";

const baseResponse: TodayPlanResponse = {
  ok: true,
  patientId: "patient-1",
  date: "2026-04-11",
  dayOfWeek: 6,
  plan: {
    title: "Knee recovery",
    daysOfWeek: [1, 3, 5],
    items: [
      {
        key: "heel-slides",
        name: "Heel slides",
        instructions: "Slide your heel in and out.",
        order: 1,
      },
    ],
    version: 3,
    updatedAt: "2026-04-10T09:00:00.000Z",
  },
};

describe("derivePlanUiState", () => {
  it("returns no_plan_yet when no plan document exists", () => {
    expect(
      derivePlanUiState({
        response: { ...baseResponse, plan: null },
        activeSession: null,
        pendingSessions: [],
      }).kind,
    ).toBe("no_plan_yet");
  });

  it("treats a plan with no scheduled items as assigned rest-day truth", () => {
    const state = derivePlanUiState({
      response: {
        ...baseResponse,
        plan: {
          ...baseResponse.plan!,
          items: [],
        },
      },
      activeSession: null,
      pendingSessions: [],
    });

    expect(state.kind).toBe("assigned");
    expect(state.restDay).toBe(true);
    expect(state.description).toContain("Nothing is scheduled for today");
  });

  it("surfaces an in-progress session only when it matches today’s plan on this device", () => {
    const state = derivePlanUiState({
      response: baseResponse,
      activeSession: {
        patientId: "patient-1",
        date: "2026-04-11",
        planVersion: 3,
        planTitle: "Knee recovery",
        startedAt: "2026-04-11T08:00:00.000Z",
        status: "in_progress",
        exercises: [],
        updatedAt: 1,
      },
      pendingSessions: [],
    });

    expect(state.kind).toBe("in_progress");
    expect(state.primaryActionLabel).toBe("Open session");
  });

  it("marks the plan complete when a queued local session exists for today’s plan", () => {
    const state = derivePlanUiState({
      response: baseResponse,
      activeSession: null,
      pendingSessions: [
        {
          localId: "pending-1",
          createdAt: "2026-04-11T09:00:00.000Z",
          payload: {
            startedAt: "2026-04-11T08:15:00.000Z",
            endedAt: "2026-04-11T08:45:00.000Z",
            planVersion: 3,
            planTitle: "Knee recovery",
            exercises: [],
          },
        },
      ],
    });

    expect(state.kind).toBe("complete");
    expect(state.statusLabel).toBe("Complete");
  });
});
