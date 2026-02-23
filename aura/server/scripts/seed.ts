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
      console.log(`ChatMessages deleted: ${resetSummary.chatMessagesDeleted}`);
      console.log(`Alerts deleted: ${resetSummary.alertsDeleted}`);
      console.log(`CareEvents deleted: ${resetSummary.careEventsDeleted}`);
      console.log(`ExercisePlans deleted: ${resetSummary.exercisePlansDeleted}`);
    }

    const summary = await seedDemoData({
      resetFirst: !resetFlag,
    });

    console.log("Seed completed.");
    console.log(`Patients: ${summary.patients}`);
    console.log(`CheckIns: ${summary.checkIns}`);
    console.log(`ChatMessages: ${summary.chatMessages}`);
    console.log(`Alerts: ${summary.alerts}`);
    console.log(`CareEvents: ${summary.careEvents}`);
    console.log(`ExercisePlans: ${summary.exercisePlans}`);
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
