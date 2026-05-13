import { describe, expect, it } from "vitest";

import { shouldShowGlobalVoiceCommand } from "@/src/utils/globalVoiceCommandVisibility";

describe("shouldShowGlobalVoiceCommand", () => {
  it("hides the global floating mic when the runtime is unsupported", () => {
    expect(shouldShowGlobalVoiceCommand("signedIn", ["(tabs)", "index"], false)).toBe(false);
  });

  it("keeps the global floating mic on supported signed-in patient routes", () => {
    expect(shouldShowGlobalVoiceCommand("signedIn", ["(tabs)", "index"], true)).toBe(true);
  });

  it("does not override route-level hiding such as the dedicated Voice Agent screen", () => {
    expect(shouldShowGlobalVoiceCommand("signedIn", ["voice-agent"], true)).toBe(false);
  });
});
