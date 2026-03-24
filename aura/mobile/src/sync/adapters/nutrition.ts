import { logNutrition } from "@/src/api/patient";
import type { NutritionSyncPayload } from "@/src/sync/model";

export async function sendNutritionSync(
  token: string,
  payload: NutritionSyncPayload
): Promise<void> {
  await logNutrition(token, payload);
}
