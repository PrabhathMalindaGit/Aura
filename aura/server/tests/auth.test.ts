import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
import LoginThrottle from "../src/models/LoginThrottle";
import User from "../src/models/User";
import { hashPassword } from "../src/utils/password";

describe("POST /auth/clinician/login", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as { JWT_SECRET: string };
  const originalJwtSecret = mutableEnv.JWT_SECRET;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.JWT_SECRET = originalJwtSecret;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    mutableEnv.JWT_SECRET = "test-jwt-secret";
    await Promise.all([User.deleteMany({}), LoginThrottle.deleteMany({})]);
  });

  it("returns token for valid clinician credentials", async () => {
    const passwordHash = await hashPassword("devpass123");
    await User.create({
      email: "clinician1@example.com",
      passwordHash,
      role: "clinician",
      displayName: "Clinician One",
    });

    const response = await request(app).post("/auth/clinician/login").send({
      email: "clinician1@example.com",
      password: "devpass123",
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(typeof response.body.token).toBe("string");
    expect(response.body.clinician).toMatchObject({
      email: "clinician1@example.com",
      name: "Clinician One",
      role: "clinician",
    });
  });

  it("returns 401 for invalid credentials", async () => {
    const passwordHash = await hashPassword("devpass123");
    await User.create({
      email: "clinician2@example.com",
      passwordHash,
      role: "clinician",
      displayName: "Clinician Two",
    });

    const response = await request(app).post("/auth/clinician/login").send({
      email: "clinician2@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 429 after repeated failed clinician login attempts", async () => {
    const passwordHash = await hashPassword("devpass123");
    await User.create({
      email: "clinician3@example.com",
      passwordHash,
      role: "clinician",
      displayName: "Clinician Three",
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post("/auth/clinician/login").send({
        email: "clinician3@example.com",
        password: "wrong-password",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("UNAUTHORIZED");
    }

    const throttledResponse = await request(app).post("/auth/clinician/login").send({
      email: "clinician3@example.com",
      password: "wrong-password",
    });

    expect(throttledResponse.status).toBe(429);
    expect(throttledResponse.body).toMatchObject({
      ok: false,
      error: "TOO_MANY_REQUESTS",
    });
    expect(typeof throttledResponse.body.retryAfterSeconds).toBe("number");
    expect(throttledResponse.body.retryAfterSeconds).toBeGreaterThan(0);
  }, 20_000);

  it("returns canonical clinician bootstrap data for a valid token", async () => {
    const passwordHash = await hashPassword("devpass123");
    const user = await User.create({
      email: "clinician4@example.com",
      passwordHash,
      role: "clinician",
      displayName: "Clinician Four",
    });

    const loginResponse = await request(app).post("/auth/clinician/login").send({
      email: "clinician4@example.com",
      password: "devpass123",
    });

    expect(loginResponse.status).toBe(200);

    const meResponse = await request(app)
      .get("/auth/clinician/me")
      .set("Authorization", `Bearer ${loginResponse.body.token as string}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toEqual({
      ok: true,
      clinician: {
        id: String(user._id),
        email: "clinician4@example.com",
        name: "Clinician Four",
        role: "clinician",
      },
    });
  });

  it("accepts older clinician tokens without sessionVersion when the live user version is zero", async () => {
    const passwordHash = await hashPassword("devpass123");
    const user = await User.create({
      email: "clinician5@example.com",
      passwordHash,
      role: "clinician",
      displayName: "Clinician Five",
      sessionVersion: 0,
    });

    const legacyToken = jwt.sign(
      {
        role: "clinician",
        email: "clinician5@example.com",
        name: "Clinician Five",
      },
      mutableEnv.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "8h",
        subject: String(user._id),
      }
    );

    const response = await request(app)
      .get("/auth/clinician/me")
      .set("Authorization", `Bearer ${legacyToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      clinician: {
        id: String(user._id),
        email: "clinician5@example.com",
        name: "Clinician Five",
        role: "clinician",
      },
    });
  });
});
