import { describe, expect, it } from "vitest";

import { parseVoiceSubmitConfirmation } from "@/src/utils/guidedCheckinParser";
import { parseVoiceAppointmentRequestConfirmation } from "@/src/utils/voiceAppointmentRequestConfirmation";
import { parseVoiceChatSendConfirmation } from "@/src/utils/voiceChatSendConfirmation";
import { parseVoiceHealthLogConfirmation } from "@/src/utils/voiceHealthLogConfirmation";

const AMBIGUOUS_PHRASES = [
  "yes",
  "yeah",
  "okay",
  "ok",
  "sure",
  "maybe",
  "continue",
  "please",
  "go ahead",
  "submit",
  "send",
  "request",
  "log",
  "",
  "please do it",
];

const CANCEL_PHRASES = [
  "cancel",
  "stop",
  "do not submit",
  "dont submit",
  "do not send",
  "dont send",
  "do not request",
  "dont request",
  "do not log",
  "dont log",
  "never mind",
  "go back",
];

const parsers = [
  {
    name: "check-in submit",
    parse: parseVoiceSubmitConfirmation,
    accepted: ["yes submit", "confirm submit", "submit check-in"],
    rejectedNearMisses: ["yes send", "confirm request", "log this"],
  },
  {
    name: "chat send",
    parse: parseVoiceChatSendConfirmation,
    accepted: ["yes send", "confirm send", "send message"],
    rejectedNearMisses: ["yes submit", "confirm request", "log this"],
  },
  {
    name: "appointment request",
    parse: parseVoiceAppointmentRequestConfirmation,
    accepted: ["yes request", "confirm request", "request appointment"],
    rejectedNearMisses: ["yes submit", "confirm send", "log this"],
  },
  {
    name: "health log",
    parse: parseVoiceHealthLogConfirmation,
    accepted: ["yes log", "confirm log", "log this"],
    rejectedNearMisses: ["yes submit", "confirm send", "request appointment"],
  },
];

describe("confirmed voice action phrase guardrails", () => {
  it.each(parsers)(
    "$name accepts only its exact confirmation phrase set",
    ({ parse, accepted, rejectedNearMisses }) => {
      for (const phrase of accepted) {
        expect(parse(phrase)).toBe("confirm");
        expect(parse(` ${phrase.toUpperCase()}! `)).toBe("confirm");
      }

      for (const phrase of rejectedNearMisses) {
        expect(parse(phrase)).toBe("ambiguous");
      }
    },
  );

  it.each(parsers)(
    "$name never confirms ambiguous, silent, or generic positive speech",
    ({ parse }) => {
      for (const phrase of AMBIGUOUS_PHRASES) {
        expect(parse(phrase)).toBe("ambiguous");
      }
    },
  );

  it.each(parsers)(
    "$name treats negative or navigation-away speech as cancellation",
    ({ parse }) => {
      for (const phrase of CANCEL_PHRASES) {
        expect(parse(phrase)).toBe("cancel");
      }
    },
  );
});
