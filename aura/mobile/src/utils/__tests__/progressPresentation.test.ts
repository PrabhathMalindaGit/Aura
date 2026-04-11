import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckInItem } from "@/src/api/patient";
import {
  buildProgressHistoryRows,
  buildProgressStoryCopy,
} from "@/src/utils/progressPresentation";

describe("progressPresentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the trend-story concept specific and patient-readable", () => {
    const copy = buildProgressStoryCopy(
      [
        {
          key: "pain",
          title: "Pain",
          assessment: "Improving",
          deltaValue: -1.2,
          direction: "down",
          hasData: true,
        },
        {
          key: "mood",
          title: "Mood",
          assessment: "Stable",
          deltaValue: 0.1,
          direction: "flat",
          hasData: true,
        },
        {
          key: "adherence",
          title: "Exercise adherence",
          assessment: "Stable",
          deltaValue: 2,
          direction: "flat",
          hasData: true,
        },
      ],
      30,
      6,
    );

    expect(copy.title).toBe("Pain improved 1.2 points over 30 days");
    expect(copy.body).toContain("6 check-ins in view");
  });

  it("groups history into week headers without repeating the week label for every entry", () => {
    const items: CheckInItem[] = [
      {
        id: "checkin-1",
        date: "2026-04-10T09:00:00.000Z",
        pain: 4,
        mood: 3,
      },
      {
        id: "checkin-2",
        date: "2026-04-08T09:00:00.000Z",
        pain: 5,
        mood: 3,
      },
      {
        id: "checkin-3",
        date: "2026-04-02T09:00:00.000Z",
        pain: 6,
        mood: 2,
      },
    ];

    const rows = buildProgressHistoryRows(items, new Date("2026-04-11T12:00:00.000Z"));

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ type: "header", label: "This week" });
    expect(rows[1]).toMatchObject({ type: "item", key: "checkin-1" });
    expect(rows[2]).toMatchObject({ type: "item", key: "checkin-2" });
    expect(rows[3]).toMatchObject({ type: "header", label: "Last week" });
    expect(rows[4]).toMatchObject({ type: "item", key: "checkin-3" });
  });
});
