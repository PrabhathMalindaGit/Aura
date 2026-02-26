import "dotenv/config";

import { connectMongo, disconnectMongo } from "../src/db/mongo";
import { seedDemoData, resetDemoData } from "./seed/lib";

function hasResetFlag(argv: string[]): boolean {
  return argv.includes("--reset");
}

async function run(): Promise<void> {
  const resetFlag = hasResetFlag(process.argv.slice(2));

  await connectMongo();

  try {
    if (resetFlag) {
      const resetSummary = await resetDemoData();
      console.log("Seed reset completed (demo data only).");
      console.log(`Users deleted: ${resetSummary.usersDeleted}`);
      console.log(`Patients deleted: ${resetSummary.patientsDeleted}`);
      console.log(`CheckIns deleted: ${resetSummary.checkInsDeleted}`);
      console.log(`AppointmentSlots deleted: ${resetSummary.appointmentSlotsDeleted}`);
      console.log(`AppointmentRequests deleted: ${resetSummary.appointmentRequestsDeleted}`);
      console.log(`HydrationLogs deleted: ${resetSummary.hydrationLogsDeleted}`);
      console.log(`NutritionLogs deleted: ${resetSummary.nutritionLogsDeleted}`);
      console.log(`Medications deleted: ${resetSummary.medicationsDeleted}`);
      console.log(`MedicationSchedules deleted: ${resetSummary.medicationSchedulesDeleted}`);
      console.log(`MedicationLogs deleted: ${resetSummary.medicationLogsDeleted}`);
      console.log(`ChatMessages deleted: ${resetSummary.chatMessagesDeleted}`);
      console.log(`Alerts deleted: ${resetSummary.alertsDeleted}`);
      console.log(`CareEvents deleted: ${resetSummary.careEventsDeleted}`);
      console.log(`ExercisePlans deleted: ${resetSummary.exercisePlansDeleted}`);
      console.log(`PromTemplates deleted: ${resetSummary.promTemplatesDeleted}`);
      console.log(`PromInstances deleted: ${resetSummary.promInstancesDeleted}`);
    }

    const summary = await seedDemoData({
      resetFirst: !resetFlag,
    });

    console.log("Seed completed.");
    console.log(`Patients: ${summary.patients}`);
    console.log(`CheckIns: ${summary.checkIns}`);
    console.log(`AppointmentSlots: ${summary.appointmentSlots}`);
    console.log(`AppointmentRequests: ${summary.appointmentRequests}`);
    console.log(`HydrationLogs: ${summary.hydrationLogs}`);
    console.log(`NutritionLogs: ${summary.nutritionLogs}`);
    console.log(`Medications: ${summary.medications}`);
    console.log(`MedicationSchedules: ${summary.medicationSchedules}`);
    console.log(`MedicationLogs: ${summary.medicationLogs}`);
    console.log(`ChatMessages: ${summary.chatMessages}`);
    console.log(`Alerts: ${summary.alerts}`);
    console.log(`CareEvents: ${summary.careEvents}`);
    console.log(`ExercisePlans: ${summary.exercisePlans}`);
    console.log(`PromTemplates: ${summary.promTemplates}`);
    console.log(`PromInstances: ${summary.promInstances}`);
  } finally {
    await disconnectMongo();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
