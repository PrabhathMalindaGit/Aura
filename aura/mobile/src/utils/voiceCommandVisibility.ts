type PatientAuthStatus = "loading" | "signedIn" | "signedOut";

const HIDDEN_ROOT_SEGMENTS = new Set([
  "(auth)",
  "caregiver-login",
  "caregiver-home",
  "caregiver-weekly-report",
  "voice-agent",
]);

export function shouldShowVoiceCommandForSegments(
  status: PatientAuthStatus,
  segments: string[],
): boolean {
  if (status !== "signedIn") {
    return false;
  }

  const rootSegment = segments[0] ?? "";
  return !HIDDEN_ROOT_SEGMENTS.has(rootSegment);
}
