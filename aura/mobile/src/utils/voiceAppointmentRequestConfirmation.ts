export type VoiceAppointmentRequestConfirmationIntent =
  | "confirm"
  | "cancel"
  | "ambiguous";

function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVoiceAppointmentRequestConfirmation(
  transcript: string,
): VoiceAppointmentRequestConfirmationIntent {
  const normalized = normalizeTranscript(transcript);

  if (
    normalized === "yes request" ||
    normalized === "confirm request" ||
    normalized === "request appointment"
  ) {
    return "confirm";
  }

  if (
    normalized === "cancel" ||
    normalized === "stop" ||
    normalized === "do not request" ||
    normalized === "dont request"
  ) {
    return "cancel";
  }

  return "ambiguous";
}
