import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REQUEST_ID_HEADER,
  requestContextMiddleware,
} from "../src/middleware/requestContext";
import { logger } from "../src/utils/logger";

function buildApp() {
  const app = express();
  app.use(requestContextMiddleware);
  app.get("/echo", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.options("/echo", (_req, res) => {
    res.sendStatus(204);
  });
  return app;
}

describe("requestContextMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("echoes a safe inbound x-request-id and logs one completion event", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

    const response = await request(buildApp())
      .get("/echo")
      .set(REQUEST_ID_HEADER, "req-safe-123");

    expect(response.status).toBe(200);
    expect(response.headers[REQUEST_ID_HEADER]).toBe("req-safe-123");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      "http.request.completed",
      expect.objectContaining({
        requestId: "req-safe-123",
        method: "GET",
        route: "/echo",
        statusCode: 200,
      })
    );
  });

  it("replaces malformed or overlong inbound x-request-id values safely", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const invalidRequestId = "bad request id with spaces";
    const overlongRequestId = "x".repeat(129);

    const malformedResponse = await request(buildApp())
      .get("/echo")
      .set(REQUEST_ID_HEADER, invalidRequestId);
    const overlongResponse = await request(buildApp())
      .get("/echo")
      .set(REQUEST_ID_HEADER, overlongRequestId);

    expect(malformedResponse.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(malformedResponse.headers[REQUEST_ID_HEADER]).not.toBe(invalidRequestId);
    expect(overlongResponse.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(overlongResponse.headers[REQUEST_ID_HEADER]).not.toBe(overlongRequestId);
    expect(infoSpy).toHaveBeenCalledTimes(2);
  });

  it("skips completion logs for health and OPTIONS requests", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

    await request(buildApp()).get("/health");
    await request(buildApp()).options("/echo");

    expect(infoSpy).not.toHaveBeenCalled();
  });
});
