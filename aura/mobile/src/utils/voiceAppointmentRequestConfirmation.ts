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
    normalized === "do not submit" ||
    normalized === "dont submit" ||
    normalized === "do not send" ||
    normalized === "dont send" ||
    normalized === "do not request" ||
    normalized === "dont request" ||
    normalized === "do not log" ||
    normalized === "dont log" ||
    normalized === "never mind" ||
    normalized === "go back"
  ) {
    return "cancel";
  }

  return "ambiguous";
}
