import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Tabs } from '../components/ui/Tabs';
import {
  listInsightsQueue,
  reviewInsight,
  usePatients,
} from '../services/clinicianApi';
import { readWorkspaceState, writeWorkspaceState } from '../services/workspaceState';
import type { InsightItem, InsightStatus } from '../types/models';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';
import { createPatientEntryState } from '../utils/patientEntryContext';
import { getPatientDisplayName } from '../utils/patientFilters';

type QueueStateTone = 'active' | 'blocked' | 'clear' | 'quiet';
type QueueView = 'pending' | 'approved' | 'rejected';
type BadgeVariant = 'warning' | 'success' | 'neutral';
const INSIGHTS_WORKSPACE_PAGE = 'insights';

interface QueueState {
  label: string;
  hint: string;
  tone: QueueStateTone;
}

interface QueueViewConfig {
  titleMeta: string;
  contextHint: string;
  intro: string;
  facts: string[];
  emptyTitle: string;
  emptyDescription: string;
  emptyMeta: string;
  errorTitle: string;
}

interface SingleReviewOutcome {
  kind: 'single';
  id: string;
  status: 'approved' | 'rejected';
  title: string;
  patientId: string;
  patientLabel: string;
}

interface BatchReviewOutcome {
  kind: 'batch';
  status: 'approved' | 'rejected';
  successCount: number;
}

type ReviewOutcome = SingleReviewOutcome | BatchReviewOutcome;

interface ReviewErrorState {
  title: string;
  message: string;
}

interface InsightCardOptions {
  selectable?: boolean;
}

function categoryLabel(value: string): string {
  if (value === 'questionnaires') {
    return 'Questionnaires';
  }
  if (value === 'recovery') {
    return 'Recovery';
  }
  if (value === 'adherence') {
    return 'Adherence';
  }
  if (value === 'safety') {
    return 'Safety';
  }
  if (value === 'symptoms') {
    return 'Symptoms';
  }
  return 'Habits';
}

function formatQueueUpdatedAt(...timestamps: number[]): string {
  const timestamp = Math.max(...timestamps.filter((value) => Number.isFinite(value) && value > 0), 0);
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function describeQueueState(
  pendingCount: number,
  reviewedCount: number | null,
  hasPendingError: boolean,
): QueueState {
  if (hasPendingError) {
    return {
      label: 'Blocked',
      hint: 'The pending queue could not load. Review is blocked until the queue refreshes.',
      tone: 'blocked',
    };
  }

  if (pendingCount > 0) {
    return {
      label: 'Active review',
      hint: 'Pending guidance is ready for clinician review and moving through the queue normally.',
      tone: 'active',
    };
  }

  if (reviewedCount === null) {
    return {
      label: 'Queue cleared',
      hint: 'No pending guidance is waiting. Reviewed-state visibility is unavailable right now.',
      tone: 'clear',
    };
  }

  if (reviewedCount > 0) {
    return {
      label: 'Queue cleared',
      hint: 'No pending guidance is waiting. Reviewed items remain visible in this current queue view.',
      tone: 'clear',
    };
  }

  return {
    label: 'Quiet queue',
    hint: 'No pending or reviewed guidance is present in this current queue view right now.',
    tone: 'quiet',
  };
}

function insightPriorityTone(priority: number): 'high' | 'medium' | 'low' {
  if (priority >= 3) {
    return 'high';
  }

  if (priority === 2) {
    return 'medium';
  }

  return 'low';
}

function formatLifecycleTabLabel(label: string, count: number, hasError: boolean): string {
  return `${label} (${hasError ? '--' : count})`;
}

function insightLifecycleLabel(status: InsightStatus): string {
  if (status === 'approved') {
    return 'Approved for workflow';
  }
  if (status === 'rejected') {
    return 'Rejected from workflow';
  }
  return 'Pending review';
}

function insightLifecycleBadgeVariant(status: InsightStatus): BadgeVariant {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'rejected') {
    return 'neutral';
  }
  return 'warning';
}

function insightReasonLabel(status: InsightStatus): string {
  return status === 'pending' ? 'Reason for review' : 'Reason snapshot';
}

function insightOutcomeLabel(status: InsightStatus): string {
  return status === 'pending' ? 'Clinician decision' : 'Workflow outcome';
}

function insightOutcomeText(status: InsightStatus): string {
  if (status === 'approved') {
    return 'This suggestion has already surfaced into clinician workflow in the current review context.';
  }
  if (status === 'rejected') {
    return 'This suggestion has already been kept out of clinician workflow in the current review context.';
  }
  return 'Approve to surface this guidance into workflow. Reject to keep it out of workflow when it does not warrant clinician action.';
}

function describeQueueView(
  view: QueueView,
  {
    pendingCount,
    approvedCount,
    rejectedCount,
    reviewedCount,
    reviewedCountsUnavailable,
  }: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    reviewedCount: number | null;
    reviewedCountsUnavailable: boolean;
  },
): QueueViewConfig {
  const pendingCountLabel = `${pendingCount} awaiting review`;
  const approvedCountLabel = reviewedCountsUnavailable
    ? 'Approved unavailable'
    : `${approvedCount} approved in current view`;
  const rejectedCountLabel = reviewedCountsUnavailable
    ? 'Rejected unavailable'
    : `${rejectedCount} rejected in current view`;

  if (view === 'approved') {
    return {
      titleMeta: 'Already surfaced into workflow',
      contextHint:
        'Approved suggestions have already surfaced into clinician workflow in this current queue view. Open the patient when deeper review context is still needed.',
      intro:
        'Use this view to confirm what has already been approved in the current review context without turning the queue into a history product.',
      facts: [approvedCountLabel, 'Surfaced into workflow', 'Open patient for context'],
      emptyTitle: 'No approved suggestions in this queue view',
      emptyDescription:
        'No suggestions have been approved in the current queue view yet.',
      emptyMeta: 'Approved items surface into workflow in this current queue view only.',
      errorTitle: 'Could not load approved suggestions',
    };
  }

  if (view === 'rejected') {
    return {
      titleMeta: 'Filtered out of workflow',
      contextHint:
        'Rejected suggestions remain out of clinician workflow in this current queue view. Open the patient when the record still needs more context.',
      intro:
        'Use this view to confirm what was already filtered out in the current review context without implying a deeper audit archive.',
      facts: [rejectedCountLabel, 'Filtered out of workflow', 'Open patient for context'],
      emptyTitle: 'No rejected suggestions in this queue view',
      emptyDescription:
        'No suggestions have been rejected in the current queue view yet.',
      emptyMeta: 'Rejected items stay out of workflow in this current queue view only.',
      errorTitle: 'Could not load rejected suggestions',
    };
  }

  if (pendingCount === 0 && reviewedCount !== null && reviewedCount > 0) {
    return {
      titleMeta: 'Pending review is clear',
      contextHint:
        'No pending suggestions are waiting. Use the approved and rejected views to see what has already been handled in this current queue view.',
      intro:
        'The pending queue is clear. Reviewed tabs remain available so clinicians can confirm what surfaced into workflow versus what was filtered out.',
      facts: [pendingCountLabel, approvedCountLabel, rejectedCountLabel, 'Open patient for context'],
      emptyTitle: 'Queue is clear',
      emptyDescription:
        'No pending suggestions are waiting now. Approved and rejected views below reflect what was already handled in this current queue view only.',
      emptyMeta: 'Monitoring remains active while reviewed outcomes stay visible.',
      errorTitle: 'Could not load pending suggestions',
    };
  }

  if (pendingCount === 0) {
    return {
      titleMeta: 'No pending clinician decision',
      contextHint:
        'No pending suggestions are waiting right now. Monitoring remains active and new items will appear here when they are generated.',
      intro:
        'The pending queue is quiet. New suggestions will appear here when clinician review is needed.',
      facts: [pendingCountLabel, approvedCountLabel, rejectedCountLabel, 'Monitoring remains active'],
      emptyTitle: 'No guidance suggestions are waiting',
      emptyDescription:
        'Monitoring remains active and new guidance suggestions will appear here when they are generated.',
      emptyMeta: 'No pending or reviewed items are in this current queue view right now.',
      errorTitle: 'Could not load pending suggestions',
    };
  }

  return {
    titleMeta: 'Pending clinician decision',
    contextHint:
      'Start with what is awaiting review, confirm why it was suggested, then decide whether it belongs in clinician workflow or should stay out.',
    intro:
      'Review each pending suggestion in context before it enters clinician workflow. Approved and rejected tabs show what has already been handled in this current queue view.',
    facts: [pendingCountLabel, 'Approve surfaces into workflow', 'Reject keeps low-signal guidance out', 'Open patient for context'],
    emptyTitle: 'No pending suggestions are waiting',
    emptyDescription:
      'No pending suggestions are waiting right now.',
    emptyMeta: 'Monitoring remains active.',
    errorTitle: 'Could not load pending suggestions',
  };
}

function describePendingReviewRemaining(
  pendingCount: number,
  reviewedCount: number | null,
): {
  workspaceText: string;
  outcomeText: string;
} {
  if (pendingCount > 0) {
    const countLabel = `${pendingCount} pending suggestion${pendingCount === 1 ? '' : 's'}`;
    const verb = pendingCount === 1 ? 'remains' : 'remain';
    return {
      workspaceText: `${countLabel} ${verb} below for clinician review.`,
      outcomeText: `${countLabel} ${verb} below. Continue with the next clinician decision.`,
    };
  }

  if (reviewedCount === null) {
    return {
      workspaceText: 'Pending review is clear in this current queue view.',
      outcomeText: 'Pending review is clear in this current queue view.',
    };
  }

  if (reviewedCount > 0) {
    return {
      workspaceText: 'Pending review is clear. Reviewed suggestions remain visible in this current queue view.',
      outcomeText: 'Pending review is clear. Reviewed suggestions remain visible in this current queue view.',
    };
  }

  return {
    workspaceText: 'Pending review is quiet right now.',
    outcomeText: 'Pending review is quiet right now.',
  };
}

function normalizeInsightsWorkspaceState(value: unknown): { activeView: QueueView } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { activeView: 'pending' };
  }

  const candidate = value as { activeView?: string };
  return {
    activeView:
      candidate.activeView === 'approved' || candidate.activeView === 'rejected'
        ? candidate.activeView
        : 'pending',
  };
}

function areIdSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function formatSelectedInsightCount(count: number): string {
  return `${count} low-priority suggestion${count === 1 ? '' : 's'} selected`;
}

function patientInitials(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'PT';
  }

  const parts = normalized.split(/\s+/).slice(0, 2);
  const initials = parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || normalized.slice(0, 2).toUpperCase();
}

export function InsightsQueuePage(): JSX.Element {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<QueueView>(() =>
    readWorkspaceState(
      INSIGHTS_WORKSPACE_PAGE,
      { activeView: 'pending' as QueueView },
      normalizeInsightsWorkspaceState,
    ).activeView,
  );
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [batchActionStatus, setBatchActionStatus] = useState<'approved' | 'rejected' | null>(null);
  const [reviewError, setReviewError] = useState<ReviewErrorState | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcome | null>(null);
  const [selectedLowPriorityIds, setSelectedLowPriorityIds] = useState<Set<string>>(
    () => new Set(),
  );

  const patientsQuery = usePatients();

  const queueQuery = useQuery({
    queryKey: ['insights-queue', 'pending'],
    queryFn: () => listInsightsQueue('pending', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const approvedInsightsQuery = useQuery({
    queryKey: ['insights-queue', 'approved'],
    queryFn: () => listInsightsQueue('approved', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const rejectedInsightsQuery = useQuery({
    queryKey: ['insights-queue', 'rejected'],
    queryFn: () => listInsightsQueue('rejected', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientNameById = useMemo(() => {
    return new Map(
      (patientsQuery.data ?? []).map((patient) => [patient.id, getPatientDisplayName(patient)]),
    );
  }, [patientsQuery.data]);

  const pendingItems = queueQuery.data ?? [];
  const priorityReviewItems = pendingItems.filter((item) => item.priority > 1);
  const lowPriorityPendingItems = pendingItems.filter((item) => item.priority <= 1);
  const approvedItems = approvedInsightsQuery.data ?? [];
  const rejectedItems = rejectedInsightsQuery.data ?? [];
  const approvedCount = approvedItems.length;
  const rejectedCount = rejectedItems.length;
  const reviewedCountsUnavailable = Boolean(approvedInsightsQuery.error || rejectedInsightsQuery.error);
  const reviewedCount = reviewedCountsUnavailable ? null : approvedCount + rejectedCount;
  const pendingCount = pendingItems.length;
  const queueState = describeQueueState(pendingCount, reviewedCount, Boolean(queueQuery.error));
  const updatedAtLabel = formatQueueUpdatedAt(
    queueQuery.dataUpdatedAt,
    approvedInsightsQuery.dataUpdatedAt,
    rejectedInsightsQuery.dataUpdatedAt,
    patientsQuery.dataUpdatedAt,
  );
  const isRefreshingQueue =
    queueQuery.isFetching ||
    approvedInsightsQuery.isFetching ||
    rejectedInsightsQuery.isFetching ||
    patientsQuery.isFetching;
  const isReviewSubmitting = isSubmittingId !== null || batchActionStatus !== null;
  const pendingCountLabel = `${pendingCount} awaiting review`;
  const priorityReviewShare = pendingCount > 0 ? Math.round((priorityReviewItems.length / pendingCount) * 100) : 0;
  const reviewMixTotal = pendingCount + approvedCount + rejectedCount;
  const reviewMixSegments = [
    {
      key: 'pending',
      label: 'Pending',
      count: pendingCount,
      width: reviewMixTotal > 0 ? `${(pendingCount / reviewMixTotal) * 100}%` : '0%',
    },
    {
      key: 'approved',
      label: 'Approved',
      count: approvedCount,
      width: reviewMixTotal > 0 ? `${(approvedCount / reviewMixTotal) * 100}%` : '0%',
    },
    {
      key: 'rejected',
      label: 'Rejected',
      count: rejectedCount,
      width: reviewMixTotal > 0 ? `${(rejectedCount / reviewMixTotal) * 100}%` : '0%',
    },
  ];
  const statusStripTitle =
    pendingCount > 0 ? 'Pending clinician review' : queueState.label;
  const statusStripNarrative =
    pendingCount > 0
      ? priorityReviewItems.length > 0
        ? `${priorityReviewItems.length} suggestion${
            priorityReviewItems.length === 1 ? '' : 's'
          } need individual review before any routine batching.`
        : 'Pending review is currently low-signal and ready for routine handling.'
      : queueState.hint;
  const reviewedSummaryHint =
    reviewedCount === null
      ? 'Approved and rejected counts are unavailable right now.'
      : `Approved ${approvedCount} · Rejected ${rejectedCount} in current queue view.`;
  const tabs = useMemo(
    () => [
      {
        id: 'pending',
        label: formatLifecycleTabLabel('Pending', pendingCount, Boolean(queueQuery.error)),
      },
      {
        id: 'approved',
        label: formatLifecycleTabLabel(
          'Approved',
          approvedCount,
          Boolean(approvedInsightsQuery.error),
        ),
      },
      {
        id: 'rejected',
        label: formatLifecycleTabLabel(
          'Rejected',
          rejectedCount,
          Boolean(rejectedInsightsQuery.error),
        ),
      },
    ],
    [
      approvedCount,
      approvedInsightsQuery.error,
      pendingCount,
      queueQuery.error,
      rejectedCount,
      rejectedInsightsQuery.error,
    ],
  );

  const activeQuery =
    activeView === 'pending'
      ? queueQuery
      : activeView === 'approved'
        ? approvedInsightsQuery
        : rejectedInsightsQuery;
  const activeItems =
    activeView === 'pending'
      ? pendingItems
      : activeView === 'approved'
        ? approvedItems
        : rejectedItems;
  const viewConfig = describeQueueView(activeView, {
    pendingCount,
    approvedCount,
    rejectedCount,
    reviewedCount,
    reviewedCountsUnavailable,
  });
  const pendingReviewRemaining = describePendingReviewRemaining(pendingCount, reviewedCount);
  const outcomeFollowThrough = pendingReviewRemaining.outcomeText;
  const visibleLowPriorityIdSet = useMemo(
    () =>
      new Set(
        activeView === 'pending' ? lowPriorityPendingItems.map((item) => item.id) : [],
      ),
    [activeView, lowPriorityPendingItems],
  );
  const selectedLowPriorityCount = lowPriorityPendingItems.reduce(
    (count, item) => count + (selectedLowPriorityIds.has(item.id) ? 1 : 0),
    0,
  );
  const allVisibleLowPrioritySelected =
    lowPriorityPendingItems.length > 0 &&
    lowPriorityPendingItems.every((item) => selectedLowPriorityIds.has(item.id));
  const reviewOutcomeView =
    reviewOutcome?.status === 'approved'
      ? ('approved' as const)
      : reviewOutcome?.status === 'rejected'
        ? ('rejected' as const)
        : null;
  const outcomeDestinationLabel =
    reviewOutcome?.status === 'approved'
      ? 'Approved'
      : reviewOutcome?.status === 'rejected'
        ? 'Rejected'
        : '';
  const outcomePanelTitle =
    reviewOutcome?.kind === 'batch'
      ? reviewOutcome.status === 'approved'
        ? 'Batch approved into workflow'
        : 'Batch rejected from workflow'
      : reviewOutcome?.status === 'approved'
        ? 'Approved into workflow'
        : 'Rejected from workflow';
  const normalizedOutcomePatientId =
    reviewOutcome?.kind === 'single' ? reviewOutcome.patientId.trim() : '';
  const canOpenOutcomePatient =
    reviewOutcome?.kind === 'single' && normalizedOutcomePatientId.length > 0;
  const queueContextHint =
    activeView === 'pending' && pendingCount > 0
      ? `${pendingReviewRemaining.workspaceText} Start with priority review, then batch only the low-priority suggestions that do not need individual handling.`
      : activeView === 'pending'
        ? pendingReviewRemaining.workspaceText
        : viewConfig.contextHint;

  useEffect(() => {
    setSelectedLowPriorityIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const next =
        activeView !== 'pending'
          ? new Set<string>()
          : new Set([...previous].filter((id) => visibleLowPriorityIdSet.has(id)));

      return areIdSetsEqual(previous, next) ? previous : next;
    });
  }, [activeView, visibleLowPriorityIdSet]);

  function setQueueView(nextView: QueueView): void {
    setActiveView(nextView);
    if (nextView !== 'pending') {
      setSelectedLowPriorityIds(new Set());
    }
    writeWorkspaceState(INSIGHTS_WORKSPACE_PAGE, { activeView: nextView });
  }

  async function handleRefreshQueue() {
    const [pendingResult, approvedResult, rejectedResult, patientsResult] = await Promise.all([
      queueQuery.refetch(),
      approvedInsightsQuery.refetch(),
      rejectedInsightsQuery.refetch(),
      patientsQuery.refetch(),
    ]);

    return {
      pendingResult,
      approvedResult,
      rejectedResult,
      patientsResult,
    };
  }

  async function handleReview(insightId: string, status: 'approved' | 'rejected'): Promise<void> {
    setReviewError(null);
    setReviewOutcome(null);
    setIsSubmittingId(`${insightId}:${status}`);

    const pendingItem = pendingItems.find((item) => item.id === insightId) ?? null;
    try {
      const reviewedItem = await reviewInsight(insightId, status);
      const refreshResult = await handleRefreshQueue();
      const destinationResult =
        status === 'approved' ? refreshResult.approvedResult : refreshResult.rejectedResult;
      const destinationItems = destinationResult.data ?? [];
      const refreshedPendingItems = refreshResult.pendingResult.data ?? [];
      const movedIntoDestination = destinationItems.some((item) => item.id === reviewedItem.id);
      const stillInPending = refreshedPendingItems.some((item) => item.id === reviewedItem.id);

      if (
        !refreshResult.pendingResult.error &&
        !destinationResult.error &&
        movedIntoDestination &&
        !stillInPending
      ) {
        const patientId = reviewedItem.patientId.trim();
        const patientLabel =
          reviewedItem.patientDisplayName?.trim() ||
          patientNameById.get(patientId) ||
          pendingItem?.patientDisplayName?.trim() ||
          patientId;

        setReviewOutcome({
          kind: 'single',
          id: reviewedItem.id,
          status,
          title: reviewedItem.title,
          patientId,
          patientLabel,
        });
      }
    } catch (error) {
      setReviewOutcome(null);
      setReviewError({
        title: 'Could not update insight',
        message: toUserMessage(asAppError(error)),
      });
    } finally {
      setIsSubmittingId(null);
    }
  }

  async function handleBatchReview(status: 'approved' | 'rejected'): Promise<void> {
    const selectedItems = lowPriorityPendingItems.filter((item) => selectedLowPriorityIds.has(item.id));
    if (selectedItems.length === 0) {
      return;
    }

    setReviewError(null);
    setReviewOutcome(null);
    setBatchActionStatus(status);

    const failedIds: string[] = [];
    let successCount = 0;

    try {
      for (const item of selectedItems) {
        try {
          await reviewInsight(item.id, status);
          successCount += 1;
        } catch {
          failedIds.push(item.id);
        }
      }

      await handleRefreshQueue();

      if (successCount > 0) {
        setReviewOutcome({
          kind: 'batch',
          status,
          successCount,
        });
      }

      setSelectedLowPriorityIds(new Set(failedIds));

      if (failedIds.length > 0) {
        const failureLabel = `${failedIds.length} low-priority suggestion${
          failedIds.length === 1 ? '' : 's'
        } could not be updated.`;
        setReviewError({
          title:
            failedIds.length === 1
              ? 'Could not update low-priority suggestion'
              : 'Could not update low-priority suggestions',
          message:
            successCount > 0
              ? `${failureLabel} Any successful reviews are reflected below.`
              : `${failureLabel} Pending review remains unchanged for the unresolved items below.`,
        });
      }
    } finally {
      setBatchActionStatus(null);
    }
  }

  function toggleLowPrioritySelection(insightId: string, checked: boolean): void {
    setSelectedLowPriorityIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(insightId);
      } else {
        next.delete(insightId);
      }
      return next;
    });
  }

  function selectAllVisibleLowPriority(): void {
    setSelectedLowPriorityIds(new Set(lowPriorityPendingItems.map((item) => item.id)));
  }

  function clearLowPrioritySelection(): void {
    setSelectedLowPriorityIds(new Set());
  }

  function buildInsightPatientEntryState(item: InsightItem) {
    const normalizedPatientId = item.patientId.trim();

    return createPatientEntryState({
      patientId: normalizedPatientId,
      source: 'insights',
      subtype: item.status,
      hint: item.title.trim() || `${categoryLabel(item.category)} guidance`,
      focus: 'insights',
      returnTo: '/insights',
    });
  }

  function openPatientFromOutcome(): void {
    if (!reviewOutcome || reviewOutcome.kind !== 'single') {
      return;
    }

    const patientId = reviewOutcome.patientId.trim();

    if (!patientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(patientId)}`, {
      state: createPatientEntryState({
        patientId,
        source: 'insights',
        subtype: reviewOutcome.status,
        hint: reviewOutcome.title.trim() || 'Guidance review',
        focus: 'insights',
        returnTo: '/insights',
      }),
    });
  }

  function renderInsightCard(item: InsightItem, options?: InsightCardOptions): JSX.Element {
    const patientLabel =
      item.patientDisplayName?.trim() ||
      patientNameById.get(item.patientId) ||
      item.patientId;
    const patientMonogram = patientInitials(patientLabel);
    const priorityTone = insightPriorityTone(item.priority);
    const isPending = item.status === 'pending';
    const isSelectable = options?.selectable === true && isPending && priorityTone === 'low';
    const isSelected = isSelectable && selectedLowPriorityIds.has(item.id);
    const isJustReviewed =
      !isPending &&
      activeView === item.status &&
      reviewOutcome?.kind === 'single' &&
      reviewOutcome.status === item.status &&
      reviewOutcome.id === item.id;

    return (
      <div
        key={item.id}
        className={`insights-queue__item insights-queue__item--${priorityTone} insights-queue__item--state-${item.status}${
          isJustReviewed ? ' insights-queue__item--just-reviewed' : ''
        }${isSelected ? ' insights-queue__item--selected' : ''}${
          isSelectable ? ' insights-queue__item--selectable' : ''
        }`}
      >
        <div className="insights-queue__item-head">
          <div
            className={`insights-queue__item-main-shell${
              isSelectable ? ' insights-queue__item-main-shell--selectable' : ''
            }`}
          >
            {isSelectable ? (
              <label className="insights-queue__select-control" htmlFor={`insight-select-${item.id}`}>
                <input
                  id={`insight-select-${item.id}`}
                  type="checkbox"
                  checked={isSelected}
                  disabled={isReviewSubmitting}
                  aria-label={`Select ${item.title}`}
                  onChange={(event) => {
                    toggleLowPrioritySelection(item.id, event.target.checked);
                  }}
                />
              </label>
            ) : null}
            <div className="insights-queue__item-main">
              <div className="insights-queue__eyebrow-row">
                <p className="insights-queue__eyebrow">
                  {isPending ? 'Pending guidance' : 'Handled guidance'}
                </p>
                <span className="insights-queue__freshness">
                  {item.reviewedAt ? 'Reviewed' : 'Created'} {formatDateTime(item.reviewedAt ?? item.createdAt)}
                </span>
              </div>
              <h3 className="insights-queue__title">{item.title}</h3>
              <div className="insights-queue__patient-row">
                <div className="insights-queue__patient-anchor">
                  <span className="insights-queue__patient-avatar" aria-hidden="true">
                    {patientMonogram}
                  </span>
                  <div className="insights-queue__patient-copy">
                    <p className="insights-queue__patient">
                      <span className="insights-queue__patient-label">Patient</span>
                      <Link
                        to={`/patients/${encodeURIComponent(item.patientId)}`}
                        state={buildInsightPatientEntryState(item)}
                      >
                        {patientLabel}
                      </Link>
                    </p>
                    <p className="insights-queue__patient-id">Patient ID {item.patientId}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="insights-queue__state">
            <Badge
              className={`insights-queue__state-badge insights-queue__state-badge--${item.status}`}
              variant={insightLifecycleBadgeVariant(item.status)}
            >
              {insightLifecycleLabel(item.status)}
            </Badge>
            <span className={`insights-queue__state-chip insights-queue__state-chip--${priorityTone}`}>
              Priority {item.priority}
            </span>
            {isJustReviewed ? (
              <span
                className="insights-queue__just-reviewed"
                data-testid={`insight-just-reviewed-${item.id}`}
              >
                Just reviewed
              </span>
            ) : null}
          </div>
        </div>

        <div className="insights-queue__context-row" aria-label="Insight context">
          <Badge className="insights-queue__badge insights-queue__badge--category" variant="neutral">
            {categoryLabel(item.category)}
          </Badge>
          <span className="insights-queue__context-chip insights-queue__context-chip--confidence">
            Confidence {item.confidence}
          </span>
          <span className="insights-queue__context-chip">Window {item.windowDays} days</span>
          <span className="insights-queue__context-chip">Created {formatDateTime(item.createdAt)}</span>
          {item.reviewedAt ? (
            <span className="insights-queue__context-chip">
              Reviewed {formatDateTime(item.reviewedAt)}
            </span>
          ) : null}
        </div>

        <div className="insights-queue__reason">
          <div className="insights-queue__reason-header">
            <p className="insights-queue__reason-label">{insightReasonLabel(item.status)}</p>
            {priorityTone !== 'low' ? (
              <span className={`insights-queue__reason-callout insights-queue__reason-callout--${priorityTone}`}>
                {priorityTone === 'high' ? 'Priority lane' : 'Focused review'}
              </span>
            ) : null}
          </div>
          <p className="insights-queue__message">{item.message}</p>
        </div>

        <div className="insights-queue__footer">
          <div className="insights-queue__decision">
            <p className="insights-queue__decision-label">{insightOutcomeLabel(item.status)}</p>
            <p className="insights-queue__decision-text">{insightOutcomeText(item.status)}</p>
          </div>
          <div
            className={`insights-queue__actions${
              isPending ? ' insights-queue__actions--pending' : ' insights-queue__actions--reviewed'
            }`}
          >
            {isPending ? (
              <>
                <Button
                  className="insights-queue__action insights-queue__action--approve"
                  variant="primary"
                  size="sm"
                  disabled={isReviewSubmitting}
                  onClick={() => {
                    void handleReview(item.id, 'approved');
                  }}
                >
                  {isSubmittingId === `${item.id}:approved` ? 'Approving…' : 'Approve for workflow'}
                </Button>
                <Button
                  className="insights-queue__action insights-queue__action--open"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate(`/patients/${encodeURIComponent(item.patientId)}`, {
                      state: buildInsightPatientEntryState(item),
                    })
                  }
                >
                  Open patient
                </Button>
                <Button
                  className="insights-queue__action insights-queue__action--reject"
                  variant="ghost"
                  size="sm"
                  disabled={isReviewSubmitting}
                  onClick={() => {
                    void handleReview(item.id, 'rejected');
                  }}
                >
                  {isSubmittingId === `${item.id}:rejected` ? 'Rejecting…' : 'Reject suggestion'}
                </Button>
              </>
            ) : (
              <Button
                className="insights-queue__action insights-queue__action--open"
                variant="secondary"
                size="sm"
                onClick={() =>
                  navigate(`/patients/${encodeURIComponent(item.patientId)}`, {
                    state: buildInsightPatientEntryState(item),
                  })
                }
              >
                Open patient
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack dashboard-page-shell dashboard-page-shell--insights insights-page">
      <Section
        className="dashboard-page-header dashboard-page-header--insights insights-page-header"
        eyebrow="Clinical review"
        title="Insights"
        subtitle="Review pending guidance, move the right suggestions into clinician workflow, and confirm what has already been handled in this current queue view."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={isRefreshingQueue}
            onClick={() => {
              void handleRefreshQueue();
            }}
          >
            {isRefreshingQueue ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      <div className="insights-overview-stack">
        <section className="insights-summary-strip" aria-label="Insights queue summary">
          <article className={`insights-summary-strip__lead insights-summary-strip__lead--${queueState.tone}`}>
            <div className="insights-summary-strip__lead-copy">
              <p className="insights-summary-strip__eyebrow">Guidance review status</p>
              <div className="insights-summary-strip__headline">
                <p className="insights-summary-strip__lead-value">{pendingCount}</p>
                <div className="insights-summary-strip__headline-copy">
                  <p className="insights-summary-strip__headline-title">{statusStripTitle}</p>
                  <p className="insights-summary-strip__hint">{statusStripNarrative}</p>
                </div>
              </div>
            </div>
            <div className="insights-summary-strip__mix" aria-label="Review mix">
              <div className="insights-summary-strip__mix-bar" aria-hidden="true">
                {reviewMixSegments.map((segment) => (
                  <span
                    key={segment.key}
                    className={`insights-summary-strip__mix-segment insights-summary-strip__mix-segment--${segment.key}`}
                    style={{ width: segment.width }}
                  />
                ))}
              </div>
              <div className="insights-summary-strip__mix-legend">
                {reviewMixSegments.map((segment) => (
                  <span key={segment.key} className="insights-summary-strip__mix-item">
                    <span
                      className={`insights-summary-strip__mix-dot insights-summary-strip__mix-dot--${segment.key}`}
                      aria-hidden="true"
                    />
                    {segment.label} {segment.count}
                  </span>
                ))}
              </div>
            </div>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--pending">
            <p className="insights-summary-strip__label">Awaiting review</p>
            <p className="insights-summary-strip__value">{pendingCount}</p>
            <p className="insights-summary-strip__hint">
              Pending guidance still needing clinician review.
            </p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--status">
            <p className="insights-summary-strip__label">Active review</p>
            <p
              className={`insights-summary-strip__value insights-summary-strip__value--${queueState.tone}`}
            >
              {queueState.label}
            </p>
            <p className="insights-summary-strip__hint">{queueState.hint}</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--priority">
            <p className="insights-summary-strip__label">Priority review share</p>
            <p className="insights-summary-strip__value">
              {pendingCount > 0 ? `${priorityReviewShare}%` : '--'}
            </p>
            <p className="insights-summary-strip__hint">
              {pendingCount > 0
                ? `${priorityReviewItems.length} suggestion${
                    priorityReviewItems.length === 1 ? '' : 's'
                  } need individual review first.`
                : 'No pending suggestions are waiting right now.'}
            </p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--reviewed">
            <p className="insights-summary-strip__label">Reviewed in current queue view</p>
            <p className="insights-summary-strip__value">{reviewedCount ?? '--'}</p>
            <p className="insights-summary-strip__hint">{reviewedSummaryHint}</p>
          </article>
          <article className="insights-summary-strip__item insights-summary-strip__item--updated">
            <p className="insights-summary-strip__label">Last refresh</p>
            <p className="insights-summary-strip__value">{updatedAtLabel}</p>
            <p className="insights-summary-strip__hint">Queue freshness for this review surface.</p>
          </article>
        </section>
      </div>

      <Card
        className="insights-workspace-card"
        title={
          <span className="insights-workspace-card__title insights-workspace-card__title-shell">
            <span className="insights-workspace-card__title-copy">
              <span className="insights-workspace-card__title-eyebrow">Guidance review queue</span>
              <span className="insights-workspace-card__title-text">Clinician review console</span>
            </span>
            <span className="insights-workspace-card__title-side">
              <span className="insights-workspace-card__title-count">
                {activeQuery.error ? '--' : activeItems.length}
              </span>
              <span className="insights-workspace-card__title-meta">{viewConfig.titleMeta}</span>
            </span>
          </span>
        }
      >
        <div className="insights-review-console">
          <div className="insights-review-console__controls">
            <div className="insights-lifecycle-tabs">
              <Tabs
                tabs={tabs}
                value={activeView}
                onValueChange={(id) => {
                  const nextView =
                    id === 'approved' || id === 'rejected' ? (id as QueueView) : 'pending';
                  setQueueView(nextView);
                }}
                getTabTestId={(id) => `insights-tab-${id}`}
              />
            </div>

            <div
              className={`insights-queue-context insights-queue-context--${activeView}${
                activeView === 'pending' && priorityReviewItems.length > 0
                  ? ' insights-queue-context--priority'
                  : ''
              }`}
            >
              <div className="insights-queue-context__copy">
                <p className="insights-queue-context__eyebrow">Decision path</p>
                <h3 className="insights-queue-context__title">{viewConfig.titleMeta}</h3>
                <p className="insights-queue-context__text">{queueContextHint}</p>
              </div>
              <div className="insights-queue-context__facts" aria-live="polite">
                {viewConfig.facts.map((fact) => (
                  <span key={fact} className="insights-queue-context__fact">
                    {fact}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {reviewError ? (
            <AlertBanner variant="error" title={reviewError.title}>
              {reviewError.message}
            </AlertBanner>
          ) : null}

          {reviewOutcome ? (
            <div
              className={`insights-review-outcome insights-review-outcome--${reviewOutcome.status}`}
              data-testid="insights-review-outcome"
              role="status"
              aria-live="polite"
            >
              <div className="insights-review-outcome__copy">
                <p className="insights-review-outcome__eyebrow">Latest review</p>
                <div className="insights-review-outcome__title-row">
                  <strong className="insights-review-outcome__title">{outcomePanelTitle}</strong>
                  {reviewOutcome.kind === 'single' ? (
                    <span className="insights-review-outcome__patient">{reviewOutcome.patientLabel}</span>
                  ) : null}
                </div>
                {reviewOutcome.kind === 'single' ? (
                  <p className="insights-review-outcome__text">
                    <span className="insights-review-outcome__item">{reviewOutcome.title}</span>{' '}
                    moved out of Pending and is now visible in {outcomeDestinationLabel} in this current
                    queue view.
                  </p>
                ) : (
                  <p className="insights-review-outcome__text">
                    {reviewOutcome.successCount} low-priority suggestion
                    {reviewOutcome.successCount === 1 ? '' : 's'}{' '}
                    {reviewOutcome.status === 'approved'
                      ? 'approved into workflow.'
                      : 'rejected from workflow.'}
                  </p>
                )}
                <p className="insights-review-outcome__next">{outcomeFollowThrough}</p>
              </div>
              <div className="insights-review-outcome__actions">
                <Button
                  className="insights-review-outcome__action insights-review-outcome__action--view"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (reviewOutcomeView) {
                      setQueueView(reviewOutcomeView);
                    }
                  }}
                >
                  {reviewOutcome.status === 'approved' ? 'View approved' : 'View rejected'}
                </Button>
                {canOpenOutcomePatient ? (
                  <Button
                    className="insights-review-outcome__action insights-review-outcome__action--open"
                    variant="secondary"
                    size="sm"
                    onClick={openPatientFromOutcome}
                  >
                    Open patient
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="insights-review-console__content">
            {activeQuery.error && activeItems.length === 0 ? (
              <div className="insights-page__error">
                <AlertBanner variant="error" title={viewConfig.errorTitle}>
                  {toUserMessage(activeQuery.error)}
                </AlertBanner>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void handleRefreshQueue();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : activeQuery.isLoading && activeItems.length === 0 ? (
              <div className="patient-detail-skeleton-grid" aria-label="Insights queue loading placeholder">
                <Skeleton height={52} />
                <Skeleton height={100} />
                <Skeleton height={100} />
              </div>
            ) : activeItems.length === 0 ? (
              <div className="insights-empty-state" role="status" aria-live="polite">
                <div className="insights-empty-state__title-row">
                  <span className="insights-empty-state__icon" aria-hidden="true">
                    ✓
                  </span>
                  <h3 className="insights-empty-state__title">{viewConfig.emptyTitle}</h3>
                </div>
                <p className="insights-empty-state__description">{viewConfig.emptyDescription}</p>
                <div className="insights-empty-state__footer">
                  <div className="insights-empty-state__meta-group">
                    <p className="insights-empty-state__meta">Last updated {updatedAtLabel}</p>
                    <p className="insights-empty-state__meta insights-empty-state__meta--quiet">
                      {viewConfig.emptyMeta}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isRefreshingQueue}
                    onClick={() => {
                      void handleRefreshQueue();
                    }}
                  >
                    Refresh queue
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {activeView === 'pending' ? (
                  <div className="insights-queue-sections">
                    <section className="insights-queue-section insights-queue-section--priority">
                      <div className="insights-queue-section__header">
                        <div className="insights-queue-section__copy">
                          <p className="insights-queue-section__eyebrow">Primary workflow</p>
                          <h3 className="insights-queue-section__title">Priority review</h3>
                          <p className="insights-queue-section__text">
                            Handle medium- and high-priority suggestions one at a time.
                          </p>
                        </div>
                        <span className="insights-queue-section__fact" aria-live="polite">
                          {priorityReviewItems.length} requiring individual review
                        </span>
                      </div>
                      {priorityReviewItems.length > 0 ? (
                        <div className="stack stack--2 insights-queue-list">
                          {priorityReviewItems.map((item) => renderInsightCard(item))}
                        </div>
                      ) : (
                        <p className="insights-queue-section__empty">
                          No medium- or high-priority suggestions are waiting now.
                        </p>
                      )}
                  </section>

                  {lowPriorityPendingItems.length > 0 ? (
                    <section className="insights-queue-section insights-queue-section--low">
                      <div className="insights-queue-section__header">
                        <div className="insights-queue-section__copy">
                          <p className="insights-queue-section__eyebrow">Routine review</p>
                          <h3 className="insights-queue-section__title">Low-priority review</h3>
                          <p className="insights-queue-section__text">
                            Batch only the visible low-priority suggestions that do not need deeper
                            individual handling.
                          </p>
                        </div>
                        <div className="insights-queue-section__controls">
                          <span className="insights-queue-section__fact" aria-live="polite">
                            {lowPriorityPendingItems.length} batchable now
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isReviewSubmitting || allVisibleLowPrioritySelected}
                            onClick={() => {
                              selectAllVisibleLowPriority();
                            }}
                          >
                            Select all visible low-priority
                          </Button>
                        </div>
                      </div>

                      {selectedLowPriorityCount > 0 ? (
                        <div
                          className="insights-batch-action-bar"
                          data-testid="insights-batch-action-bar"
                          role="status"
                          aria-live="polite"
                        >
                          <div className="insights-batch-action-bar__copy">
                            <p className="insights-batch-action-bar__eyebrow">Batch review</p>
                            <p className="insights-batch-action-bar__text">
                              {formatSelectedInsightCount(selectedLowPriorityCount)}
                            </p>
                          </div>
                          <div className="insights-batch-action-bar__actions">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isReviewSubmitting}
                              onClick={() => {
                                void handleBatchReview('approved');
                              }}
                            >
                              {batchActionStatus === 'approved'
                                ? 'Approving…'
                                : 'Approve selected'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isReviewSubmitting}
                              onClick={() => {
                                void handleBatchReview('rejected');
                              }}
                            >
                              {batchActionStatus === 'rejected'
                                ? 'Rejecting…'
                                : 'Reject selected'}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isReviewSubmitting}
                              onClick={() => {
                                clearLowPrioritySelection();
                              }}
                            >
                              Clear selection
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="stack stack--2 insights-queue-list insights-queue-list--low">
                        {lowPriorityPendingItems.map((item) =>
                          renderInsightCard(item, { selectable: true }),
                        )}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="stack stack--2 insights-queue-list">
                  {activeItems.map((item) => renderInsightCard(item))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </Card>
    </div>
  );
}
