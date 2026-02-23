import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isApiError, type ApiError } from "@/src/api/client";
import { getMe, login } from "@/src/api/patient";
import { useNetwork } from "@/src/state/network";
import { clearToken, getToken, setToken } from "@/src/state/tokenStorage";
import type { Patient } from "@/src/types/models";
import { clearAllLastErrors, clearLastError, setLastError } from "@/src/state/lastError";
import { clearAllLastRefreshed, setLastRefreshedNow } from "@/src/state/refresh";
import { normalizeUnknownError, toLastErrorRecord } from "@/src/utils/errors";

export type SessionStatus = "loading" | "signedOut" | "signedIn";

export type AuthContextValue = {
  status: SessionStatus;
  token: string | null;
  patient: Patient | null;
  signIn: (accessCode: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeAuthFailure(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  const normalized = normalizeUnknownError(error);
  return {
    title: normalized.title,
    message: normalized.message,
    kind: normalized.kind,
    retryable: normalized.retryable,
    detail: normalized.detail,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const network = useNetwork();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [token, setTokenState] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const initializedRef = useRef(false);

  const restoreSession = useCallback(async () => {
    setStatus("loading");

    const storedToken = await getToken();
    if (!storedToken) {
      setTokenState(null);
      setPatient(null);
      setStatus("signedOut");
      return;
    }

    setTokenState(storedToken);

    try {
      const me = await getMe(storedToken);
      setPatient(me);
      setStatus("signedIn");
    } catch {
      await clearToken();
      setTokenState(null);
      setPatient(null);
      setStatus("signedOut");
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    void restoreSession();
  }, [restoreSession]);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setStatus("signedOut");
      setPatient(null);
      return;
    }

    const me = await getMe(token);
    setPatient(me);
    setStatus("signedIn");
  }, [token]);

  const signIn = useCallback(
    async (accessCode: string) => {
      const trimmed = accessCode.trim();
      if (!trimmed) {
        throw {
          title: "Access code required",
          message: "Please enter your access code.",
          kind: "validation",
          retryable: false,
        } satisfies ApiError;
      }

      if (network.isOffline) {
        const offlineError: ApiError = {
          title: "Offline",
          message: "You’re offline. Nothing was sent.",
          kind: "offline",
          retryable: true,
        };
        await setLastError(
          toLastErrorRecord("auth", offlineError, "Couldn’t sign in")
        );
        throw offlineError;
      }

      setStatus("loading");
      try {
        const response = await login(trimmed);
        await setToken(response.token);
        setTokenState(response.token);

        const me = await getMe(response.token);
        setPatient(me);
        setStatus("signedIn");

        await clearLastError("auth");
        await setLastRefreshedNow("home");
      } catch (error) {
        const normalized = normalizeAuthFailure(error);
        await setLastError(
          toLastErrorRecord("auth", normalized, "Couldn’t sign in")
        );
        await clearToken();
        setTokenState(null);
        setPatient(null);
        setStatus("signedOut");
        throw normalized;
      }
    },
    [network.isOffline]
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setTokenState(null);
    setPatient(null);
    setStatus("signedOut");
    await Promise.all([clearAllLastRefreshed(), clearAllLastErrors()]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      patient,
      signIn,
      signOut,
      refreshMe,
    }),
    [patient, refreshMe, signIn, signOut, status, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
