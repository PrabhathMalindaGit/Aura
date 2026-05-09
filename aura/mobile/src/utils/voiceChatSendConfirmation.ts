export type VoiceChatSendConfirmationIntent = "confirm" | "cancel" | "ambiguous";

function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVoiceChatSendConfirmation(
  transcript: string,
): VoiceChatSendConfirmationIntent {
  const normalized = normalizeTranscript(transcript);

  if (
    normalized === "yes send" ||
    normalized === "confirm send" ||
    normalized === "send message"
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
