import { clearCachedChat } from "@/src/state/chatCache";
import { clearCachedCheckins } from "@/src/state/checkinsCache";
import { clearCachedExercisePlan } from "@/src/state/exercisePlanCache";
import { clearAllHydrationCacheForPatient } from "@/src/state/hydrationCache";
import { clearCachedInsights } from "@/src/state/insightsCache";
import { clearAllLastErrors } from "@/src/state/lastError";
import { clearAllNutritionCacheForPatient } from "@/src/state/nutritionCache";
import {
  clearAllMedicationTodayCacheForPatient,
} from "@/src/state/medicationTodayCache";
import { clearCachedMedications } from "@/src/state/medicationsCache";
import { clearPendingPhotosDirectory, clearPendingPhotoUploads } from "@/src/state/pendingPhotoUploads";
import { clearPendingNutrition } from "@/src/state/pendingNutrition";
import { clearPendingHydration } from "@/src/state/pendingHydration";
import { clearPendingMedicationLogs } from "@/src/state/pendingMedicationLogs";
import { clearPending } from "@/src/state/pendingSessions";
import { clearPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { clearCachedPhotosList } from "@/src/state/photosCache";
import { clearAllPromDraftsForPatient } from "@/src/state/promDrafts";
import { clearPromsCache } from "@/src/state/promsCache";
import { clearCachedRehabPhases } from "@/src/state/rehabPhasesCache";
import { clearAllLastRefreshed } from "@/src/state/refresh";
import { clearReminderPrefs } from "@/src/state/reminderPrefs";
import { clearAllWeeklyReportsForPatient } from "@/src/state/weeklyReportCache";

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
    tasks.push(clearAllHydrationCacheForPatient(patientId));
    tasks.push(clearCachedInsights(patientId));
    tasks.push(clearAllNutritionCacheForPatient(patientId));
    tasks.push(clearCachedMedications(patientId));
    tasks.push(clearAllMedicationTodayCacheForPatient(patientId));
    tasks.push(clearCachedPhotosList(patientId));
    tasks.push(clearCachedRehabPhases(patientId));
    tasks.push(clearPromsCache(patientId));
    tasks.push(clearAllWeeklyReportsForPatient(patientId));
    tasks.push(clearAllPromDraftsForPatient(patientId));
    tasks.push(clearPending(patientId));
    tasks.push(clearPendingHydration(patientId));
    tasks.push(clearPendingNutrition(patientId));
    tasks.push(clearPendingMedicationLogs(patientId));
    tasks.push(clearPendingPhotoUploads(patientId));
    tasks.push(clearPendingPromSubmissions(patientId));
    tasks.push(clearReminderPrefs(patientId));
    tasks.push(clearPendingPhotosDirectory());
  }

  await Promise.all(tasks);
}
