import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getGuidedCheckinSteps,
  type GuidedCheckinStepId,
} from "@/src/utils/guidedCheckinSteps";

describe("guided check-in steps", () => {
  it("returns deterministic V4-B steps without manual-only fields by default", () => {
    const steps = getGuidedCheckinSteps({ includeSleep: false });
    const ids = steps.map((step) => step.id);

    expect(ids).toEqual(["pain", "mood", "exercise", "medication", "notes"]);
    expect(ids).not.toContain("bodyMap" as GuidedCheckinStepId);
    expect(ids).not.toContain("supportNeed" as GuidedCheckinStepId);
    expect(ids).not.toContain("safetyState" as GuidedCheckinStepId);
    expect(ids).not.toContain("medicationDosage" as GuidedCheckinStepId);
  });

  it("adds simple sleep steps only when daily context is visible", () => {
    expect(getGuidedCheckinSteps({ includeSleep: true }).map((step) => step.id)).toEqual([
      "pain",
      "mood",
      "exercise",
      "medication",
      "notes",
      "sleepHours",
      "sleepQuality",
    ]);
  });

  it("uses the existing V4-A parsers and clear destination labels", () => {
    const painStep = getGuidedCheckinSteps({ includeSleep: false })[0];
    const result = painStep.parse("seven out of ten");

    expect(result).toEqual({ ok: true, value: 7, confidence: "normalized" });
    expect(painStep.formatValue(7)).toBe("7/10");
    expect(painStep.destinationLabel).toBe("Pain level");
  });

  it("keeps step metadata free of submit, RAG, alert, and emergency-call side effects", () => {
    const source = readFileSync(
      join(process.cwd(), "src/utils/guidedCheckinSteps.ts"),
      "utf8",
    );

    expect(source).not.toContain("createCheckin");
    expect(source).not.toContain("/rag/reply");
    expect(source).not.toContain("alert");
    expect(source).not.toContain("Linking.openURL");
    expect(source).not.toContain("Alert.alert");
    expect(source).not.toContain("apiFetchJson");
    expect(source).not.toContain("fetch(");
  });
});
