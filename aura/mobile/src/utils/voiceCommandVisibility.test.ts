import { describe, expect, it } from "vitest";

import { shouldShowVoiceCommandForSegments } from "@/src/utils/voiceCommandVisibility";

describe("shouldShowVoiceCommandForSegments", () => {
  it("shows on signed-in patient routes", () => {
    expect(shouldShowVoiceCommandForSegments("signedIn", ["(tabs)", "chat"])).toBe(true);
    expect(shouldShowVoiceCommandForSegments("signedIn", ["caregiver-invite"])).toBe(true);
  });

  it("hides unless the patient is signed in", () => {
    expect(shouldShowVoiceCommandForSegments("signedOut", ["(tabs)"])).toBe(false);
    expect(shouldShowVoiceCommandForSegments("loading", ["(tabs)"])).toBe(false);
  });

  it("hides on auth and caregiver-session routes", () => {
    expect(shouldShowVoiceCommandForSegments("signedIn", ["(auth)", "login"])).toBe(false);
    expect(shouldShowVoiceCommandForSegments("signedIn", ["caregiver-login"])).toBe(false);
    expect(shouldShowVoiceCommandForSegments("signedIn", ["caregiver-home"])).toBe(false);
    expect(shouldShowVoiceCommandForSegments("signedIn", ["caregiver-weekly-report"])).toBe(false);
  });
});
