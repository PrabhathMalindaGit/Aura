import { describe, expect, it } from "vitest";

import {
  SUPPORTED_VOICE_COMMANDS,
  parseVoiceCommand,
  type VoiceCommandRoute,
} from "@/src/utils/voiceCommands";

describe("parseVoiceCommand", () => {
  const allowedRoutes: Array<[string, VoiceCommandRoute]> = [
    ["open home", "/(tabs)"],
    ["open check-in", "/(tabs)/checkin"],
    ["open chat", "/(tabs)/chat"],
    ["open progress", "/(tabs)/progress"],
    ["open exercise plan", "/exercise-plan"],
    ["open appointments", "/appointments"],
    ["open reminders", "/reminders"],
    ["open safety guidance", "/safety"],
    ["open coping tools", "/coping-tools"],
    ["open hydration", "/hydration"],
    ["open medications", "/medications"],
    ["open symptom photos", "/symptom-photos"],
    ["open caregiver", "/caregiver-invite"],
  ];

  it.each(allowedRoutes)("maps %s to %s", (transcript, route) => {
    expect(parseVoiceCommand(transcript)).toEqual({
      type: "navigation",
      command: transcript,
      route,
    });
  });

  it("accepts simple navigation synonyms", () => {
    expect(parseVoiceCommand("go to check in")).toEqual({
      type: "navigation",
      command: "open check-in",
      route: "/(tabs)/checkin",
    });
    expect(parseVoiceCommand("show messages")).toEqual({
      type: "navigation",
      command: "open chat",
      route: "/(tabs)/chat",
    });
    expect(parseVoiceCommand("take me to safety plan")).toEqual({
      type: "navigation",
      command: "open safety guidance",
      route: "/safety",
    });
    expect(parseVoiceCommand("open meds.")).toEqual({
      type: "navigation",
      command: "open medications",
      route: "/medications",
    });
  });

  it("returns control commands", () => {
    expect(parseVoiceCommand("go back")).toEqual({
      type: "goBack",
      command: "go back",
    });
    expect(parseVoiceCommand("stop reading")).toEqual({
      type: "stopReading",
      command: "stop reading",
    });
    expect(parseVoiceCommand("help")).toEqual({
      type: "help",
      command: "help",
    });
  });

  it.each([
    "submit check-in",
    "send message",
    "book appointment",
    "cancel appointment",
    "log medication",
    "upload photo",
    "call emergency",
    "message clinician",
    "set pain level",
  ])("rejects unsafe command %s", (transcript) => {
    expect(parseVoiceCommand(transcript)).toEqual({
      type: "unsupported",
      reason: "unsafe",
    });
  });

  it.each(["open chat and send message", "open check-in and submit"])(
    "rejects mixed unsafe command %s",
    (transcript) => {
      expect(parseVoiceCommand(transcript)).toEqual({
        type: "unsupported",
        reason: "unsafe",
      });
    },
  );

  it.each([
    "my pain is worse today",
    "please tell my clinician I need help",
    "",
    "open the pod bay doors",
  ])("rejects unknown command %s", (transcript) => {
    expect(parseVoiceCommand(transcript)).toEqual({
      type: "unsupported",
      reason: "unknown",
    });
  });

  it("keeps supported command help scoped to safe actions", () => {
    expect(SUPPORTED_VOICE_COMMANDS).toContain("Open check-in");
    expect(SUPPORTED_VOICE_COMMANDS).toContain("Stop reading");
    expect(SUPPORTED_VOICE_COMMANDS.join(" ").toLowerCase()).not.toContain("submit");
    expect(SUPPORTED_VOICE_COMMANDS.join(" ").toLowerCase()).not.toContain("send message");
  });
});
