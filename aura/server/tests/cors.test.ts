import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import app from "../src/app";
import { env } from "../src/env";

describe("server CORS policy", () => {
  const mutableEnv = env as unknown as {
    NODE_ENV: string;
    CORS_ALLOWED_ORIGINS: string[];
  };
  const originalNodeEnv = mutableEnv.NODE_ENV;
  const originalAllowedOrigins = [...mutableEnv.CORS_ALLOWED_ORIGINS];

  afterEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv;
    mutableEnv.CORS_ALLOWED_ORIGINS = [...originalAllowedOrigins];
  });

  it("allows active local dashboard origins during local/test runs", async () => {
    mutableEnv.NODE_ENV = "test";
    mutableEnv.CORS_ALLOWED_ORIGINS = [];

    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
  });

  it("allows configured non-local origins", async () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.CORS_ALLOWED_ORIGINS = ["https://dashboard.example.com"];

    const response = await request(app)
      .get("/health")
      .set("Origin", "https://dashboard.example.com");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://dashboard.example.com"
    );
  });

  it("does not emit CORS allow headers for disallowed origins", async () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.CORS_ALLOWED_ORIGINS = ["https://dashboard.example.com"];

    const response = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests that do not send an Origin header", async () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.CORS_ALLOWED_ORIGINS = ["https://dashboard.example.com"];

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("handles allowed preflight requests for local origins", async () => {
    mutableEnv.NODE_ENV = "test";
    mutableEnv.CORS_ALLOWED_ORIGINS = [];

    const response = await request(app)
      .options("/patient/auth/login")
      .set("Origin", "http://localhost:8082")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8082"
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("emits CORS allow headers for browser-style patient login POSTs", async () => {
    mutableEnv.NODE_ENV = "test";
    mutableEnv.CORS_ALLOWED_ORIGINS = [];

    const response = await request(app)
      .post("/patient/auth/login")
      .set("Origin", "http://localhost:8082")
      .send({});

    expect(response.status).toBe(400);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8082"
    );
  });
});
