import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/env";
import { logger } from "../src/utils/logger";

describe("server logger", () => {
  const mutableEnv = env as unknown as { LOG_LEVEL: "debug" | "info" | "warn" | "error" };
  const originalLogLevel = mutableEnv.LOG_LEVEL;

  beforeEach(() => {
    mutableEnv.LOG_LEVEL = "info";
  });

  afterEach(() => {
    mutableEnv.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it("writes structured JSON lines behind logger.info", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("notification.job.enqueued", {
      requestId: "req-1",
      alertId: "alert-1",
      occurredAt: new Date("2026-07-01T09:00:00.000Z"),
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const rawLine = logSpy.mock.calls[0]?.[0];
    expect(typeof rawLine).toBe("string");

    const payload = JSON.parse(String(rawLine)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      level: "info",
      event: "notification.job.enqueued",
      requestId: "req-1",
      alertId: "alert-1",
      occurredAt: "2026-07-01T09:00:00.000Z",
    });
    expect(typeof payload.ts).toBe("string");
  });

  it("respects LOG_LEVEL filtering", () => {
    mutableEnv.LOG_LEVEL = "warn";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.info("http.request.completed", { requestId: "req-2" });
    logger.warn("notification.job.dispatch_failed", { requestId: "req-2" });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
