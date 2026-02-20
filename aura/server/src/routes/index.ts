import { Router } from "express";

import chatRoutes from "./chat.routes";
import checkinsRoutes from "./checkins.routes";
import clinicianRoutes from "./clinician.routes";
import healthRoutes from "./health.routes";

const router = Router();

router.use(healthRoutes);
router.use(checkinsRoutes);
router.use(chatRoutes);
router.use(clinicianRoutes);

export default router;
