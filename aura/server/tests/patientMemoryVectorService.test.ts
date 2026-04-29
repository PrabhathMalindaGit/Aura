import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => {
  const query = vi.fn();
  const Pool = vi.fn(() => ({ query }));
  return { Pool, query };
});

vi.mock("pg", () => ({
  Pool: pgMock.Pool,
}));

import { env } from "../src/env";
import {
  PatientMemoryVectorUnavailable,
  ensurePatientMemoryVectorSchema,
  mirrorPatientMemoryVector,
  retrievePatientMemoryVectors,
} from "../src/services/patientMemoryVectorService";

describe("patientMemoryVectorService", () => {
  const mutableEnv = env as unknown as {
    RAG_PGVECTOR_DATABASE_URL: string;
    RAG_PGVECTOR_DIMENSIONS: number;
    RAG_PGVECTOR_PATIENT_MEMORY_ENABLED: boolean;
    RAG_PGVECTOR_PATIENT_MEMORY_TOP_K: number;
  };
  const originalDatabaseUrl = mutableEnv.RAG_PGVECTOR_DATABASE_URL;
  const originalDimensions = mutableEnv.RAG_PGVECTOR_DIMENSIONS;
  const originalEnabled = mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED;
  const originalTopK = mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K;

  beforeEach(() => {
    mutableEnv.RAG_PGVECTOR_DATABASE_URL =
      "postgresql://aura:aura@localhost:5432/aura_vectors";
    mutableEnv.RAG_PGVECTOR_DIMENSIONS = 384;
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = true;
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K = 3;
    pgMock.Pool.mockClear();
    pgMock.query.mockReset();
    pgMock.query.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    mutableEnv.RAG_PGVECTOR_DATABASE_URL = originalDatabaseUrl;
    mutableEnv.RAG_PGVECTOR_DIMENSIONS = originalDimensions;
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = originalEnabled;
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_TOP_K = originalTopK;
  });

  it("creates the patient memory vector schema and indexes", async () => {
    await ensurePatientMemoryVectorSchema();

    const sql = pgMock.query.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sql).toContain("create extension if not exists vector");
    expect(sql).toContain("create table if not exists patient_memory_vectors");
    expect(sql).toContain("memory_id text primary key");
    expect(sql).toContain("embedding vector(384)");
    expect(sql).toContain("(patient_id, status, updated_at desc)");
  });

  it("upserts only the sanitized summary and never receives raw chat text", async () => {
    await mirrorPatientMemoryVector({
      memoryId: "memory-1",
      patientId: "patient-1",
      memoryType: "preference",
      sourceKind: "low_risk_chat",
      status: "active",
      summary: "Patient prefers short reminders.",
    });

    const upsertCall = pgMock.query.mock.calls.find((call) =>
      String(call[0]).includes("insert into patient_memory_vectors")
    );
    expect(upsertCall).toBeTruthy();
    expect(JSON.stringify(upsertCall?.[1])).toContain("Patient prefers short reminders.");
    expect(JSON.stringify(upsertCall?.[1])).not.toContain("I prefer short reminders");
  });

  it("skips unsafe summaries before they reach PGVector", async () => {
    const result = await mirrorPatientMemoryVector({
      memoryId: "memory-unsafe",
      patientId: "patient-1",
      memoryType: "goal",
      sourceKind: "low_risk_chat",
      status: "active",
      summary: "Patient's current goal is to walk with Sarah.",
    });

    expect(result).toEqual({ mirrored: false, reason: "unsafe_summary" });
    expect(pgMock.query).not.toHaveBeenCalled();
  });

  it("returns empty results for blank patientId without querying PGVector", async () => {
    const results = await retrievePatientMemoryVectors({
      patientId: "   ",
      query: "short reminders",
    });

    expect(results).toEqual([]);
    expect(pgMock.query).not.toHaveBeenCalled();
  });

  it("requires PGVector patient memory to be enabled before retrieval", async () => {
    mutableEnv.RAG_PGVECTOR_PATIENT_MEMORY_ENABLED = false;

    await expect(
      retrievePatientMemoryVectors({
        patientId: "patient-1",
        query: "short reminders",
      })
    ).rejects.toBeInstanceOf(PatientMemoryVectorUnavailable);
  });

  it("filters retrieval by exact patient_id, active status, expiry, and limit 3", async () => {
    pgMock.query.mockResolvedValueOnce({
      rows: [
        {
          memory_id: "memory-1",
          memory_type: "preference",
          source_kind: "low_risk_chat",
          summary: "Patient prefers short reminders.",
          score: "0.8",
        },
      ],
    });

    const results = await retrievePatientMemoryVectors({
      patientId: "patient-1",
      query: "Please keep reminders short.",
      limit: 10,
    });

    expect(results).toHaveLength(1);
    const retrievalCall = pgMock.query.mock.calls[0];
    expect(String(retrievalCall[0])).toContain("where patient_id = $1");
    expect(String(retrievalCall[0])).toContain("and status = 'active'");
    expect(String(retrievalCall[0])).toContain(
      "and (expires_at is null or expires_at > now())"
    );
    expect(retrievalCall[1]).toEqual(["patient-1", expect.any(String), 3]);
  });

  it("wraps PGVector retrieval errors as unavailable", async () => {
    pgMock.query.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      retrievePatientMemoryVectors({
        patientId: "patient-1",
        query: "short reminders",
      })
    ).rejects.toBeInstanceOf(PatientMemoryVectorUnavailable);
  });
});
