import { logHydration } from "@/src/api/patient";
import type { HydrationSyncPayload } from "@/src/sync/model";

export async function sendHydrationSync(
  token: string,
  payload: HydrationSyncPayload
): Promise<void> {
  await logHydration(token, payload);
}
