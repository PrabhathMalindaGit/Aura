import { shouldShowVoiceCommandForSegments } from "@/src/utils/voiceCommandVisibility";
import { FINAL_DEMO_VOICE_UI_ENABLED } from "@/src/config/finalDemoScope";

type PatientAuthStatus = "loading" | "signedIn" | "signedOut";

export function shouldShowGlobalVoiceCommand(
  status: PatientAuthStatus,
  segments: string[],
  runtimeSupported: boolean,
): boolean {
  if (!FINAL_DEMO_VOICE_UI_ENABLED) {
    return false;
  }

  return runtimeSupported && shouldShowVoiceCommandForSegments(status, segments);
}
