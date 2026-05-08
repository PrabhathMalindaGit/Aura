import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRealtimeVoiceSessionSupported,
  startRealtimeVoiceSession,
} from "@/src/utils/realtimeVoiceSession.web";

type InstalledBrowserMocks = {
  audio: {
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    srcObject: unknown;
  };
  dataChannel: {
    close: ReturnType<typeof vi.fn>;
  };
  fetchMock: ReturnType<typeof vi.fn>;
  peerConnection: {
    addTrack: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    createDataChannel: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn>;
  };
  track: {
    stop: ReturnType<typeof vi.fn>;
  };
};

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
}

function installBrowserMocks(): InstalledBrowserMocks {
  const track = {
    stop: vi.fn(),
  };
  const localStream = {
    getAudioTracks: vi.fn(() => [track]),
    getTracks: vi.fn(() => [track]),
  };
  const dataChannel = {
    close: vi.fn(),
  };
  const audio = {
    autoplay: false,
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
    setAttribute: vi.fn(),
    srcObject: "remote-stream",
    style: {
      display: "",
    },
  };
  const peerConnection = {
    addTrack: vi.fn(),
    close: vi.fn(),
    createDataChannel: vi.fn(() => dataChannel),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
    ontrack: null as null | ((event: { streams: unknown[] }) => void),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
  };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => "answer-sdp",
  }));

  defineGlobal(
    "RTCPeerConnection",
    vi.fn(() => peerConnection),
  );
  defineGlobal("HTMLAudioElement", function HTMLAudioElement() {
    return undefined;
  });
  defineGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => localStream),
    },
  });
  defineGlobal("document", {
    body: {
      appendChild: vi.fn(),
    },
    createElement: vi.fn(() => audio),
  });
  defineGlobal("fetch", fetchMock);

  return {
    audio,
    dataChannel,
    fetchMock,
    peerConnection,
    track,
  };
}

describe("realtimeVoiceSession.web", () => {
  beforeEach(() => {
    installBrowserMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects browser WebRTC microphone support", () => {
    expect(isRealtimeVoiceSessionSupported()).toBe(true);

    defineGlobal("RTCPeerConnection", undefined);

    expect(isRealtimeVoiceSessionSupported()).toBe(false);
  });

  it("connects with mocked browser WebRTC and mocked OpenAI SDP fetch", async () => {
    const mocks = installBrowserMocks();
    const phases: string[] = [];

    const handle = await startRealtimeVoiceSession({
      clientSecret: "ek_browser_secret",
      onPhaseChange: (phase) => phases.push(phase),
    });

    expect(phases).toEqual(["requestingMicrophone", "connectingAudio", "live"]);
    expect(mocks.peerConnection.addTrack).toHaveBeenCalledWith(
      mocks.track,
      expect.objectContaining({
        getTracks: expect.any(Function),
      }),
    );
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        body: "offer-sdp",
        headers: {
          Authorization: "Bearer ek_browser_secret",
          "Content-Type": "application/sdp",
        },
      },
    );
    expect(mocks.peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp",
    });

    handle.stop();

    expect(mocks.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(mocks.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(mocks.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audio.pause).toHaveBeenCalledTimes(1);
    expect(mocks.audio.srcObject).toBeNull();
    expect(mocks.audio.remove).toHaveBeenCalledTimes(1);
  });

  it("cleans browser audio resources when the mocked SDP fetch fails", async () => {
    const mocks = installBrowserMocks();
    mocks.fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => "",
    });

    await expect(
      startRealtimeVoiceSession({
        clientSecret: "ek_browser_secret",
      }),
    ).rejects.toMatchObject({
      code: "connection_failed",
    });

    expect(mocks.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(mocks.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(mocks.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.audio.srcObject).toBeNull();
  });
});
