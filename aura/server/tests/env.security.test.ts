import { describe, expect, it } from "vitest";

import { assertRuntimeEnvSafety } from "../src/env";

describe("runtime env safety checks", () => {
  it("throws when clinician auth bypass is enabled outside tests", () => {
    expect(() =>
      assertRuntimeEnvSafety({
        NODE_ENV: "production",
        ALLOW_UNAUTH_CLINICIAN_BODY_IDS: true,
      })
    ).toThrow(/NODE_ENV=test/);
  });

  it("allows clinician auth bypass only in tests", () => {
    expect(() =>
      assertRuntimeEnvSafety({
        NODE_ENV: "test",
        ALLOW_UNAUTH_CLINICIAN_BODY_IDS: true,
      })
    ).not.toThrow();
  });

  it("allows normal production mode when bypass is disabled", () => {
    expect(() =>
      assertRuntimeEnvSafety({
        NODE_ENV: "production",
        ALLOW_UNAUTH_CLINICIAN_BODY_IDS: false,
      })
    ).not.toThrow();
  });
});
