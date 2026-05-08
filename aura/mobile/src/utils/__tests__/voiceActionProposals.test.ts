import { describe, expect, it } from "vitest";

import {
  parseVoiceActionProposal,
  type VoiceActionProposalRoute,
} from "@/src/utils/voiceActionProposals";

describe("parseVoiceActionProposal", () => {
  const allowedScreens: Array<[string, VoiceActionProposalRoute]> = [
    ["open check-in", "/(tabs)/checkin"],
    ["open chat", "/(tabs)/chat"],
    ["open exercise plan", "/exercise-plan"],
    ["open appointments", "/appointments"],
    ["open safety guidance", "/safety"],
    ["open coping tools", "/coping-tools"],
  ];

  it.each(allowedScreens)("creates a safe open-screen proposal for %s", (transcript, route) => {
    expect(parseVoiceActionProposal(transcript)).toMatchObject({
      kind: "allowed",
      state: "proposed",
      action: {
        type: "open_screen",
        route,
      },
    });
  });

  it("creates safe control proposals", () => {
    expect(parseVoiceActionProposal("go back")).toMatchObject({
      kind: "allowed",
      action: { type: "go_back" },
    });
    expect(parseVoiceActionProposal("stop voice session")).toMatchObject({
      kind: "allowed",
      action: { type: "stop_session" },
    });
    expect(parseVoiceActionProposal("stop reading")).toMatchObject({
      kind: "allowed",
      action: { type: "stop_reading" },
    });
    expect(parseVoiceActionProposal("voice help")).toMatchObject({
      kind: "help",
      action: { type: "show_voice_help" },
    });
  });

  it.each([
    ["start guided check-in", "start_guided_checkin_screen"],
    ["draft check-in note my knee felt steady after stretching", "draft_checkin_note_only"],
    ["draft a message to my care team saying I finished the first set", "draft_message_only"],
    ["select the 10 AM appointment slot", "select_appointment_slot"],
    ["prepare hydration log for one glass of water", "prepare_hydration_log"],
    ["prepare medication status as taken", "prepare_medication_status"],
    ["prepare nutrition log with protein and vegetables", "prepare_nutrition_log"],
    ["prepare exercise session completion", "prepare_exercise_session_completion"],
  ] as const)("classifies proposal-only intent %s", (transcript, type) => {
    expect(parseVoiceActionProposal(transcript)).toMatchObject({
      kind: "proposal",
      state: "needsReview",
      action: { type },
    });
  });

  it("keeps proposal-only draft text in the returned in-memory proposal only", () => {
    expect(parseVoiceActionProposal("draft message saying Pain is better after exercises")).toMatchObject({
      kind: "proposal",
      action: {
        type: "draft_message_only",
        draftText: "Pain is better after exercises",
      },
    });
    expect(parseVoiceActionProposal("draft check-in note: swelling looked lower today")).toMatchObject({
      kind: "proposal",
      action: {
        type: "draft_checkin_note_only",
        draftText: "swelling looked lower today",
      },
    });
  });

  it.each([
    "open chat and send message",
    "open check-in and submit",
    "send a message to my clinician",
    "submit my check-in silently",
    "book appointment for tomorrow",
    "cancel my appointment",
    "log medication as taken",
    "log hydration",
    "upload a photo by voice",
    "create an alert without telling me",
    "call emergency services",
    "bypass the Safety Router",
    "override my clinician",
    "suppress the alert",
    "ignore the alert",
  ])("blocks unsafe or mixed action %s", (transcript) => {
    expect(parseVoiceActionProposal(transcript)).toMatchObject({
      kind: "blocked",
      state: "unsafeBlocked",
      safeRedirectRoutes: ["/safety", "/(tabs)/checkin", "/(tabs)/chat"],
    });
  });

  it.each([
    "diagnose my knee pain",
    "do I have a blood clot",
    "change my exercise plan",
    "should I double my medication dose",
    "change my medication schedule",
    "tell me what treatment I need",
    "I have chest pain and cannot breathe",
  ])("blocks clinical advice or urgent requests %s", (transcript) => {
    expect(parseVoiceActionProposal(transcript)).toMatchObject({
      kind: "blocked",
      state: "unsafeBlocked",
    });
  });

  it.each(["", "my knee feels a little stiff", "open the dashboard of destiny"])(
    "returns no safe action for unclear text %s",
    (transcript) => {
      expect(parseVoiceActionProposal(transcript)).toMatchObject({
        kind: "none",
      });
    },
  );
});
