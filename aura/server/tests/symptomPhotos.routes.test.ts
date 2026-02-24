import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Patient from "../src/models/Patient";
import SymptomPhoto from "../src/models/SymptomPhoto";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ0mJp0AAAAASUVORK5CYII=",
  "base64"
);

describe("symptom photo routes", () => {
  let mongoServer: MongoMemoryServer | null = null;
  let uploadsRoot = "";
  let previousUploadsDir: string | undefined;
  let previousSymptomDir: string | undefined;
  let previousMaxPhotoMb: string | undefined;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aura-photo-upload-test-"));
    previousUploadsDir = process.env.UPLOADS_DIR;
    previousSymptomDir = process.env.SYMPTOM_PHOTOS_DIR;
    previousMaxPhotoMb = process.env.MAX_PHOTO_MB;
    process.env.UPLOADS_DIR = uploadsRoot;
    process.env.SYMPTOM_PHOTOS_DIR = path.join(uploadsRoot, "symptoms");
    process.env.MAX_PHOTO_MB = "5";
  });

  afterAll(async () => {
    if (previousUploadsDir === undefined) {
      delete process.env.UPLOADS_DIR;
    } else {
      process.env.UPLOADS_DIR = previousUploadsDir;
    }

    if (previousSymptomDir === undefined) {
      delete process.env.SYMPTOM_PHOTOS_DIR;
    } else {
      process.env.SYMPTOM_PHOTOS_DIR = previousSymptomDir;
    }

    if (previousMaxPhotoMb === undefined) {
      delete process.env.MAX_PHOTO_MB;
    } else {
      process.env.MAX_PHOTO_MB = previousMaxPhotoMb;
    }

    if (uploadsRoot) {
      await fs.rm(uploadsRoot, { recursive: true, force: true });
    }

    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Promise.all([SymptomPhoto.deleteMany({}), Patient.deleteMany({})]);
    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
  });

  function patientToken(patientId: string): string {
    return signPatientToken({ id: patientId, displayName: `Patient ${patientId}` });
  }

  function clinicianToken(): string {
    return signAuthToken({
      id: "clinician-1",
      role: "clinician",
      email: "clinician@example.com",
      name: "Clinician One",
    });
  }

  it("patient can upload and list photos", async () => {
    const upload = await request(app)
      .post("/patient/photos")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .field("date", "2026-03-01")
      .field("kind", "swelling")
      .field("note", "Mild swelling after exercise")
      .attach("file", ONE_PIXEL_PNG, {
        filename: "symptom.png",
        contentType: "image/png",
      });

    expect(upload.status).toBe(200);
    expect(upload.body.ok).toBe(true);
    expect(upload.body.date).toBe("2026-03-01");
    expect(upload.body.kind).toBe("swelling");

    const listed = await request(app)
      .get("/patient/photos?limit=20")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(listed.status).toBe(200);
    expect(listed.body.ok).toBe(true);
    expect(Array.isArray(listed.body.items)).toBe(true);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      id: upload.body.id,
      date: "2026-03-01",
      kind: "swelling",
    });
  });

  it("patient can fetch photo metadata and file", async () => {
    const uploaded = await request(app)
      .post("/patient/photos")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .field("kind", "rash")
      .field("note", "Minor redness")
      .attach("file", ONE_PIXEL_PNG, {
        filename: "rash.png",
        contentType: "image/png",
      });

    expect(uploaded.status).toBe(200);
    const photoId = uploaded.body.id as string;

    const meta = await request(app)
      .get(`/patient/photos/${photoId}/meta`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(meta.status).toBe(200);
    expect(meta.body.ok).toBe(true);
    expect(meta.body.id).toBe(photoId);
    expect(meta.body.kind).toBe("rash");
    expect(meta.body.mimeType).toBe("image/png");
    expect(meta.body.sizeBytes).toBeGreaterThan(0);
    expect(meta.body.note).toBe("Minor redness");

    const file = await request(app)
      .get(`/patient/photos/${photoId}/file`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["cache-control"]).toContain("private");
    expect(file.body.length).toBeGreaterThan(0);
  });

  it("patient cannot fetch another patient's photo", async () => {
    const uploaded = await request(app)
      .post("/patient/photos")
      .set("Authorization", `Bearer ${patientToken("p2")}`)
      .field("kind", "wound")
      .attach("file", ONE_PIXEL_PNG, {
        filename: "wound.png",
        contentType: "image/png",
      });
    expect(uploaded.status).toBe(200);
    const photoId = uploaded.body.id as string;

    const deniedMeta = await request(app)
      .get(`/patient/photos/${photoId}/meta`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(deniedMeta.status).toBe(404);

    const deniedFile = await request(app)
      .get(`/patient/photos/${photoId}/file`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(deniedFile.status).toBe(404);
  });

  it("rejects invalid mime type and oversize payload", async () => {
    const invalidMime = await request(app)
      .post("/patient/photos")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .field("kind", "other")
      .attach("file", Buffer.from("plain text payload", "utf8"), {
        filename: "bad.txt",
        contentType: "text/plain",
      });

    expect(invalidMime.status).toBe(400);
    expect(invalidMime.body.error).toBe("VALIDATION_ERROR");

    process.env.MAX_PHOTO_MB = "1";
    const tooLarge = await request(app)
      .post("/patient/photos")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .field("kind", "other")
      .attach("file", Buffer.alloc(1024 * 1024 + 1, 1), {
        filename: "big.png",
        contentType: "image/png",
      });

    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error).toBe("VALIDATION_ERROR");

    process.env.MAX_PHOTO_MB = "5";
  });

  it("clinician can list and fetch patient photos", async () => {
    const uploaded = await request(app)
      .post("/patient/photos")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .field("date", "2026-03-05")
      .field("kind", "swelling")
      .field("note", "Clinician should review")
      .attach("file", ONE_PIXEL_PNG, {
        filename: "review.png",
        contentType: "image/png",
      });
    expect(uploaded.status).toBe(200);
    const photoId = uploaded.body.id as string;

    const list = await request(app)
      .get("/clinician/patients/p1/photos?limit=10")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    expect(list.body.patientId).toBe("p1");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(photoId);

    const meta = await request(app)
      .get(`/clinician/photos/${photoId}/meta`)
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(meta.status).toBe(200);
    expect(meta.body.ok).toBe(true);
    expect(meta.body.patientId).toBe("p1");

    const file = await request(app)
      .get(`/clinician/photos/${photoId}/file`)
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
  });
});
