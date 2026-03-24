import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";

vi.mock("@/src/state/auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/src/state/network", () => ({
  useNetwork: vi.fn(),
}));

vi.mock("@/src/sync/runner", () => ({
  flushPendingWrites: vi.fn(async () => ({
    attempted: 0,
    synced: 0,
    failed: 0,
    blockedOffline: 0,
    remaining: 0,
  })),
}));

vi.mock("@/src/sync/store", () => ({
  ensureSyncStateLoaded: vi.fn(async () => ({
    version: 1,
    migratedLegacy: true,
    operations: [],
    lastOutcomeByDomain: {},
  })),
}));

import { useAuth } from "@/src/state/auth";
import { useNetwork } from "@/src/state/network";
import { flushPendingWrites } from "@/src/sync/runner";
import { SyncCoordinator } from "@/src/sync/SyncCoordinator";
import { __setAppState } from "../../../test/react-native";

describe("SyncCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __setAppState("active");
  });

  it("does not flush while auth restore is still loading", async () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "loading",
      token: null,
      patient: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshMe: vi.fn(),
    });
    vi.mocked(useNetwork).mockReturnValue({
      isOffline: false,
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
      lastChangedAt: Date.now(),
      lastOnlineAt: Date.now(),
      lastOfflineAt: null,
      reason: "none",
    });

    await act(async () => {
      create(<SyncCoordinator />);
    });

    expect(flushPendingWrites).not.toHaveBeenCalled();
  });

  it("flushes only for the signed-in patient once auth restore completes", async () => {
    let authValue = {
      status: "loading" as const,
      token: null,
      patient: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshMe: vi.fn(),
    };
    vi.mocked(useAuth).mockImplementation(() => authValue as any);
    vi.mocked(useNetwork).mockReturnValue({
      isOffline: false,
      isOnline: true,
      isInternetReachable: true,
      connectionType: "wifi",
      lastChangedAt: Date.now(),
      lastOnlineAt: Date.now(),
      lastOfflineAt: null,
      reason: "none",
    });

    let root: ReturnType<typeof create> | null = null;
    await act(async () => {
      root = create(<SyncCoordinator />);
    });

    authValue = {
      ...authValue,
      status: "signedIn",
      token: "token-a",
      patient: { id: "patient-a" } as any,
    };

    await act(async () => {
      root?.update(<SyncCoordinator />);
    });

    expect(flushPendingWrites).toHaveBeenCalledWith({
      patientId: "patient-a",
      token: "token-a",
      isOnline: true,
    });
  });
});
