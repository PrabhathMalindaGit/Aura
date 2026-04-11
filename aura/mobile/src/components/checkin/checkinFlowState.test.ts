import { describe, expect, it } from "vitest";

import {
  getCheckinPrimaryActionLabel,
  getCheckinStepVisualState,
  resolveCheckinHelperNotice,
} from "@/src/components/checkin/checkinFlowState";

describe("check-in flow helpers", () => {
  it("keeps the four-step progression labels aligned with the redesign", () => {
    expect(getCheckinPrimaryActionLabel(0)).toBe("Continue to Recovery");
    expect(getCheckinPrimaryActionLabel(1)).toBe("Continue to Support");
    expect(getCheckinPrimaryActionLabel(2)).toBe("Continue to Review");
    expect(getCheckinPrimaryActionLabel(3)).toBe("Submit check-in");
  });

  it("marks steps as done, active, or upcoming from the current step", () => {
    expect(getCheckinStepVisualState(0, 2)).toBe("done");
    expect(getCheckinStepVisualState(1, 2)).toBe("done");
    expect(getCheckinStepVisualState(2, 2)).toBe("active");
    expect(getCheckinStepVisualState(3, 2)).toBe("upcoming");
  });

  it("suppresses the duplicated generic validation banner when inline validation is present", () => {
    expect(
      resolveCheckinHelperNotice(
        {
          variant: "warning",
          title: "Check your entries",
          message: "Please review the highlighted field.",
        },
        "Choose the number that best matches your mood today.",
      ),
    ).toBeNull();
  });

  it("keeps non-validation helper notices available", () => {
    const notice = {
      variant: "warning" as const,
      title: "Body map limit",
      message: "Select up to 6 body areas.",
    };

    expect(resolveCheckinHelperNotice(notice, "Choose your mood")).toEqual(notice);
  });
});
