import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, expect, it } from "vitest";

import {
  clearCheckinDraft,
  getCheckinDraft,
  setCheckinDraft,
} from "@/src/state/checkinDraft";

describe("checkinDraft", () => {
  it("stores and restores a same-day local draft by patient and date", async () => {
    await setCheckinDraft({
      patientId: "patient-1",
      date: "2026-04-11",
      savedAt: 123,
      activeStep: 2,
      showRecoveryDetails: true,
      showDailyContext: false,
      pain: 4,
      symptomFlags: ["stiffness"],
      recovery: {
        exercisePercent: 60,
        difficultyLevel: 3,
        confidenceLevel: 4,
        mobilityLevel: 4,
      },
      adherence: {
        medicationStatus: "missed",
        medicationReason: "Forgot",
      },
      support: {
        mood: 4,
        stressLevel: 2,
        wantsExtraSupport: false,
        helpLevel: "none",
        safetyState: "safe",
      },
      dailySignals: {
        sleepHours: 7,
        sleepQuality: 4,
        sleepDisturbances: 1,
        hydrationLevel: 4,
        energyLevel: 4,
      },
      bodyMap: {
        selectedRegions: ["knee_left"],
        primaryRegion: "knee_left",
        selections: {
          knee_left: {
            intensity: 4,
            type: "ache",
          },
        },
      },
      notes: "Felt okay after rehab.",
    });

    await expect(getCheckinDraft("patient-1", "2026-04-11")).resolves.toMatchObject({
      patientId: "patient-1",
      date: "2026-04-11",
      activeStep: 2,
      recovery: {
        exercisePercent: 60,
        difficultyLevel: 3,
      },
      adherence: {
        medicationStatus: "missed",
        medicationReason: "Forgot",
      },
      notes: "Felt okay after rehab.",
    });
  });

  it("clears only the requested draft key", async () => {
    await AsyncStorage.setItem(
      "aura:checkinDraft:v1:patient-2:2026-04-11",
      JSON.stringify({ patientId: "patient-2", date: "2026-04-11", savedAt: 1 }),
    );
    await AsyncStorage.setItem(
      "aura:checkinDraft:v1:patient-2:2026-04-12",
      JSON.stringify({ patientId: "patient-2", date: "2026-04-12", savedAt: 2 }),
    );

    await clearCheckinDraft("patient-2", "2026-04-11");

    await expect(
      AsyncStorage.getItem("aura:checkinDraft:v1:patient-2:2026-04-11"),
    ).resolves.toBeNull();
    await expect(
      AsyncStorage.getItem("aura:checkinDraft:v1:patient-2:2026-04-12"),
    ).resolves.not.toBeNull();
  });
});
