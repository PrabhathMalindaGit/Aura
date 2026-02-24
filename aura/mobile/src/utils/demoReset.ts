import { clearCachedChat } from "@/src/state/chatCache";
import { clearCachedCheckins } from "@/src/state/checkinsCache";
import { clearCachedExercisePlan } from "@/src/state/exercisePlanCache";
import { clearAllLastErrors } from "@/src/state/lastError";
import { clearPending } from "@/src/state/pendingSessions";
import { clearPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { clearAllPromDraftsForPatient } from "@/src/state/promDrafts";
import { clearPromsCache } from "@/src/state/promsCache";
import { clearCachedRehabPhases } from "@/src/state/rehabPhasesCache";
import { clearAllLastRefreshed } from "@/src/state/refresh";
import { clearReminderPrefs } from "@/src/state/reminderPrefs";

export type DemoResetOptions = {
  patientId?: string;
  includeSignOut?: boolean;
};

export async function resetDemoState(
  options: DemoResetOptions = {}
): Promise<void> {
  const patientId = options.patientId?.trim() ?? "";

  const tasks: Array<Promise<void>> = [clearAllLastRefreshed(), clearAllLastErrors()];

  if (patientId) {
    tasks.push(clearCachedChat(patientId));
    tasks.push(clearCachedCheckins(patientId));
    tasks.push(clearCachedExercisePlan(patientId));
    tasks.push(clearCachedRehabPhases(patientId));
    tasks.push(clearPromsCache(patientId));
    tasks.push(clearAllPromDraftsForPatient(patientId));
    tasks.push(clearPending(patientId));
    tasks.push(clearPendingPromSubmissions(patientId));
    tasks.push(clearReminderPrefs(patientId));
  }

  await Promise.all(tasks);
}
