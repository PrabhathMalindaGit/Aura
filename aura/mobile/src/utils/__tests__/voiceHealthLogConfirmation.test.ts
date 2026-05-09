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
});
