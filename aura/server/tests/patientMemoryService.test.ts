import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

const vectorMock = vi.hoisted(() => {
  class MockPatientMemoryVectorUnavailable extends Error {
    constructor(message = "PGVector patient memory unavailable") {
      super(message);
      this.name = "PatientMemoryVectorUnavailable";
    }
  }

  return {
    PatientMemoryVectorUnavailable: MockPatientMemoryVectorUnavailable,
    mirrorPatientMemoryVector: vi.fn(),
    retrievePatientMemoryVectors: vi.fn(),
  };
});

vi.mock("../src/services/patientMemoryVectorService", () => vectorMock);

import { env } from "../src/env";
import PatientMemory from "../src/models/PatientMemory";
import {
  extractLowRiskMemoryCandidate,
  getRelevantPatientMemories,
  saveLowRiskMemory,
} from "../src/services/patientMemoryService";

describe("patientMemoryService", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as {
    RAG_PGVECTOR_PATIENT_MEMORY_ENABLED: boolean;
    RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED: boolean;
  };
  const originalPgvectorEnabled = mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED;
  const originalPgvectorFallbackEnabled =
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vectorMock.mirrorPatientMemoryVector.mockReset();
    vectorMock.retrievePatientMemoryVectors.mockReset();
    vectorMock.mirrorPatientMemoryVector.mockResolvedValue({ mirrored: false });
    vectorMock.retrievePatientMemoryVectors.mockRejectedValue(
      new vectorMock.PatientMemoryVectorUnavailable()
    );
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = originalPgvectorEnabled;
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED =
      originalPgvectorFallbackEnabled;
    await PatientMemory.deleteMany({});
  });

  it("extracts deterministic low-risk memory candidates from allowlisted patterns", () => {
    expect(
      extractLowRiskMemoryCandidate("My goal is to walk upstairs confidently.")
    ).toMatchObject({
      memoryType: "goal",
      summary: "Patient's current goal is to walk upstairs confidently.",
    });
    expect(extractLowRiskMemoryCandidate("I prefer short reminders.")).toMatchObject({
      memoryType: "preference",
      summary: "Patient prefers short reminders.",
    });
    expect(
      extractLowRiskMemoryCandidate("I often miss exercises after work.")
    ).toMatchObject({
      memoryType: "barrier",
      summary: "Patient often misses exercises after work.",
    });
    expect(extractLowRiskMemoryCandidate("Remind me to log symptoms.")).toMatchObject({
      memoryType: "support_need",
      summary: "Patient benefits from reminders to log symptoms.",
    });
  });

  it("skips unsafe or sensitive memory candidates", async () => {
    const blockedTexts = [
      "My goal is to call emergency services because I feel unsafe.",
      "My goal is to take 50 mg of medication.",
      "I prefer reminders at 077 123 4567.",
      "Remind me to use password hunter2.",
      "My goal is to help my wife with her medication.",
    ];

    for (const text of blockedTexts) {
      expect(extractLowRiskMemoryCandidate(text)).toBeNull();
      await expect(
        saveLowRiskMemory({
          patientId: "p1",
          text,
          riskLevel: "low",
          reasonCodes: [],
        })
      ).resolves.toBeNull();
    }

    expect(await PatientMemory.countDocuments({ patientId: "p1" })).toBe(0);
  });

  it("never saves high-risk text as memory", async () => {
    const saved = await saveLowRiskMemory({
      patientId: "p1",
      text: "My goal is to walk upstairs confidently.",
      riskLevel: "high",
      reasonCodes: ["CRISIS_LANGUAGE"],
    });

    expect(saved).toBeNull();
    expect(await PatientMemory.countDocuments({ patientId: "p1" })).toBe(0);
    expect(vectorMock.mirrorPatientMemoryVector).not.toHaveBeenCalled();
  });

  it("bounds memory summaries to 240 characters", () => {
    const overlongGoal = `My goal is to ${"walk ".repeat(70)}`;

    expect(extractLowRiskMemoryCandidate(overlongGoal)).toBeNull();
  });

  it("retrieves at most three active memories for the exact same patient", async () => {
    await PatientMemory.create([
      {
        patientId: "p1",
        memoryType: "preference",
        summary: "Patient prefers short reminders.",
        sourceKind: "low_risk_chat",
      },
      {
        patientId: "p1",
        memoryType: "goal",
        summary: "Patient's current goal is to walk upstairs confidently.",
        sourceKind: "low_risk_chat",
      },
      {
        patientId: "p1",
        memoryType: "support_need",
        summary: "Patient benefits from reminders to log symptoms.",
        sourceKind: "low_risk_chat",
      },
      {
        patientId: "p1",
        memoryType: "barrier",
        summary: "Patient often misses exercises after work.",
        sourceKind: "low_risk_chat",
      },
      {
        patientId: "p2",
        memoryType: "preference",
        summary: "Patient prefers long reminders.",
        sourceKind: "low_risk_chat",
      },
      {
        patientId: "p1",
        memoryType: "recent_pattern",
        summary: "Patient often reports evening soreness.",
        sourceKind: "low_risk_chat",
        status: "superseded",
      },
    ]);

    const memories = await getRelevantPatientMemories({
      patientId: "p1",
      query: "Please keep symptom reminders short.",
    });

    expect(memories).toHaveLength(3);
    expect(memories.map((memory) => memory.summary)).toContain(
      "Patient prefers short reminders."
    );
    expect(JSON.stringify(memories)).not.toContain("long reminders");
    expect(JSON.stringify(memories)).not.toContain("evening soreness");
  });

  it("mirrors sanitized low-risk memory summaries to PGVector when enabled", async () => {
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = true;
    vectorMock.mirrorPatientMemoryVector.mockResolvedValue({ mirrored: true });

    const saved = await saveLowRiskMemory({
      patientId: "p1",
      text: "My goal is to walk upstairs confidently.",
      sourceRefId: "message-1",
      riskLevel: "low",
      reasonCodes: [],
    });

    expect(saved).toMatchObject({
      memoryType: "goal",
      summary: "Patient's current goal is to walk upstairs confidently.",
    });
    expect(vectorMock.mirrorPatientMemoryVector).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "p1",
        memoryType: "goal",
        sourceKind: "low_risk_chat",
        status: "active",
        summary: "Patient's current goal is to walk upstairs confidently.",
      })
    );
    expect(JSON.stringify(vectorMock.mirrorPatientMemoryVector.mock.calls[0][0])).not.toContain(
      "My goal is"
    );
  });

  it("does not mirror unsafe candidates to PGVector", async () => {
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = true;

    const saved = await saveLowRiskMemory({
      patientId: "p1",
      text: "My goal is to take 50 mg of medication.",
      riskLevel: "low",
      reasonCodes: [],
    });

    expect(saved).toBeNull();
    expect(vectorMock.mirrorPatientMemoryVector).not.toHaveBeenCalled();
  });

  it("uses MongoDB lexical retrieval when PGVector patient memory is disabled", async () => {
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = false;
    await PatientMemory.create({
      patientId: "p1",
      memoryType: "preference",
      summary: "Patient prefers short reminders.",
      sourceKind: "low_risk_chat",
    });

    const memories = await getRelevantPatientMemories({
      patientId: "p1",
      query: "short reminders",
    });

    expect(memories).toHaveLength(1);
    expect(memories[0].summary).toBe("Patient prefers short reminders.");
    expect(vectorMock.retrievePatientMemoryVectors).not.toHaveBeenCalled();
  });

  it("falls back to MongoDB lexical retrieval when PGVector errors", async () => {
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = true;
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED = true;
    vectorMock.retrievePatientMemoryVectors.mockRejectedValue(
      new vectorMock.PatientMemoryVectorUnavailable("table missing")
    );
    await PatientMemory.create([
      {
        patientId: "p1",
        memoryType: "preference",
        summary: "Patient prefers short reminders.",
        sourceKind: "low_risk_chat",
      },
      {
        patientId: "p2",
        memoryType: "preference",
        summary: "Patient prefers long reminders.",
        sourceKind: "low_risk_chat",
      },
    ]);

    const memories = await getRelevantPatientMemories({
      patientId: "p1",
      query: "short reminders",
    });

    expect(vectorMock.retrievePatientMemoryVectors).toHaveBeenCalledWith({
      patientId: "p1",
      query: "short reminders",
      limit: undefined,
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].summary).toBe("Patient prefers short reminders.");
    expect(JSON.stringify(memories)).not.toContain("long reminders");
  });

  it("returns same-patient PGVector memories when available", async () => {
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = true;
    vectorMock.retrievePatientMemoryVectors.mockResolvedValue([
      {
        id: "memory-p1",
        memoryType: "preference",
        summary: "Patient prefers short reminders.",
        sourceKind: "low_risk_chat",
        score: 0.91,
      },
    ]);

    const memories = await getRelevantPatientMemories({
      patientId: "p1",
      query: "short reminders",
    });

    expect(memories).toEqual([
      {
        id: "memory-p1",
        memoryType: "preference",
        summary: "Patient prefers short reminders.",
        sourceKind: "low_risk_chat",
        score: 0.91,
      },
    ]);
    expect(vectorMock.retrievePatientMemoryVectors).toHaveBeenCalledWith({
      patientId: "p1",
      query: "short reminders",
      limit: undefined,
    });
  });
});
