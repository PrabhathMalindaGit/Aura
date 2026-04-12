import Patient from "../models/Patient";
import { buildDischargeSummary } from "./dischargeSummaryService";
import {
  getPatientDischargeCareState,
  mapPatientCareStatus,
  type PatientDischargeCareState,
  type PatientStatusValue,
} from "./patientCareStatusService";
import { generateWeeklyReport } from "./weeklyReportService";

export type DischargeExportDocument = {
  patientId: string;
  patientName: string;
  generatedAt: string;
  dataAsOf: string;
  careState: PatientDischargeCareState;
  careStateLabel: string;
  careStateSummary: string;
  dischargedAt?: string;
  dischargedByName?: string;
  transitionSummary: string;
  recentTrendSummary: string;
  weeklyHeadline?: string;
  weeklyHighlights: string[];
  planStatus: string;
  nextSteps: string[];
  contactInstructions: string;
  urgentHelpInstructions: string;
  monitoringCaveat: string;
  confidentialityNotice: string;
  historicalDetailNote: string;
};

export type DischargeExportBuildResult =
  | { ok: false; error: "NOT_FOUND" }
  | {
      ok: false;
      error: "INVALID_CARE_STATE";
      status: PatientStatusValue;
    }
  | {
      ok: true;
      document: DischargeExportDocument;
    };

function toCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(now.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate()
  ).padStart(2, "0")}`;
}

function getCareStateLabel(careState: PatientDischargeCareState): string {
  if (careState === "independent_mode") {
    return "Independent recovery mode";
  }

  if (careState === "inactive") {
    return "Inactive archive";
  }

  return "Discharged";
}

function getCareStateSummary(careState: PatientDischargeCareState): string {
  if (careState === "independent_mode") {
    return "The care program has ended. The patient may continue self-tracking in Aura, but routine clinician monitoring is not active.";
  }

  if (careState === "inactive") {
    return "This account is inactive. Historical information remains available in Aura, but active tracking and messaging are turned off.";
  }

  return "The care program has ended. Historical information remains available in Aura, but routine check-ins and messaging are not active.";
}

function getContactInstructions(
  careState: PatientDischargeCareState,
  value: string | undefined
): string {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (careState === "independent_mode") {
    return "Contact your clinic directly if your recovery changes or you need new care.";
  }

  return "Contact your clinic directly if you need further support.";
}

function getMonitoringCaveat(careState: PatientDischargeCareState): string {
  if (careState === "independent_mode") {
    return "Independent tracking does not mean your care team is monitoring new entries in real time.";
  }

  if (careState === "inactive") {
    return "This account is inactive. Active tracking and routine clinician monitoring are not active.";
  }

  return "Routine clinician monitoring is no longer active in this care state.";
}

function normalizeList(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = Array.isArray(values)
    ? values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    : [];

  return normalized.length > 0 ? normalized : fallback;
}

export async function buildDischargeExportDocument(
  patientIdInput: string
): Promise<DischargeExportBuildResult> {
  const patientId = patientIdInput.trim();
  if (!patientId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const patient = await Patient.findOne({ patientId })
    .select({ patientId: 1, displayName: 1, status: 1, discharge: 1 })
    .lean();

  if (!patient) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const careStatus = mapPatientCareStatus(patient as Record<string, unknown>, patientId);
  const careState = getPatientDischargeCareState(careStatus);
  if (!careState) {
    return {
      ok: false,
      error: "INVALID_CARE_STATE",
      status: careStatus.status,
    };
  }

  const [summary, weeklyReport] = await Promise.all([
    buildDischargeSummary(patientId),
    generateWeeklyReport({
      patientId,
      weekStart: toCurrentWeekStart(),
      tzOffsetMinutes: 0,
    }).catch(() => null),
  ]);

  if (!summary) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const fallbackNextSteps =
    careState === "independent_mode"
      ? [
          "Use Today and Progress to continue self-tracking.",
          "Contact your clinic directly if your recovery changes or you need new care.",
        ]
      : [
          "Review your recent recovery summary and next care instructions.",
          "Contact your clinic directly if you need further support.",
        ];

  const generatedAt = new Date().toISOString();

  return {
    ok: true,
    document: {
      patientId: summary.patientId,
      patientName: summary.patientName,
      generatedAt,
      dataAsOf: generatedAt,
      careState,
      careStateLabel: getCareStateLabel(careState),
      careStateSummary: getCareStateSummary(careState),
      dischargedAt: careStatus.discharge?.dischargedAt ?? summary.dischargedAt,
      dischargedByName: careStatus.discharge?.dischargedBy?.name?.trim() || undefined,
      transitionSummary:
        summary.summary?.trim() || "No discharge transition summary was recorded.",
      recentTrendSummary: summary.recentTrendSummary,
      weeklyHeadline: summary.weeklyHeadline?.trim() || undefined,
      weeklyHighlights: normalizeList(weeklyReport?.summary.highlights, []).slice(0, 3),
      planStatus: summary.planStatus,
      nextSteps: normalizeList(summary.nextSteps, fallbackNextSteps),
      contactInstructions: getContactInstructions(
        careState,
        careStatus.discharge?.contactInstructions
      ),
      urgentHelpInstructions:
        "If you feel unsafe or need urgent help, use your local emergency services or crisis support.",
      monitoringCaveat: getMonitoringCaveat(careState),
      confidentialityNotice:
        "Confidential health information. Share only with the patient or authorized care team members.",
      historicalDetailNote: "Historical detail remains available in Aura.",
    },
  };
}
