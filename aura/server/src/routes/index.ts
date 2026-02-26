import { Router } from "express";

import authRoutes from "./auth.routes";
import appointmentsRoutes from "./appointments.routes";
import chatRoutes from "./chat.routes";
import checkinsRoutes from "./checkins.routes";
import caregiverRoutes from "./caregiver.routes";
import clinicianRoutes from "./clinician.routes";
import exercisePlanRoutes from "./exercisePlan.routes";
import exerciseSessionsRoutes from "./exerciseSessions.routes";
import eventsRoutes from "./events.routes";
import healthRoutes from "./health.routes";
import hydrationRoutes from "./hydration.routes";
import insightsRoutes from "./insights.routes";
import medicationsRoutes from "./medications.routes";
import nutritionRoutes from "./nutrition.routes";
import patientRoutes from "./patient.routes";
import promsRoutes from "./proms.routes";
import rehabPhasesRoutes from "./rehabPhases.routes";
import symptomPhotosRoutes from "./symptomPhotos.routes";
import wearablesRoutes from "./wearables.routes";
import weeklyReportsRoutes from "./weeklyReports.routes";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(appointmentsRoutes);
router.use(checkinsRoutes);
router.use(caregiverRoutes);
router.use(chatRoutes);
router.use(clinicianRoutes);
router.use(hydrationRoutes);
router.use(insightsRoutes);
router.use(medicationsRoutes);
router.use(nutritionRoutes);
router.use(exercisePlanRoutes);
router.use(exerciseSessionsRoutes);
router.use(rehabPhasesRoutes);
router.use(symptomPhotosRoutes);
router.use(wearablesRoutes);
router.use(promsRoutes);
router.use(weeklyReportsRoutes);
router.use(eventsRoutes);
router.use(patientRoutes);

export default router;
