import CheckIn from "../models/CheckIn";
import ExercisePlan from "../models/ExercisePlan";
import Patient from "../models/Patient";
import { getPatientCareStatus } from "./patientCareStatusService";
import { generateWeeklyReport } from "./weeklyReportService";

export type DischargeSummary = {
  patientId: string;
  patientName: string;
  status: "discharged" | "inactive";
  dischargedAt?: string;
  independentModeEnabled: boolean;
  summary?: string;
  recentTrendSummary: string;
  weeklyHeadline?: string;
  planStatus: string;
  nextSteps: string[];
  safetyInstructions: string[];
  generatedAt: string;
};

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(now.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate()
  ).padStart(2, "0")}`;
}

export async function buildDischargeSummary(patientIdInput: string): Promise<DischargeSummary | null> {
  const patientId = patientIdInput.trim();
  if (!patientId) {
    return null;
  }

  const [patient, careStatus, recentCheckins, plan, weeklyReport] = await Promise.all([
    Patient.findOne({ patientId }).lean(),
    getPatientCareStatus(patientId),
    CheckIn.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(6)
      .select({ pain: 1, mood: 1, createdAt: 1 })
      .lean(),
    ExercisePlan.findOne({ patientId }).lean(),
    generateWeeklyReport({
      patientId,
      weekStart: toCurrentWeekStart(),
      tzOffsetMinutes: 0,
    }).catch(() => null),
  ]);

  if (!patient) {
    return null;
  }

  const painValues = recentCheckins
    .map((item) => (typeof item.pain === "number" ? item.pain : null))
    .filter((item): item is number => item !== null);
  const painRecent = average(painValues.slice(0, 3));
  const painPrevious = average(painValues.slice(3, 6));

  const trendSummary =
    painRecent !== null && painPrevious !== null
      ? painRecent <= painPrevious - 0.75
        ? `Pain has improved by ${Math.abs(painRecent - painPrevious).toFixed(1)} point${
            Math.abs(painRecent - painPrevious) >= 1.5 ? "s" : ""
          } over the recent review window.`
        : painRecent >= painPrevious + 0.75
          ? `Pain has been ${Math.abs(painRecent - painPrevious).toFixed(1)} point${
              Math.abs(painRecent - painPrevious) >= 1.5 ? "s" : ""
            } higher over the recent review window.`
          : "Recent recovery signals have remained broadly stable."
      : "Recent recovery signals are available to review in Progress.";

  return {
    patientId,
    patientName:
      typeof patient.displayName === "string" && patient.displayName.trim().length > 0
        ? patient.displayName
        : patientId,
    status: careStatus.status === "inactive" ? "inactive" : "discharged",
    dischargedAt: careStatus.discharge?.dischargedAt,
    independentModeEnabled: careStatus.discharge?.independentModeEnabled === true,
    summary: careStatus.discharge?.summary,
    recentTrendSummary: trendSummary,
    weeklyHeadline: weeklyReport?.summary.headline,
    planStatus: plan
      ? plan.items.length > 0
        ? `Plan version ${typeof plan.version === "number" ? plan.version : 1}`
        : "Plan assigned with no scheduled items"
      : "No active exercise plan",
    nextSteps: careStatus.discharge?.independentModeEnabled
      ? [
          "Use Today and Progress to continue self-tracking.",
          "Contact your clinic directly if your recovery changes or you need new care.",
        ]
      : [
          "Review your recent recovery summary and next care instructions.",
          "Contact your clinic directly if you need further support.",
        ],
    safetyInstructions: [
      careStatus.discharge?.contactInstructions ||
        "If you feel unsafe or need urgent help, use your local emergency services or crisis support.",
      careStatus.discharge?.independentModeEnabled
        ? "Independent tracking does not mean your care team is monitoring new entries in real time."
        : "Routine clinician monitoring is no longer active in this care state.",
    ],
    generatedAt: new Date().toISOString(),
  };
}
