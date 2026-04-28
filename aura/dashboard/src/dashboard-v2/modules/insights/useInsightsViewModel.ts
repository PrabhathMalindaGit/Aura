import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  buildInsightQueueRow,
  buildInsightReviewHeader,
  buildInsightReviewSummary,
  buildInsightsGovernance,
  buildInsightsOutcome,
  buildInsightsStatusBar,
  categoryLabel,
  defaultInsightsWorkspaceState,
  formatInsightsLastUpdated,
  normalizeInsightsWorkspaceState,
  type InsightQueueSectionVm,
  type InsightsOutcomeVm,
  type InsightsView,
} from '../../adapters/insights';
import { useInsightsUiStore } from '../../state/useInsightsUiStore';
import {
  listInsightsQueue,
  reviewInsight,
  usePatients,
} from '../../../services/clinicianApi';
import { readWorkspaceState, writeWorkspaceState } from '../../../services/workspaceState';
import type { InsightItem, PatientSummary } from '../../../types/models';
import { asAppError, isRetryable, toUserMessage } from '../../../utils/errors';
import { createPatientEntryState } from '../../../utils/patientEntryContext';

const INSIGHTS_WORKSPACE_PAGE = 'insights';

interface ReviewErrorState {
  title: string;
  message: string;
}

interface ReviewOutcomeState extends InsightsOutcomeVm {
  status: 'approved' | 'rejected';
  patientId?: string;
}

export interface UseInsightsViewModelOptions {
  isNarrowLayout: boolean;
}

export function useInsightsViewModel({
  isNarrowLayout,
}: UseInsightsViewModelOptions) {
  const navigate = useNavigate();
  const selectedInsightId = useInsightsUiStore((state) => state.selectedInsightId);
  const focusMode = useInsightsUiStore((state) => state.focusMode);
  const setSelectedInsightId = useInsightsUiStore((state) => state.setSelectedInsightId);
  const setFocusMode = useInsightsUiStore((state) => state.setFocusMode);
  const [activeView, setActiveView] = useState<InsightsView>(() =>
    readWorkspaceState(
      INSIGHTS_WORKSPACE_PAGE,
      defaultInsightsWorkspaceState(),
      normalizeInsightsWorkspaceState,
    ).activeView,
  );
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [batchActionStatus, setBatchActionStatus] = useState<'approved' | 'rejected' | null>(null);
  const [reviewError, setReviewError] = useState<ReviewErrorState | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcomeState | null>(null);
  const [selectedLowPriorityIds, setSelectedLowPriorityIds] = useState<Set<string>>(() => new Set());
  const [hasResolvedInitialEmptyView, setHasResolvedInitialEmptyView] = useState(false);

  const patientsQuery = usePatients();

  const pendingQuery = useQuery({
    queryKey: ['insights-queue', 'pending'],
    queryFn: () => listInsightsQueue('pending', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const approvedQuery = useQuery({
    queryKey: ['insights-queue', 'approved'],
    queryFn: () => listInsightsQueue('approved', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const rejectedQuery = useQuery({
    queryKey: ['insights-queue', 'rejected'],
    queryFn: () => listInsightsQueue('rejected', 50),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientMap = useMemo(() => {
    const next = new Map<string, PatientSummary>();
    for (const patient of patientsQuery.data ?? []) {
      next.set(patient.id, patient);
    }
    return next;
  }, [patientsQuery.data]);

  const pendingItems = pendingQuery.data ?? [];
  const approvedItems = approvedQuery.data ?? [];
  const rejectedItems = rejectedQuery.data ?? [];
  const priorityReviewItems = pendingItems.filter((item) => item.priority > 1);
  const lowPriorityItems = pendingItems.filter((item) => item.priority <= 1);
  const activeItems =
    activeView === 'approved'
      ? approvedItems
      : activeView === 'rejected'
        ? rejectedItems
        : pendingItems;
  const activeQuery =
    activeView === 'approved'
      ? approvedQuery
      : activeView === 'rejected'
        ? rejectedQuery
        : pendingQuery;

  useEffect(() => {
    if (hasResolvedInitialEmptyView || activeView === 'pending') {
      return;
    }
    if (pendingItems.length === 0 || activeItems.length > 0) {
      return;
    }
    if (pendingQuery.isLoading || activeQuery.isLoading) {
      return;
    }

    setActiveView('pending');
    writeWorkspaceState(INSIGHTS_WORKSPACE_PAGE, { activeView: 'pending' });
    setSelectedLowPriorityIds(new Set());
    setHasResolvedInitialEmptyView(true);
  }, [
    activeItems.length,
    activeQuery.isLoading,
    activeView,
    hasResolvedInitialEmptyView,
    pendingItems.length,
    pendingQuery.isLoading,
  ]);

  const updatedAtLabel = formatInsightsLastUpdated(
    Math.max(
      pendingQuery.dataUpdatedAt,
      approvedQuery.dataUpdatedAt,
      rejectedQuery.dataUpdatedAt,
      patientsQuery.dataUpdatedAt,
    ) || null,
  );

  const statusBar = buildInsightsStatusBar({
    activeView,
    pendingCount: pendingItems.length,
    approvedCount: approvedItems.length,
    rejectedCount: rejectedItems.length,
    individualPendingCount: priorityReviewItems.length,
    batchablePendingCount: lowPriorityItems.length,
    updatedAtLabel,
  });

  const activeRows = useMemo(
    () =>
      activeItems.map((item) =>
        buildInsightQueueRow(item, patientMap.get(item.patientId) ?? null),
      ),
    [activeItems, patientMap],
  );

  const queueSections = useMemo<InsightQueueSectionVm[]>(() => {
    if (activeView === 'pending') {
      const sections: InsightQueueSectionVm[] = [];
      if (priorityReviewItems.length > 0) {
        sections.push({
          key: 'priority-review',
          title: 'Priority review',
          description: `${priorityReviewItems.length} suggestion${priorityReviewItems.length === 1 ? '' : 's'} still need individual review.`,
          rows: priorityReviewItems.map((item) =>
            buildInsightQueueRow(item, patientMap.get(item.patientId) ?? null),
          ),
          selectable: false,
        });
      }
      if (lowPriorityItems.length > 0) {
        sections.push({
          key: 'batch-review',
          title: 'Low-priority review',
          description: `${lowPriorityItems.length} routine suggestion${lowPriorityItems.length === 1 ? '' : 's'} can stay list-scoped for batch review.`,
          rows: lowPriorityItems.map((item) =>
            buildInsightQueueRow(item, patientMap.get(item.patientId) ?? null),
          ),
          selectable: true,
        });
      }
      return sections;
    }

    return [
      {
        key: `${activeView}-history`,
        title: activeView === 'approved' ? 'Approved suggestions' : 'Rejected suggestions',
        description:
          activeView === 'approved'
            ? 'Suggestions already surfaced into workflow in this current route view.'
            : 'Suggestions already kept out of workflow in this current route view.',
        rows: activeRows,
        selectable: false,
      },
    ];
  }, [
    activeRows,
    activeView,
    lowPriorityItems,
    patientMap,
    priorityReviewItems,
  ]);

  const visibleLowPriorityIdSet = useMemo(
    () => new Set(lowPriorityItems.map((item) => item.id)),
    [lowPriorityItems],
  );

  useEffect(() => {
    setSelectedLowPriorityIds((previous) => {
      if (activeView !== 'pending') {
        return previous.size === 0 ? previous : new Set<string>();
      }

      const next = new Set([...previous].filter((id) => visibleLowPriorityIdSet.has(id)));
      const unchanged = previous.size === next.size && [...previous].every((id) => next.has(id));
      return unchanged ? previous : next;
    });
  }, [activeView, visibleLowPriorityIdSet]);

  useEffect(() => {
    const activeIds = new Set(activeItems.map((item) => item.id));

    if (activeIds.size === 0) {
      setSelectedInsightId(null);
      if (isNarrowLayout) {
        setFocusMode('queue');
      }
      return;
    }

    if (selectedInsightId && activeIds.has(selectedInsightId)) {
      return;
    }

    if (isNarrowLayout) {
      setSelectedInsightId(null);
      setFocusMode('queue');
      return;
    }

    setSelectedInsightId(activeItems[0]?.id ?? null);
    setFocusMode('workspace');
  }, [
    activeItems,
    isNarrowLayout,
    selectedInsightId,
    setFocusMode,
    setSelectedInsightId,
  ]);

  const activeInsight = useMemo(
    () => activeItems.find((item) => item.id === selectedInsightId) ?? null,
    [activeItems, selectedInsightId],
  );

  const activePatient = activeInsight ? patientMap.get(activeInsight.patientId) ?? null : null;
  const activeHeader = activeInsight
    ? buildInsightReviewHeader(activeInsight, activePatient)
    : null;
  const activeSummary = activeInsight ? buildInsightReviewSummary(activeInsight) : null;
  const activeGovernance = activeInsight
    ? buildInsightsGovernance(activeInsight, activePatient)
    : null;

  const selectedLowPriorityCount = lowPriorityItems.reduce(
    (count, item) => count + (selectedLowPriorityIds.has(item.id) ? 1 : 0),
    0,
  );
  const allVisibleLowPrioritySelected =
    lowPriorityItems.length > 0 &&
    lowPriorityItems.every((item) => selectedLowPriorityIds.has(item.id));

  async function refreshInsights() {
    return Promise.all([
      pendingQuery.refetch(),
      approvedQuery.refetch(),
      rejectedQuery.refetch(),
      patientsQuery.refetch(),
    ]);
  }

  function persistActiveView(nextView: InsightsView): void {
    setHasResolvedInitialEmptyView(true);
    setActiveView(nextView);
    writeWorkspaceState(INSIGHTS_WORKSPACE_PAGE, { activeView: nextView });
    if (nextView !== 'pending') {
      setSelectedLowPriorityIds(new Set());
    }
  }

  function openPatientFromInsight(item: InsightItem): void {
    const patientId = item.patientId.trim();
    if (!patientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(patientId)}`, {
      state: createPatientEntryState({
        patientId,
        source: 'insights',
        subtype: item.status,
        hint: item.title.trim() || `${categoryLabel(item.category)} guidance`,
        focus: 'insights',
        returnTo: '/insights',
      }),
    });
  }

  async function handleReview(status: 'approved' | 'rejected'): Promise<void> {
    if (!activeInsight) {
      return;
    }

    setReviewError(null);
    setReviewOutcome(null);
    setIsSubmittingId(`${activeInsight.id}:${status}`);

    try {
      const reviewedItem = await reviewInsight(activeInsight.id, status);
      const pendingPatientName =
        activeHeader?.patientName ?? patientMap.get(reviewedItem.patientId)?.displayName ?? reviewedItem.patientId;
      await refreshInsights();
      setReviewOutcome({
        ...buildInsightsOutcome({
          kind: 'single',
          status,
          title: reviewedItem.title,
          patientName: pendingPatientName,
        }),
        status,
        patientId: reviewedItem.patientId,
      });
    } catch (error) {
      setReviewError({
        title: 'Could not update insight',
        message: toUserMessage(asAppError(error)),
      });
    } finally {
      setIsSubmittingId(null);
    }
  }

  async function handleBatchReview(status: 'approved' | 'rejected'): Promise<void> {
    const selectedItems = lowPriorityItems.filter((item) => selectedLowPriorityIds.has(item.id));
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

      await refreshInsights();

      if (successCount > 0) {
        setReviewOutcome({
          ...buildInsightsOutcome({
            kind: 'batch',
            status,
            successCount,
          }),
          status,
        });
      }

      setSelectedLowPriorityIds(new Set(failedIds));

      if (failedIds.length > 0) {
        setReviewError({
          title:
            failedIds.length === 1
              ? 'Could not update low-priority suggestion'
              : 'Could not update low-priority suggestions',
          message:
            successCount > 0
              ? `${failedIds.length} low-priority suggestion${failedIds.length === 1 ? '' : 's'} could not be updated. Any successful reviews are reflected below.`
              : `${failedIds.length} low-priority suggestion${failedIds.length === 1 ? '' : 's'} could not be updated.`,
        });
      }
    } finally {
      setBatchActionStatus(null);
    }
  }

  function handleToggleLowPrioritySelection(insightId: string, checked: boolean): void {
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
    setSelectedLowPriorityIds(new Set(lowPriorityItems.map((item) => item.id)));
  }

  function clearLowPrioritySelection(): void {
    setSelectedLowPriorityIds(new Set());
  }

  function selectInsight(insightId: string): void {
    setSelectedInsightId(insightId);
    if (isNarrowLayout) {
      setFocusMode('workspace');
    }
  }

  function clearSelectionToQueue(): void {
    setSelectedInsightId(null);
    setFocusMode('queue');
  }

  const emptyState = useMemo(() => {
    if (activeQuery.error) {
      return {
        title:
          activeView === 'approved'
            ? 'Could not load approved suggestions'
            : activeView === 'rejected'
              ? 'Could not load rejected suggestions'
              : 'Could not load pending suggestions',
        description: toUserMessage(asAppError(activeQuery.error)),
      };
    }

    if (activeView === 'pending') {
      return {
        title: 'No guidance suggestions are waiting',
        description:
          'Monitoring remains active and new follow-up suggestions will appear here when clinician review is needed.',
      };
    }

    return {
      title:
        activeView === 'approved'
          ? 'No approved suggestions in this view'
          : 'No rejected suggestions in this view',
      description:
        activeView === 'approved'
          ? 'Approved suggestions will remain visible here when they have already surfaced into workflow.'
          : 'Rejected suggestions will remain visible here when they have already stayed out of workflow.',
    };
  }, [activeQuery.error, activeView]);

  return {
    activeView,
    activeInsight,
    activeHeader,
    activeSummary,
    activeGovernance,
    activePatient,
    allVisibleLowPrioritySelected,
    batchActionStatus,
    emptyState,
    focusMode,
    isRefreshing:
      pendingQuery.isFetching ||
      approvedQuery.isFetching ||
      rejectedQuery.isFetching ||
      patientsQuery.isFetching,
    loading:
      activeQuery.isLoading &&
      activeItems.length === 0,
    mutationPending: isSubmittingId !== null || batchActionStatus !== null,
    queueSections,
    reviewError,
    reviewOutcome,
    selectedInsightId,
    selectedLowPriorityCount,
    selectedLowPriorityIds,
    statusBar,
    handleBatchReview,
    handleReview,
    handleRefresh: refreshInsights,
    handleToggleLowPrioritySelection,
    openPatientFromActiveInsight: () => {
      if (activeInsight) {
        openPatientFromInsight(activeInsight);
      }
    },
    openPatientFromOutcome: () => {
      if (!reviewOutcome?.patientId) {
        return;
      }

      const reviewedItem =
        approvedItems.find((item) => item.patientId === reviewOutcome.patientId) ??
        rejectedItems.find((item) => item.patientId === reviewOutcome.patientId) ??
        activeItems.find((item) => item.patientId === reviewOutcome.patientId);

      if (reviewedItem) {
        openPatientFromInsight(reviewedItem);
      }
    },
    persistActiveView,
    selectAllVisibleLowPriority,
    clearLowPrioritySelection,
    selectInsight,
    clearSelectionToQueue,
    showQueueOnly: isNarrowLayout && (!activeInsight || focusMode === 'queue'),
  };
}
