import { describe, expect, it } from "vitest";

import { parseVoiceHealthLogConfirmation } from "@/src/utils/voiceHealthLogConfirmation";

describe("parseVoiceHealthLogConfirmation", () => {
  it.each(["yes log", "confirm log", "log this"])(
    "returns confirm for %s",
    (transcript) => {
      expect(parseVoiceHealthLogConfirmation(transcript)).toBe("confirm");
    },
  );

  it.each(["cancel", "stop", "do not log", "dont log"])(
    "returns cancel for %s",
    (transcript) => {
      expect(parseVoiceHealthLogConfirmation(transcript)).toBe("cancel");
    },
  );

  it.each(["yes", "okay", "maybe", "", "log", "please log it"])(
    "returns ambiguous for %s",
    (transcript) => {
      expect(parseVoiceHealthLogConfirmation(transcript)).toBe("ambiguous");
    },
  );

  it.each([
    "mark medication missed",
    "double my dose",
    "change my medication schedule",
    "create a new medication",
    "edit medication name",
    "should I take another pill",
    "create an alert",
    "call emergency",
    "send chat",
    "submit check in",
    "book appointment",
    "log hydration",
    "log nutrition",
    "upload photo",
  ])("does not treat unsafe or unrelated phrase %s as confirmation", (transcript) => {
    expect(parseVoiceHealthLogConfirmation(transcript)).toBe("ambiguous");
  });
});
