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

import { caregiverLogin, type CaregiverPatient } from "@/src/api/caregiver";
import {
  clearCaregiverSessionStorage,
  getCaregiverProfile,
  getCaregiverToken,
  setCaregiverProfile,
  setCaregiverToken,
} from "@/src/state/caregiverTokenStorage";

export type CaregiverSessionStatus = "loading" | "signedOut" | "signedIn";

type CaregiverSessionContextValue = {
  status: CaregiverSessionStatus;
  token: string | null;
  patient: CaregiverPatient | null;
  signIn: (code: string, caregiverName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const CaregiverSessionContext = createContext<
  CaregiverSessionContextValue | undefined
>(undefined);

export function CaregiverSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CaregiverSessionStatus>("loading");
  const [token, setTokenState] = useState<string | null>(null);
  const [patient, setPatient] = useState<CaregiverPatient | null>(null);
  const initializedRef = useRef(false);

  const restoreSession = useCallback(async () => {
    setStatus("loading");
    const [storedToken, storedPatient] = await Promise.all([
      getCaregiverToken(),
      getCaregiverProfile(),
    ]);

    if (!storedToken) {
      setTokenState(null);
      setPatient(null);
      setStatus("signedOut");
      return;
    }

    setTokenState(storedToken);
    setPatient(storedPatient);
    setStatus("signedIn");
  }, []);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    void restoreSession();
  }, [restoreSession]);

  const signIn = useCallback(async (code: string, caregiverName?: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      throw {
        title: "Invite code required",
        message: "Please enter an invite code.",
        kind: "validation",
        retryable: false,
      };
    }

    setStatus("loading");
    try {
      const response = await caregiverLogin(trimmed, caregiverName);
      await Promise.all([
        setCaregiverToken(response.token),
        setCaregiverProfile(response.patient),
      ]);
      setTokenState(response.token);
      setPatient(response.patient);
      setStatus("signedIn");
    } catch (error) {
      await clearCaregiverSessionStorage();
      setTokenState(null);
      setPatient(null);
      setStatus("signedOut");
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearCaregiverSessionStorage();
    setTokenState(null);
    setPatient(null);
    setStatus("signedOut");
  }, []);

  const value = useMemo<CaregiverSessionContextValue>(
    () => ({
      status,
      token,
      patient,
      signIn,
      signOut,
    }),
    [patient, signIn, signOut, status, token]
  );

  return (
    <CaregiverSessionContext.Provider value={value}>
      {children}
    </CaregiverSessionContext.Provider>
  );
}

export function useCaregiverSession(): CaregiverSessionContextValue {
  const context = useContext(CaregiverSessionContext);
  if (!context) {
    throw new Error("useCaregiverSession must be used inside CaregiverSessionProvider");
  }
  return context;
}
