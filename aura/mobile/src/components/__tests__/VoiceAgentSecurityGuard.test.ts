import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const mobileRoot = join(__dirname, "..", "..", "..");
const publicOpenAiKeyName = ["EXPO_PUBLIC", "OPENAI", "API_KEY"].join("_");
const serverOpenAiKeyName = ["OPENAI", "API_KEY"].join("_");
const confirmedActionScreens = [
  "app/(tabs)/checkin.tsx",
  "app/(tabs)/chat.tsx",
  "app/appointments.tsx",
  "app/hydration.tsx",
  "app/nutrition.tsx",
  "app/medications.tsx",
];
const voiceAgentBoundaryFiles = [
  "app/voice-agent.tsx",
  "src/components/VoiceAgentSessionPanel.tsx",
  "src/utils/voiceActionProposals.ts",
  "src/utils/realtimeVoiceSession.ts",
  "src/utils/realtimeVoiceSession.web.ts",
];
const confirmationUtilityFiles = [
  "src/utils/guidedCheckinParser.ts",
  "src/utils/voiceChatSendConfirmation.ts",
  "src/utils/voiceAppointmentRequestConfirmation.ts",
  "src/utils/voiceHealthLogConfirmation.ts",
  "src/utils/voiceActionProposals.ts",
];

function readMobileFile(relativePath: string): string {
  return readFileSync(join(mobileRoot, relativePath), "utf8");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function expectNoPattern(source: string, pattern: RegExp, label: string) {
  expect(source, label).not.toMatch(pattern);
}

function readStripped(relativePath: string): string {
  return stripComments(readMobileFile(relativePath));
}

describe("Voice Agent mobile security guardrails", () => {
  it("does not add OpenAI API keys to mobile code or config", () => {
    const files = [
      "app.json",
      "src/config/env.ts",
      "src/api/patient.ts",
      ...voiceAgentBoundaryFiles,
      ...confirmationUtilityFiles,
    ];

    for (const file of files) {
      const source = readMobileFile(file);
      expect(source).not.toContain(publicOpenAiKeyName);
      expect(source).not.toContain(serverOpenAiKeyName);
    }
  });

  it("keeps /voice-agent proposal-oriented without confirmed-action mutation paths", () => {
    const source = voiceAgentBoundaryFiles
      .map(readStripped)
      .join("\n");

    expect(source).not.toContain("AsyncStorage");
    expect(source).not.toContain("SecureStore");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expectNoPattern(source, /\bcreateCheckin\b/, "voice agent must not submit check-ins");
    expectNoPattern(source, /\bsendChat\b/, "voice agent must not send chat");
    expectNoPattern(source, /\bcreateAppointmentRequest\b/, "voice agent must not request appointments");
    expectNoPattern(source, /\bsubmitQueueableWrite\b/, "voice agent must not log health data");
    expectNoPattern(source, /\bsendHydrationSync\b/, "voice agent must not log hydration");
    expectNoPattern(source, /\bsendNutritionSync\b/, "voice agent must not log nutrition");
    expectNoPattern(source, /\bsendMedicationSync\b/, "voice agent must not log medication");
    expect(source).not.toContain("/patient/checkins");
    expect(source).not.toContain("/patient/chat/send");
    expect(source).not.toContain("/patient/appointments");
    expect(source).not.toContain("/patient/medications");
    expect(source).not.toContain("/patient/hydration");
    expect(source).not.toContain("/patient/nutrition");
    expect(source).not.toContain("/patient/photos");
    expect(source).not.toContain("create_alert");
    expect(source).not.toContain("callEmergency");
    expectNoPattern(source, /\bcreateAlert\b/, "voice agent must not create alerts");
    expectNoPattern(source, /\btool_choice\b/, "Realtime tool choice must stay absent");
    expectNoPattern(source, /\btools\s*:/, "Realtime tools array must stay absent");
    expectNoPattern(source, /\bsession\.update\b/, "Realtime session updates must not add tools");
    expectNoPattern(source, /\bfunction_call\b/, "Realtime function calling must stay absent");
    expectNoPattern(source, /\btool_call\b/, "Realtime tool calling must stay absent");
    expectNoPattern(source, /\bonmessage\s*=/, "Realtime transcript events must not execute commands");
  });

  it("keeps confirmed-action screens free of cross-flow voice mutations and persistence shortcuts", () => {
    const perScreenForbidden: Record<string, RegExp[]> = {
      "app/(tabs)/checkin.tsx": [
        /\bcreateAlert\b/,
        /\bsubmitQueueableWrite\b/,
        /\bsendHydrationSync\b/,
        /\bsendNutritionSync\b/,
        /\bsendMedicationSync\b/,
      ],
      "app/(tabs)/chat.tsx": [
        /\bcreateAlert\b/,
        /\bcreateAppointmentRequest\b/,
        /\bsubmitQueueableWrite\b/,
        /\bsendHydrationSync\b/,
        /\bsendNutritionSync\b/,
        /\bsendMedicationSync\b/,
      ],
      "app/appointments.tsx": [
        /\bcreateCheckin\b/,
        /\bsendChat\b/,
        /\bcreateAlert\b/,
        /\bsubmitQueueableWrite\b/,
        /\bsendHydrationSync\b/,
        /\bsendNutritionSync\b/,
        /\bsendMedicationSync\b/,
      ],
      "app/hydration.tsx": [
        /\bcreateCheckin\b/,
        /\bsendChat\b/,
        /\bcreateAppointmentRequest\b/,
        /\bcreateAlert\b/,
        /\bsendNutritionSync\b/,
        /\bsendMedicationSync\b/,
      ],
      "app/nutrition.tsx": [
        /\bcreateCheckin\b/,
        /\bsendChat\b/,
        /\bcreateAppointmentRequest\b/,
        /\bcreateAlert\b/,
        /\bsendHydrationSync\b/,
        /\bsendMedicationSync\b/,
      ],
      "app/medications.tsx": [
        /\bcreateCheckin\b/,
        /\bsendChat\b/,
        /\bcreateAppointmentRequest\b/,
        /\bcreateAlert\b/,
        /\bsendHydrationSync\b/,
        /\bsendNutritionSync\b/,
        /\bcreateMedication\b/,
        /\bupdateMedication\b/,
      ],
    };

    for (const file of confirmedActionScreens) {
      const source = readStripped(file);
      expect(source).not.toContain(publicOpenAiKeyName);
      expect(source).not.toContain(serverOpenAiKeyName);
      expectNoPattern(source, /\btool_choice\b/, `${file} must not configure Realtime tools`);
      expectNoPattern(source, /\btools\s*:/, `${file} must not add Realtime tools`);
      expectNoPattern(source, /\bfunction_call\b/, `${file} must not use Realtime function calls`);
      expectNoPattern(source, /\bAsyncStorage\b.*\b(transcript|audio|draft)\b/i, `${file} must not persist voice artifacts`);
      expectNoPattern(source, /\bSecureStore\b.*\b(transcript|audio|draft|OPENAI)\b/i, `${file} must not persist voice artifacts or keys`);

      for (const pattern of perScreenForbidden[file] ?? []) {
        expectNoPattern(source, pattern, `${file} must not import or call forbidden cross-flow mutation ${pattern}`);
      }
    }
  });

  it("keeps confirmed-action utilities as memory-only parsers without APIs, tools, or storage", () => {
    const source = confirmationUtilityFiles
      .map(readStripped)
      .join("\n");

    expectNoPattern(source, /\bAsyncStorage\b/, "voice parser utilities must not persist drafts");
    expectNoPattern(source, /\bSecureStore\b/, "voice parser utilities must not persist secrets");
    expectNoPattern(source, /\bfetch\s*\(/, "voice parser utilities must not call APIs");
    expectNoPattern(source, /\/patient\//, "voice parser utilities must not contain patient API routes");
    expectNoPattern(source, /\bcreateCheckin\b/, "voice parser utilities must not submit check-ins");
    expectNoPattern(source, /\bsendChat\b/, "voice parser utilities must not send chat");
    expectNoPattern(source, /\bcreateAppointmentRequest\b/, "voice parser utilities must not request appointments");
    expectNoPattern(source, /\bsubmitQueueableWrite\b/, "voice parser utilities must not log health data");
    expectNoPattern(source, /\bcreateAlert\b/, "voice parser utilities must not create alerts");
    expectNoPattern(source, /\btool_choice\b|\btools\s*:|\bfunction_call\b|\btool_call\b/, "voice parser utilities must not add Realtime tools");
  });
});
