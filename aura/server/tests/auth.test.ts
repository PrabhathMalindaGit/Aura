import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
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
    await User.deleteMany({});
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
});
