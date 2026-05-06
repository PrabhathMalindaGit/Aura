import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseGuidedCheckinExerciseAdherence,
  parseGuidedCheckinMedicationStatus,
  parseGuidedCheckinMoodScore,
  parseGuidedCheckinNotesTranscript,
  parseGuidedCheckinPainScore,
  parseGuidedCheckinSleepHours,
  parseGuidedCheckinSleepQuality,
  type GuidedCheckinMedicationStatus,
  type GuidedCheckinParseResult,
} from "@/src/utils/guidedCheckinParser";

function expectNumberSuccess(
  result: GuidedCheckinParseResult<number>,
  value: number,
  confidence: "exact" | "normalized" = "exact",
) {
  expect(result).toEqual({ ok: true, value, confidence });
}

function expectMedicationSuccess(
  result: GuidedCheckinParseResult<GuidedCheckinMedicationStatus>,
  value: GuidedCheckinMedicationStatus,
  confidence: "exact" | "normalized" = "exact",
) {
  expect(result).toEqual({ ok: true, value, confidence });
}

function expectFailure(result: GuidedCheckinParseResult<unknown>) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason.length).toBeGreaterThan(0);
  }
}

describe("guided check-in parser", () => {
  describe("parseGuidedCheckinPainScore", () => {
    it.each([
      ["zero", 0, "normalized"],
      ["no pain", 0, "normalized"],
      ["three", 3, "normalized"],
      ["3", 3, "exact"],
      ["seven out of ten", 7, "normalized"],
      ["10/10", 10, "exact"],
    ] as const)("accepts %s as pain %i", (transcript, value, confidence) => {
      expectNumberSuccess(parseGuidedCheckinPainScore(transcript), value, confidence);
    });

    it.each(["a lot", "bad", "worse than yesterday", "11", "-1", "eleven out of ten"])(
      "rejects unclear or out-of-range pain phrase %s",
      (transcript) => {
        expectFailure(parseGuidedCheckinPainScore(transcript));
      },
    );
  });

  describe("parseGuidedCheckinMoodScore", () => {
    it.each([
      ["one", 1, "normalized"],
      ["1", 1, "exact"],
      ["very low", 1, "normalized"],
      ["low", 2, "normalized"],
      ["okay", 3, "normalized"],
      ["strong", 4, "normalized"],
      ["very strong", 5, "normalized"],
      ["5", 5, "exact"],
    ] as const)("accepts %s as mood %i", (transcript, value, confidence) => {
      expectNumberSuccess(parseGuidedCheckinMoodScore(transcript), value, confidence);
    });

    it.each(["sad", "fine I guess", "ten", "not sure", "0", "6"])(
      "rejects unclear or out-of-range mood phrase %s",
      (transcript) => {
        expectFailure(parseGuidedCheckinMoodScore(transcript));
      },
    );
  });

  describe("parseGuidedCheckinExerciseAdherence", () => {
    it.each([
      ["none", 0, "normalized"],
      ["all", 100, "normalized"],
      ["completed", 100, "normalized"],
      ["half", 50, "normalized"],
      ["80 percent", 80, "exact"],
      ["8 out of 10", 80, "normalized"],
      ["0 percent", 0, "exact"],
      ["100 percent", 100, "exact"],
    ] as const)("accepts %s as exercise percent %i", (transcript, value, confidence) => {
      expectNumberSuccess(parseGuidedCheckinExerciseAdherence(transcript), value, confidence);
    });

    it.each(["some", "a little", "more than yesterday", "I tried", "101 percent", "-1 percent"])(
      "rejects vague or out-of-range exercise phrase %s",
      (transcript) => {
        expectFailure(parseGuidedCheckinExerciseAdherence(transcript));
      },
    );
  });

  describe("parseGuidedCheckinMedicationStatus", () => {
    it.each([
      ["taken", "taken", "exact"],
      ["yes", "taken", "normalized"],
      ["I took it", "taken", "normalized"],
      ["missed", "missed", "exact"],
      ["no", "missed", "normalized"],
      ["not taken", "missed", "normalized"],
      ["skipped", "missed", "normalized"],
      ["not applicable", "not_applicable", "exact"],
      ["none prescribed", "not_applicable", "normalized"],
      ["not needed today", "not_applicable", "normalized"],
    ] as const)("accepts %s as medication status %s", (transcript, value, confidence) => {
      expectMedicationSuccess(
        parseGuidedCheckinMedicationStatus(transcript),
        value,
        confidence,
      );
    });

    it.each(["take two pills", "ibuprofen", "maybe", "I changed my dose", "double dose"])(
      "rejects unsafe or unclear medication phrase %s",
      (transcript) => {
        expectFailure(parseGuidedCheckinMedicationStatus(transcript));
      },
    );
  });

  describe("parseGuidedCheckinNotesTranscript", () => {
    it("accepts and trims normal draft note text", () => {
      expect(parseGuidedCheckinNotesTranscript("  Knee felt tight after exercises.  ")).toEqual({
        ok: true,
        value: "Knee felt tight after exercises.",
        confidence: "exact",
      });
    });

    it.each(["", "   \n\t  "])("rejects empty note transcript", (transcript) => {
      expectFailure(parseGuidedCheckinNotesTranscript(transcript));
    });

    it("rejects notes over 1200 characters instead of silently clamping", () => {
      expectFailure(parseGuidedCheckinNotesTranscript("a".repeat(1201)));
    });
  });

  describe("parseGuidedCheckinSleepHours", () => {
    it.each([
      ["7", 7, "exact"],
      ["7 hours", 7, "exact"],
      ["seven", 7, "normalized"],
      ["seven and a half", 7.5, "normalized"],
      ["0", 0, "exact"],
      ["16", 16, "exact"],
    ] as const)("accepts %s as sleep hours %s", (transcript, value, confidence) => {
      expectNumberSuccess(parseGuidedCheckinSleepHours(transcript), value, confidence);
    });

    it.each(["not much", "-1", "17", "a full night"])(
      "rejects vague or out-of-range sleep hours phrase %s",
      (transcript) => {
        expectFailure(parseGuidedCheckinSleepHours(transcript));
      },
    );
  });

  describe("parseGuidedCheckinSleepQuality", () => {
    it.each([
      ["one", 1, "normalized"],
      ["1", 1, "exact"],
      ["very low", 1, "normalized"],
      ["low", 2, "normalized"],
      ["okay", 3, "normalized"],
      ["strong", 4, "normalized"],
      ["very strong", 5, "normalized"],
    ] as const)("accepts safe 1-5 sleep quality phrase %s", (transcript, value, confidence) => {
      expectNumberSuccess(parseGuidedCheckinSleepQuality(transcript), value, confidence);
    });

    it.each(["restless", "bad", "not much", "fine I guess", "0", "6"])(
      "rejects ambiguous sleep quality phrase %s",
      (transcript) => {
        expectFailure(parseGuidedCheckinSleepQuality(transcript));
      },
    );
  });

  it("keeps parser source free of API, storage, logging, and RAG side effects", () => {
    const source = readFileSync(
      join(process.cwd(), "src/utils/guidedCheckinParser.ts"),
      "utf8",
    );

    expect(source).not.toContain("@/src/api/patient");
    expect(source).not.toContain("@/src/api");
    expect(source).not.toContain("@/app/(tabs)/checkin");
    expect(source).not.toContain("createCheckin");
    expect(source).not.toContain("/rag/reply");
    expect(source).not.toContain("AsyncStorage");
    expect(source).not.toContain("SecureStore");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("fetch(");
  });
});
