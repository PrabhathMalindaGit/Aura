import cors from "cors";
import express from "express";

import { assertRuntimeEnvSafety, env } from "./env";
import { authenticateJwt } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { requestContextMiddleware } from "./middleware/requestContext";
import { requireRoles } from "./middleware/rbac";
import internalOpsRoutes from "./routes/internalOps.routes";
import routes from "./routes";

const app = express();
const LOCAL_CORS_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
]);

assertRuntimeEnvSafety(env);

app.use(
  cors({
    credentials: false,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);
      if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
        for (const localOrigin of LOCAL_CORS_ORIGINS) {
          allowedOrigins.add(localOrigin);
        }
      }

      callback(null, allowedOrigins.has(origin));
    },
  })
);
app.use(requestContextMiddleware);
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

app.use("/", internalOpsRoutes);
app.use("/", routes);

app.use(errorHandler);

export default app;
