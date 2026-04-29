import { describe, expect, it } from "vitest";

import { fallbackSafetyClassify } from "../src/services/fallbackSafetyClassifier";

describe("fallbackSafetyClassify", () => {
  it("keeps pain seven high with the threshold reason", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "checkin",
          pain: 7,
          text: "Pain persists after walking.",
        },
        7
      )
    ).toEqual({
      risk: "high",
      reasons: ["PAIN_GE_THRESHOLD"],
    });
  });

  it("classifies urgent help app navigation context as low", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "chat",
          text: "I need urgent help finding the settings button.",
        },
        7
      )
    ).toEqual({
      risk: "low",
      reasons: [],
    });
  });

  it("keeps urgent help alone high", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "chat",
          text: "I need urgent help.",
        },
        7
      )
    ).toEqual({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });
  });

  it("classifies urgent help clinical context as high", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "chat",
          text: "I need urgent help because I can't breathe.",
        },
        7
      )
    ).toEqual({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });
  });

  it("classifies urgent help password context as low", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "chat",
          text: "I need urgent help with my password.",
        },
        7
      )
    ).toEqual({
      risk: "low",
      reasons: [],
    });
  });

  it("classifies passive crisis language as high", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "chat",
          text: "I do not want to wake up anymore.",
        },
        7
      )
    ).toEqual({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });
  });

  it("keeps existing explicit crisis phrases high", () => {
    expect(
      fallbackSafetyClassify(
        {
          type: "chat",
          text: "I might kill myself tonight.",
        },
        7
      )
    ).toEqual({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });
  });
});
