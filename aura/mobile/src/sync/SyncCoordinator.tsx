import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useAuth } from "@/src/state/auth";
import { useNetwork } from "@/src/state/network";
import { flushPendingWrites } from "@/src/sync/runner";
import { ensureSyncStateLoaded } from "@/src/sync/store";

export function SyncCoordinator() {
  const auth = useAuth();
  const network = useNetwork();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const previousAuthStatusRef = useRef(auth.status);
  const previousIsOnlineRef = useRef(network.isOnline);

  useEffect(() => {
    const patientId = auth.patient?.id ?? "";
    if (!patientId.trim()) {
      return;
    }
    void ensureSyncStateLoaded(patientId);
  }, [auth.patient?.id]);

  useEffect(() => {
    const previousAuthStatus = previousAuthStatusRef.current;
    previousAuthStatusRef.current = auth.status;

    if (
      previousAuthStatus === "signedIn" ||
      auth.status !== "signedIn" ||
      !auth.patient?.id ||
      !auth.token ||
      !network.isOnline ||
      appStateRef.current !== "active"
    ) {
      return;
    }

    void flushPendingWrites({
      patientId: auth.patient.id,
      token: auth.token,
      isOnline: network.isOnline,
    });
  }, [auth.patient?.id, auth.status, auth.token, network.isOnline]);

  useEffect(() => {
    const previousOnline = previousIsOnlineRef.current;
    previousIsOnlineRef.current = network.isOnline;

    if (
      previousOnline ||
      !network.isOnline ||
      auth.status !== "signedIn" ||
      !auth.patient?.id ||
      !auth.token
    ) {
      return;
    }

    void flushPendingWrites({
      patientId: auth.patient.id,
      token: auth.token,
      isOnline: true,
    });
  }, [auth.patient?.id, auth.status, auth.token, network.isOnline]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        nextState !== "active" ||
        previousState === "active" ||
        auth.status !== "signedIn" ||
        !auth.patient?.id ||
        !auth.token ||
        !network.isOnline
      ) {
        return;
      }

      void flushPendingWrites({
        patientId: auth.patient.id,
        token: auth.token,
        isOnline: true,
      });
    });

    return () => {
      subscription.remove();
    };
  }, [auth.patient?.id, auth.status, auth.token, network.isOnline]);

  return null;
}
