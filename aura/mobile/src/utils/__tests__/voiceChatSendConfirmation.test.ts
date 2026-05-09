import { describe, expect, it } from "vitest";

import { parseVoiceChatSendConfirmation } from "@/src/utils/voiceChatSendConfirmation";

describe("parseVoiceChatSendConfirmation", () => {
  it.each(["yes send", "confirm send", "send message"])(
    "accepts explicit send confirmation %s",
    (transcript) => {
      expect(parseVoiceChatSendConfirmation(transcript)).toBe("confirm");
    },
  );

  it.each(["cancel", "stop", "do not send", "dont send"])(
    "accepts explicit cancellation %s",
    (transcript) => {
      expect(parseVoiceChatSendConfirmation(transcript)).toBe("cancel");
    },
  );

  it.each(["yes", "okay", "maybe", "", "send", "please send it"])(
    "treats ambiguous phrase %s as non-sending",
    (transcript) => {
      expect(parseVoiceChatSendConfirmation(transcript)).toBe("ambiguous");
    },
  );
});
