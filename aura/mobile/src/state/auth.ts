import type { Patient } from "@/src/types/models";

export type AuthState = {
  token: string | null;
  patient: Patient | null;
};

export function useAuth(): never {
  throw new Error("Auth not implemented — Step 3");
}
