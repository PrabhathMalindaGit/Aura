import { shouldShowVoiceCommandForSegments } from "@/src/utils/voiceCommandVisibility";

type PatientAuthStatus = "loading" | "signedIn" | "signedOut";

export function shouldShowGlobalVoiceCommand(
  status: PatientAuthStatus,
  segments: string[],
  runtimeSupported: boolean,
): boolean {
  return runtimeSupported && shouldShowVoiceCommandForSegments(status, segments);
}
