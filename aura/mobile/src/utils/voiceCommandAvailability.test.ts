import { beforeEach, describe, expect, it, vi } from "vitest";

const { speechModule } = vi.hoisted(() => ({
  speechModule: {
    isRecognitionAvailable: vi.fn(() => true),
    supportsOnDeviceRecognition: vi.fn(() => true),
  },
}));

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechModule,
}));

import { isVoiceCommandRuntimeSupported } from "@/src/utils/voiceCommandAvailability";

describe("isVoiceCommandRuntimeSupported", () => {
  beforeEach(() => {
    speechModule.isRecognitionAvailable.mockReset();
    speechModule.isRecognitionAvailable.mockReturnValue(true);
    speechModule.supportsOnDeviceRecognition.mockReset();
    speechModule.supportsOnDeviceRecognition.mockReturnValue(true);
  });

  it("hides the floating voice command launcher on web without probing native speech APIs", () => {
    expect(isVoiceCommandRuntimeSupported("web")).toBe(false);

    expect(speechModule.isRecognitionAvailable).not.toHaveBeenCalled();
    expect(speechModule.supportsOnDeviceRecognition).not.toHaveBeenCalled();
  });

  it("hides the floating voice command launcher when recognition is unavailable", () => {
    speechModule.isRecognitionAvailable.mockReturnValue(false);

    expect(isVoiceCommandRuntimeSupported("ios")).toBe(false);
    expect(speechModule.supportsOnDeviceRecognition).not.toHaveBeenCalled();
  });

  it("hides the floating voice command launcher when on-device recognition is unsupported", () => {
    speechModule.supportsOnDeviceRecognition.mockReturnValue(false);

    expect(isVoiceCommandRuntimeSupported("android")).toBe(false);
  });

  it("keeps the floating voice command launcher available on supported native runtimes", () => {
    expect(isVoiceCommandRuntimeSupported("ios")).toBe(true);
  });

  it("treats speech API probe failures as unsupported", () => {
    speechModule.isRecognitionAvailable.mockImplementation(() => {
      throw new Error("native module unavailable");
    });

    expect(isVoiceCommandRuntimeSupported("ios")).toBe(false);
  });
});
