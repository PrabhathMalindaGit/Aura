import { Router } from "express";

import authRoutes from "./auth.routes";
import chatRoutes from "./chat.routes";
import checkinsRoutes from "./checkins.routes";
import clinicianRoutes from "./clinician.routes";
import eventsRoutes from "./events.routes";
import healthRoutes from "./health.routes";
import patientRoutes from "./patient.routes";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(checkinsRoutes);
router.use(chatRoutes);
router.use(clinicianRoutes);
router.use(eventsRoutes);
router.use(patientRoutes);

export default router;
