import type { TodayPlanResponse } from '@/src/api/patient';
import type { ActiveExerciseSessionRecord } from '@/src/state/activeExerciseSession';
import type { PendingExerciseSession } from '@/src/state/pendingSessions';

export type PlanUiStateKind =
  | 'no_plan_yet'
  | 'assigned'
  | 'in_progress'
  | 'complete';

export type PlanUiState = {
  kind: PlanUiStateKind;
  itemCount: number;
  previewItems: string[];
  restDay: boolean;
  title: string;
  description: string;
  primaryActionLabel: string;
  statusLabel: string;
};

function toIsoDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function matchesPlan(
  response: TodayPlanResponse,
  candidate: {
    date?: string;
    planVersion?: number;
    planTitle?: string;
  } | null,
): boolean {
  if (!candidate?.date || candidate.date !== response.date) {
    return false;
  }

  const plan = response.plan;
  if (!plan) {
    return false;
  }

  if (
    typeof candidate.planVersion === 'number' &&
    Number.isFinite(candidate.planVersion) &&
    candidate.planVersion === plan.version
  ) {
    return true;
  }

  if (candidate.planTitle && candidate.planTitle === plan.title) {
    return true;
  }

  return candidate.planVersion === undefined && !candidate.planTitle;
}

function hasPendingCompletion(
  response: TodayPlanResponse,
  pendingSessions: PendingExerciseSession[],
): boolean {
  return pendingSessions.some((entry) =>
    matchesPlan(response, {
      date: toIsoDate(entry.payload.startedAt) ?? undefined,
      planVersion: entry.payload.planVersion,
      planTitle: entry.payload.planTitle,
    }),
  );
}

export function derivePlanUiState(input: {
  response: TodayPlanResponse | null;
  activeSession: ActiveExerciseSessionRecord | null;
  pendingSessions?: PendingExerciseSession[];
}): PlanUiState {
  const { response, activeSession, pendingSessions = [] } = input;

  if (!response?.plan) {
    return {
      kind: 'no_plan_yet',
      itemCount: 0,
      previewItems: [],
      restDay: false,
      title: 'No plan yet',
      description: 'Your clinician will add exercises here when a plan is ready.',
      primaryActionLabel: 'View sessions',
      statusLabel: 'No plan yet',
    };
  }

  const itemCount = response.plan.items.length;
  const previewItems = response.plan.items.slice(0, 3).map((item) => item.name);
  const restDay = itemCount === 0;
  const matchesActive = matchesPlan(response, activeSession);
  const isComplete =
    hasPendingCompletion(response, pendingSessions) ||
    (matchesActive && activeSession?.status === 'complete');
  const isInProgress = matchesActive && activeSession?.status === 'in_progress';

  if (isComplete) {
    return {
      kind: 'complete',
      itemCount,
      previewItems,
      restDay,
      title: restDay ? 'Plan reviewed for today' : 'Today’s plan is complete',
      description: restDay
        ? 'Nothing is scheduled for today, and your plan remains assigned for the week.'
        : 'A session for today’s plan was completed on this device.',
      primaryActionLabel: 'View sessions',
      statusLabel: 'Complete',
    };
  }

  if (isInProgress) {
    return {
      kind: 'in_progress',
      itemCount,
      previewItems,
      restDay,
      title: restDay ? 'Plan assigned for today' : 'Today’s session is in progress',
      description: restDay
        ? 'Nothing is scheduled for today, but your plan is still assigned and ready to review.'
        : 'You started this plan on this device and can keep going when you’re ready.',
      primaryActionLabel: 'Open session',
      statusLabel: 'In progress',
    };
  }

  return {
    kind: 'assigned',
    itemCount,
    previewItems,
    restDay,
    title: restDay ? 'Plan assigned for today' : 'Today’s plan is ready',
    description: restDay
      ? 'Nothing is scheduled for today. You can still review the full plan and upcoming exercises.'
      : 'Your exercises are ready to review before you begin.',
    primaryActionLabel: restDay ? 'Review plan' : 'Start session',
    statusLabel: restDay ? 'Assigned' : 'Assigned',
  };
}
