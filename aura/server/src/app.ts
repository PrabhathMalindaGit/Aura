import cors from "cors";
import express from "express";

import { assertRuntimeEnvSafety, env } from "./env";
import { authenticateJwt } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { requireRoles } from "./middleware/rbac";
import routes from "./routes";

const app = express();

assertRuntimeEnvSafety(env);

app.use(cors());
app.use(express.json());

app.use(
  "/clinician",
  (req, res, next) =>
    authenticateJwt({
      allowMissingAuth: env.ALLOW_UNAUTH_CLINICIAN_BODY_IDS,
    })(req, res, next),
  (req, res, next) =>
    requireRoles(["clinician", "admin"], {
      allowMissingAuth: env.ALLOW_UNAUTH_CLINICIAN_BODY_IDS,
    })(req, res, next)
);

app.use("/", routes);

app.use(errorHandler);

export default app;
