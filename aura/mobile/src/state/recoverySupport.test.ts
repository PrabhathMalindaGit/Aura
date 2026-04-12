import { describe, expect, it } from "vitest";

import {
  canPatientUseCheckin,
  canPatientUseMessages,
  canPatientUsePlan,
  getCareModeNotice,
  getPatientCareMode,
} from "@/src/state/recoverySupport";
import type { Patient } from "@/src/types/models";

function createPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "patient-1",
    displayName: "Patient One",
    ...overrides,
  };
}

describe("recoverySupport state helpers", () => {
  it("derives active mode by default", () => {
    const patient = createPatient({ status: "active" });

    expect(getPatientCareMode(patient)).toBe("active");
    expect(canPatientUseCheckin(patient)).toBe(true);
    expect(canPatientUseMessages(patient)).toBe(true);
    expect(canPatientUsePlan(patient)).toBe(true);
    expect(getCareModeNotice(patient)).toBeNull();
  });

  it("keeps check-ins available but disables routine messaging and plan actions in independent mode", () => {
    const patient = createPatient({
      status: "discharged",
      discharge: {
        independentModeEnabled: true,
      },
    });

    expect(getPatientCareMode(patient)).toBe("independent");
    expect(canPatientUseCheckin(patient)).toBe(true);
    expect(canPatientUseMessages(patient)).toBe(false);
    expect(canPatientUsePlan(patient)).toBe(false);
    expect(getCareModeNotice(patient)).toMatchObject({
      title: "Independent recovery mode",
    });
  });

  it("treats discharged care as read-only for check-ins, messages, and plan actions", () => {
    const patient = createPatient({
      status: "discharged",
      discharge: {
        independentModeEnabled: false,
      },
    });

    expect(getPatientCareMode(patient)).toBe("discharged");
    expect(canPatientUseCheckin(patient)).toBe(false);
    expect(canPatientUseMessages(patient)).toBe(false);
    expect(canPatientUsePlan(patient)).toBe(false);
    expect(getCareModeNotice(patient)).toMatchObject({
      title: "Care program completed",
    });
  });

  it("treats inactive accounts as archive-only", () => {
    const patient = createPatient({ status: "inactive" });

    expect(getPatientCareMode(patient)).toBe("inactive");
    expect(canPatientUseCheckin(patient)).toBe(false);
    expect(canPatientUseMessages(patient)).toBe(false);
    expect(canPatientUsePlan(patient)).toBe(false);
    expect(getCareModeNotice(patient)).toMatchObject({
      title: "Archive view",
    });
  });
});
