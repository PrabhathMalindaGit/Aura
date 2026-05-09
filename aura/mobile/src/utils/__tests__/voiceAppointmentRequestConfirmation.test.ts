import { describe, expect, it } from "vitest";

import { parseVoiceAppointmentRequestConfirmation } from "@/src/utils/voiceAppointmentRequestConfirmation";

describe("parseVoiceAppointmentRequestConfirmation", () => {
  it.each(["yes request", "confirm request", "request appointment"])(
    "accepts explicit request confirmation %s",
    (transcript) => {
      expect(parseVoiceAppointmentRequestConfirmation(transcript)).toBe("confirm");
    },
  );

  it.each(["cancel", "stop", "do not request", "dont request"])(
    "accepts explicit cancellation %s",
    (transcript) => {
      expect(parseVoiceAppointmentRequestConfirmation(transcript)).toBe("cancel");
    },
  );

  it.each(["yes", "okay", "maybe", "", "request", "please request it"])(
    "treats ambiguous phrase %s as non-requesting",
    (transcript) => {
      expect(parseVoiceAppointmentRequestConfirmation(transcript)).toBe("ambiguous");
    },
  );
});
