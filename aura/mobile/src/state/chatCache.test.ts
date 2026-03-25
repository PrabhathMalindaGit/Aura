import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, expect, it } from "vitest";

import {
  clearCachedChat,
  getCachedChat,
  setCachedChat,
} from "@/src/state/chatCache";

describe("chat cache", () => {
  it("stores confirmed history separately from one local attempt", async () => {
    await setCachedChat("patient-a", {
      confirmedMessages: [
        {
          id: "msg-1",
          role: "patient",
          text: "Hello",
          createdAt: "2026-03-24T10:00:00.000Z",
        },
        {
          id: "msg-2",
          role: "assistant",
          text: "Hi there",
          createdAt: "2026-03-24T10:01:00.000Z",
        },
      ],
      localAttempt: {
        text: "Still trying",
        status: "failed",
        createdAt: "2026-03-24T10:02:00.000Z",
      },
      cachedAt: "2026-03-24T10:03:00.000Z",
    });

    await expect(getCachedChat("patient-a")).resolves.toEqual({
      confirmedMessages: [
        {
          id: "msg-1",
          role: "patient",
          text: "Hello",
          createdAt: "2026-03-24T10:00:00.000Z",
        },
        {
          id: "msg-2",
          role: "assistant",
          text: "Hi there",
          createdAt: "2026-03-24T10:01:00.000Z",
        },
      ],
      localAttempt: {
        text: "Still trying",
        status: "failed",
        createdAt: "2026-03-24T10:02:00.000Z",
      },
      cachedAt: "2026-03-24T10:03:00.000Z",
    });
  });

  it("ignores legacy v1 cached transcript arrays", async () => {
    await AsyncStorage.setItem(
      "aura:chatCache:v1:patient-b",
      JSON.stringify([
        {
          id: "legacy-1",
          role: "patient",
          text: "Untrusted legacy row",
          createdAt: "2026-03-24T11:00:00.000Z",
        },
      ])
    );

    await expect(getCachedChat("patient-b")).resolves.toBeNull();
  });

  it("downgrades persisted sending attempts to unknown on read", async () => {
    await AsyncStorage.setItem(
      "aura:chatCache:v2:patient-c",
      JSON.stringify({
        confirmedMessages: [],
        cachedAt: "2026-03-24T12:00:00.000Z",
        localAttempt: {
          text: "Did this send?",
          status: "sending",
          createdAt: "2026-03-24T11:59:00.000Z",
        },
      })
    );

    await expect(getCachedChat("patient-c")).resolves.toEqual({
      confirmedMessages: [],
      cachedAt: "2026-03-24T12:00:00.000Z",
      localAttempt: {
        text: "Did this send?",
        status: "unknown",
        createdAt: "2026-03-24T11:59:00.000Z",
      },
    });
  });

  it("clears both v1 and v2 keys", async () => {
    await AsyncStorage.setItem("aura:chatCache:v1:patient-d", JSON.stringify([]));
    await AsyncStorage.setItem(
      "aura:chatCache:v2:patient-d",
      JSON.stringify({
        confirmedMessages: [],
        cachedAt: "2026-03-24T12:05:00.000Z",
        localAttempt: null,
      })
    );

    await clearCachedChat("patient-d");

    await expect(AsyncStorage.getItem("aura:chatCache:v1:patient-d")).resolves.toBeNull();
    await expect(AsyncStorage.getItem("aura:chatCache:v2:patient-d")).resolves.toBeNull();
  });
});
