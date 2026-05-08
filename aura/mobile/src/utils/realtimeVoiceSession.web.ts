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

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

type BrowserRealtimeGlobals = {
  RTCPeerConnection: typeof RTCPeerConnection;
  getUserMedia: MediaDevices["getUserMedia"];
  document: Document;
  fetch: typeof fetch;
};

function getBrowserRealtimeGlobals(): BrowserRealtimeGlobals | null {
  const candidate = globalThis as typeof globalThis & {
    RTCPeerConnection?: typeof RTCPeerConnection;
    navigator?: Navigator;
    document?: Document;
    HTMLAudioElement?: typeof HTMLAudioElement;
    fetch?: typeof fetch;
  };

  const getUserMedia = candidate.navigator?.mediaDevices?.getUserMedia;

  if (
    typeof candidate.RTCPeerConnection !== "function" ||
    typeof getUserMedia !== "function" ||
    typeof candidate.document?.createElement !== "function" ||
    typeof candidate.HTMLAudioElement !== "function" ||
    typeof candidate.fetch !== "function"
  ) {
    return null;
  }

  return {
    RTCPeerConnection: candidate.RTCPeerConnection,
    getUserMedia: getUserMedia.bind(candidate.navigator.mediaDevices),
    document: candidate.document,
    fetch: candidate.fetch.bind(candidate),
  };
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
  );
}

export function isRealtimeVoiceSessionSupported(): boolean {
  return getBrowserRealtimeGlobals() !== null;
}

export async function startRealtimeVoiceSession({
  clientSecret,
  onPhaseChange,
}: RealtimeVoiceSessionStartOptions): Promise<RealtimeVoiceSessionHandle> {
  const browser = getBrowserRealtimeGlobals();
  if (!browser) {
    throw new RealtimeVoiceSessionError(
      "unsupported",
      "This browser cannot start a live Voice Agent audio session.",
    );
  }

  let peerConnection: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let localStream: MediaStream | null = null;
  let audioElement: HTMLAudioElement | null = null;
  let stopped = false;

  const stop = () => {
    stopped = true;

    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }

    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.close();
      peerConnection = null;
    }

    if (localStream) {
      for (const track of localStream.getTracks()) {
        track.stop();
      }
      localStream = null;
    }

    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.remove();
      audioElement = null;
    }
  };

  try {
    onPhaseChange?.("requestingMicrophone");
    localStream = await browser.getUserMedia({ audio: true });
    if (stopped) {
      stop();
      throw new RealtimeVoiceSessionError("connection_failed", "Voice Agent start was cancelled.");
    }

    onPhaseChange?.("connectingAudio");
    peerConnection = new browser.RTCPeerConnection();
    audioElement = browser.document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.style.display = "none";
    audioElement.setAttribute("aria-hidden", "true");
    browser.document.body?.appendChild(audioElement);

    peerConnection.ontrack = (event) => {
      if (!audioElement || stopped) {
        return;
      }
      audioElement.srcObject = event.streams[0] ?? null;
      void audioElement.play().catch(() => undefined);
    };

    const audioTrack = localStream.getAudioTracks()[0] ?? localStream.getTracks()[0];
    if (!audioTrack) {
      throw new RealtimeVoiceSessionError(
        "connection_failed",
        "No microphone audio track was available.",
      );
    }

    peerConnection.addTrack(audioTrack, localStream);
    dataChannel = peerConnection.createDataChannel("oai-events");

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    if (!offer.sdp) {
      throw new RealtimeVoiceSessionError(
        "connection_failed",
        "Could not create a Voice Agent audio offer.",
      );
    }

    const sdpResponse = await browser.fetch(REALTIME_CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      throw new RealtimeVoiceSessionError(
        "connection_failed",
        "Voice Agent audio connection failed.",
      );
    }

    const answerSdp = await sdpResponse.text();
    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });

    onPhaseChange?.("live");

    return {
      stop,
    };
  } catch (error) {
    stop();

    if (error instanceof RealtimeVoiceSessionError) {
      throw error;
    }

    if (isPermissionDenied(error)) {
      throw new RealtimeVoiceSessionError(
        "microphone_denied",
        "Microphone permission was denied. Enable microphone access in your browser to use the web Voice Agent demo.",
      );
    }

    throw new RealtimeVoiceSessionError(
      "connection_failed",
      "Voice Agent audio connection failed.",
    );
  }
}
