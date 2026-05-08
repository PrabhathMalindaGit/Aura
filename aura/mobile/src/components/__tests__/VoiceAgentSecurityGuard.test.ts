import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const mobileRoot = join(__dirname, "..", "..", "..");
const publicOpenAiKeyName = ["EXPO_PUBLIC", "OPENAI", "API_KEY"].join("_");
const serverOpenAiKeyName = ["OPENAI", "API_KEY"].join("_");

function readMobileFile(relativePath: string): string {
  return readFileSync(join(mobileRoot, relativePath), "utf8");
}

describe("Voice Agent mobile security guardrails", () => {
  it("does not add OpenAI API keys to mobile code or config", () => {
    const files = [
      "app.json",
      "src/config/env.ts",
      "src/components/VoiceAgentSessionPanel.tsx",
      "src/api/patient.ts",
      "src/utils/voiceActionProposals.ts",
      "src/utils/realtimeVoiceSession.ts",
      "src/utils/realtimeVoiceSession.web.ts",
    ];

    for (const file of files) {
      const source = readMobileFile(file);
      expect(source).not.toContain(publicOpenAiKeyName);
      expect(source).not.toContain(serverOpenAiKeyName);
    }
  });

  it("keeps the V5-B2-Web voice agent away from storage, logs, and clinical mutation endpoints", () => {
    const source = [
      "src/components/VoiceAgentSessionPanel.tsx",
      "src/utils/voiceActionProposals.ts",
      "src/utils/realtimeVoiceSession.ts",
      "src/utils/realtimeVoiceSession.web.ts",
    ]
      .map(readMobileFile)
      .join("\n");

    expect(source).not.toContain("AsyncStorage");
    expect(source).not.toContain("SecureStore");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("/patient/checkins");
    expect(source).not.toContain("/patient/chat/send");
    expect(source).not.toContain("/patient/appointments");
    expect(source).not.toContain("/patient/medications");
    expect(source).not.toContain("/patient/hydration");
    expect(source).not.toContain("/patient/nutrition");
    expect(source).not.toContain("/patient/photos");
    expect(source).not.toContain("create_alert");
    expect(source).not.toContain("callEmergency");
  });
});
