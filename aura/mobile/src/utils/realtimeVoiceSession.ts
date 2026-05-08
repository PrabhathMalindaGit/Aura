export type RealtimeVoiceSessionPhase =
  | "requestingMicrophone"
  | "connectingAudio"
  | "live";

export type RealtimeVoiceSessionStartOptions = {
  clientSecret: string;
  onPhaseChange?: (phase: RealtimeVoiceSessionPhase) => void;
};

export type RealtimeVoiceSessionHandle = {
  stop: () => void;
};

export type RealtimeVoiceSessionErrorCode =
  | "unsupported"
  | "microphone_denied"
  | "connection_failed";

export class RealtimeVoiceSessionError extends Error {
  readonly code: RealtimeVoiceSessionErrorCode;

  constructor(code: RealtimeVoiceSessionErrorCode, message: string) {
    super(message);
    this.name = "RealtimeVoiceSessionError";
    this.code = code;
  }
}

export function isRealtimeVoiceSessionSupported(): boolean {
  return false;
}

export async function startRealtimeVoiceSession(
  _options: RealtimeVoiceSessionStartOptions,
): Promise<RealtimeVoiceSessionHandle> {
  throw new RealtimeVoiceSessionError(
    "unsupported",
    "Live Voice Agent audio is available in the web demo for V5-B2. Native audio requires a later development-build implementation.",
  );
}
