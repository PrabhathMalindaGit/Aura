import { logMedicationDose } from "@/src/api/patient";
import type { MedicationSyncPayload } from "@/src/sync/model";

export async function sendMedicationSync(
  token: string,
  payload: MedicationSyncPayload
): Promise<void> {
  await logMedicationDose(token, payload);
}
