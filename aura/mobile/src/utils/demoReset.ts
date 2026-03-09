import { clearCachedChat } from "@/src/state/chatCache";
import { clearCachedCheckins } from "@/src/state/checkinsCache";
import {
  clearCachedAppointmentRequests,
  clearCachedAppointmentSlots,
} from "@/src/state/appointmentsCache";
import { clearAllRemindersForPatient } from "@/src/state/appointmentReminders";
import { clearAllCaregiverCache } from "@/src/state/caregiverCache";
import { clearCaregiverSessionStorage } from "@/src/state/caregiverTokenStorage";
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
import { clearReminderReadState } from "@/src/state/inAppReminders";
import { clearReminderPrefs } from "@/src/state/reminderPrefs";
import { clearCachedTasks } from "@/src/state/tasksCache";
import { clearAllWeeklyReportsForPatient } from "@/src/state/weeklyReportCache";
import { clearPendingWearablesSync } from "@/src/state/pendingWearablesSync";
import { clearCachedWearables } from "@/src/state/wearablesCache";
import { clearWearablesConnected } from "@/src/state/wearablesConnection";

export type DemoResetOptions = {
  patientId?: string;
  includeSignOut?: boolean;
};

export async function resetDemoState(
  options: DemoResetOptions = {}
): Promise<void> {
  const patientId = options.patientId?.trim() ?? "";

  const tasks: Array<Promise<void>> = [clearAllLastRefreshed(), clearAllLastErrors()];
  tasks.push(clearAllCaregiverCache());
  tasks.push(clearCaregiverSessionStorage());

  if (patientId) {
    tasks.push(clearCachedAppointmentSlots(patientId));
    tasks.push(clearCachedAppointmentRequests(patientId));
    tasks.push(clearCachedChat(patientId));
    tasks.push(clearCachedCheckins(patientId));
    tasks.push(clearCachedExercisePlan(patientId));
    tasks.push(clearAllHydrationCacheForPatient(patientId));
    tasks.push(clearCachedInsights(patientId));
    tasks.push(clearAllNutritionCacheForPatient(patientId));
    tasks.push(clearCachedMedications(patientId));
    tasks.push(clearAllMedicationTodayCacheForPatient(patientId));
    tasks.push(clearCachedPhotosList(patientId));
    tasks.push(clearCachedTasks(patientId));
    tasks.push(clearReminderReadState(patientId));
    tasks.push(clearCachedWearables(patientId));
    tasks.push(clearCachedRehabPhases(patientId));
    tasks.push(clearPromsCache(patientId));
    tasks.push(clearAllWeeklyReportsForPatient(patientId));
    tasks.push(clearAllPromDraftsForPatient(patientId));
    tasks.push(clearPending(patientId));
    tasks.push(clearPendingHydration(patientId));
    tasks.push(clearPendingNutrition(patientId));
    tasks.push(clearPendingMedicationLogs(patientId));
    tasks.push(clearPendingPhotoUploads(patientId));
    tasks.push(clearPendingWearablesSync(patientId));
    tasks.push(clearPendingPromSubmissions(patientId));
    tasks.push(clearWearablesConnected(patientId));
    tasks.push(clearReminderPrefs(patientId));
    tasks.push(clearAllRemindersForPatient(patientId));
    tasks.push(clearPendingPhotosDirectory());
  }

  await Promise.all(tasks);
}
