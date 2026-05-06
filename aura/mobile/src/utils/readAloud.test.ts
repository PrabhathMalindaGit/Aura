import { beforeEach, describe, expect, it, vi } from "vitest";

const { speechModule } = vi.hoisted(() => ({
  speechModule: {
    stop: vi.fn(async () => undefined),
  },
}));

vi.mock("expo-speech", () => speechModule);

import { stopReadAloud } from "@/src/utils/readAloud";

describe("stopReadAloud", () => {
  beforeEach(() => {
    speechModule.stop.mockClear();
  });

  it("stops active speech playback through expo-speech", async () => {
    await stopReadAloud();

    expect(speechModule.stop).toHaveBeenCalledTimes(1);
  });
});
