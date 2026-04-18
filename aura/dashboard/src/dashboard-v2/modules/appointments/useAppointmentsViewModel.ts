import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  buildAppointmentCapacity,
  buildAppointmentPlanner,
  buildAppointmentRequestRow,
  buildAppointmentReviewHeader,
  buildAppointmentsGovernance,
  buildAppointmentsStatusBar,
  buildAppointmentPublishVm,
  createDefaultAppointmentsWorkspaceState,
  describeCoordinationState,
  describeCoverageState,
  describePublishCoverage,
  describeRequestScheduleContext,
  formatAppointmentsLastUpdated,
  getScheduleRange,
  matchPublishedOpenSlot,
  normalizeAppointmentsWorkspaceState,
  parseLocalDateKey,
  sortSlotsByStart,
  toLocalDateKey,
  type AppointmentRequestFilter,
  type AppointmentSlotFilter,
  type ScheduleView,
} from '../../adapters/appointments';
import { useAppointmentsUiStore } from '../../state/useAppointmentsUiStore';
import {
  createAppointmentSlot,
  listAppointmentRequests,
  listAppointmentSlots,
  reviewAppointmentRequest,
  usePatients,
} from '../../../services/clinicianApi';
import { readWorkspaceState, writeWorkspaceState } from '../../../services/workspaceState';
import type { AppointmentSlot, PatientSummary } from '../../../types/models';
import { asAppError, isRetryable, toUserMessage } from '../../../utils/errors';
import { createPatientEntryState } from '../../../utils/patientEntryContext';

const APPOINTMENTS_WORKSPACE_PAGE = 'appointments';

interface PublishOutcomeState {
  slotId: string;
  startsAt: string;
  endsAt: string;
}

interface RequestReviewOutcomeState {
  status: 'approved' | 'rejected';
  patientLabel: string;
}

interface AppointmentsErrorNotice {
  scope: 'review' | 'publish';
  message: string;
}

export interface UseAppointmentsViewModelOptions {
  isNarrowLayout: boolean;
}

function toIsoDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Use a valid date/time value.');
  }

  return parsed.toISOString();
}

export function useAppointmentsViewModel({
  isNarrowLayout,
}: UseAppointmentsViewModelOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedRequestId = useAppointmentsUiStore((state) => state.selectedRequestId);
  const focusMode = useAppointmentsUiStore((state) => state.focusMode);
  const setSelectedRequestId = useAppointmentsUiStore((state) => state.setSelectedRequestId);
  const setFocusMode = useAppointmentsUiStore((state) => state.setFocusMode);
  const [workspaceState, setWorkspaceState] = useState(() =>
    readWorkspaceState(
      APPOINTMENTS_WORKSPACE_PAGE,
      createDefaultAppointmentsWorkspaceState(),
      normalizeAppointmentsWorkspaceState,
    ),
  );
  const { requestStatus, slotStatus, scheduleView, scheduleDate } = workspaceState;
  const [startsAtInput, setStartsAtInput] = useState('');
  const [endsAtInput, setEndsAtInput] = useState('');
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<AppointmentsErrorNotice | null>(null);
  const [lastPublishOutcome, setLastPublishOutcome] = useState<PublishOutcomeState | null>(null);
  const [lastRequestReviewOutcome, setLastRequestReviewOutcome] =
    useState<RequestReviewOutcomeState | null>(null);

  const patientsQuery = usePatients();
  const scheduleRange = useMemo(
    () => getScheduleRange(scheduleView, scheduleDate),
    [scheduleDate, scheduleView],
  );

  const scheduleSlotsQuery = useQuery({
    queryKey: ['appointments-schedule-slots', scheduleRange.from, scheduleRange.to],
    queryFn: () =>
      listAppointmentSlots({
        from: scheduleRange.from,
        to: scheduleRange.to,
        limit: 200,
      }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const requestsQuery = useQuery({
    queryKey: ['appointments-requests', requestStatus],
    queryFn: () => listAppointmentRequests({ status: requestStatus, limit: 100 }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const openSlotsSummaryQuery = useQuery({
    queryKey: ['appointments-slots-summary', 'available'],
    queryFn: () => listAppointmentSlots({ status: 'available', limit: 100 }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const pendingRequestsSummaryQuery = useQuery({
    queryKey: ['appointments-requests-summary', 'pending'],
    queryFn: () => listAppointmentRequests({ status: 'pending', limit: 100 }),
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

  const scheduleSlots = useMemo(
    () => sortSlotsByStart(scheduleSlotsQuery.data ?? []),
    [scheduleSlotsQuery.data],
  );
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const openSlots = useMemo(() => openSlotsSummaryQuery.data ?? [], [openSlotsSummaryQuery.data]);
  const pendingRequests = useMemo(
    () => pendingRequestsSummaryQuery.data ?? [],
    [pendingRequestsSummaryQuery.data],
  );

  const visibleSlots = useMemo(
    () => scheduleSlots.filter((slot) => (slot.status ?? 'available') === slotStatus),
    [scheduleSlots, slotStatus],
  );

  const availableSlotsCount = openSlots.length;
  const pendingRequestsCount = pendingRequests.length;
  const coordinationState = describeCoordinationState(pendingRequestsCount, availableSlotsCount);
  const coverageState = describeCoverageState(pendingRequestsCount, availableSlotsCount);

  const refreshedAtLabel = formatAppointmentsLastUpdated(
    Math.max(
      scheduleSlotsQuery.dataUpdatedAt,
      requestsQuery.dataUpdatedAt,
      openSlotsSummaryQuery.dataUpdatedAt,
      pendingRequestsSummaryQuery.dataUpdatedAt,
      patientsQuery.dataUpdatedAt,
    ) || null,
  );

  const statusBar = buildAppointmentsStatusBar({
    requestStatus,
    slotStatus,
    scheduleRangeLabel: scheduleRange.label,
    pendingRequestsCount,
    availableSlotsCount,
    updatedAtLabel: refreshedAtLabel,
    coordinationState,
    coverageState,
  });

  useEffect(() => {
    if (requests.length === 0) {
      setSelectedRequestId(null);
      if (isNarrowLayout) {
        setFocusMode('workspace');
      }
      return;
    }

    if (selectedRequestId && requests.some((item) => item.requestId === selectedRequestId)) {
      return;
    }

    if (isNarrowLayout) {
      setSelectedRequestId(null);
      setFocusMode('queue');
      return;
    }

    setSelectedRequestId(requests[0]?.requestId ?? null);
    setFocusMode('workspace');
  }, [
    isNarrowLayout,
    requests,
    selectedRequestId,
    setFocusMode,
    setSelectedRequestId,
  ]);

  const activeRequest = useMemo(
    () => requests.find((item) => item.requestId === selectedRequestId) ?? requests[0] ?? null,
    [requests, selectedRequestId],
  );
  const activePatient = activeRequest ? patientMap.get(activeRequest.patientId) ?? null : null;
  const selectedRequestDayKey =
    activeRequest && Number.isFinite(new Date(activeRequest.startsAt).getTime())
      ? toLocalDateKey(new Date(activeRequest.startsAt))
      : null;
  const requestScheduleContext = useMemo(
    () => describeRequestScheduleContext(activeRequest, scheduleView, scheduleRange, scheduleSlots),
    [activeRequest, scheduleRange, scheduleSlots, scheduleView],
  );

  const requestRows = useMemo(
    () => requests.map((item) => buildAppointmentRequestRow(item, patientMap.get(item.patientId) ?? null)),
    [patientMap, requests],
  );
  const activeHeader = activeRequest
    ? buildAppointmentReviewHeader(activeRequest, activePatient)
    : null;
  const planner = buildAppointmentPlanner({
    scheduleRange,
    scheduleView,
    scheduleSlots,
    selectedRequest: activeRequest,
    selectedRequestDayKey,
    lastPublishOutcomeSlotId: lastPublishOutcome?.slotId ?? null,
  });
  const capacity = buildAppointmentCapacity(
    visibleSlots,
    slotStatus,
    lastPublishOutcome?.slotId ?? null,
  );
  const publishOutcomeState = lastPublishOutcome
    ? describePublishCoverage(pendingRequestsCount, availableSlotsCount)
    : null;
  const publishVm = buildAppointmentPublishVm({
    coverageState,
    startsAtInput,
    endsAtInput,
    meetingLinkInput,
    canPublish: startsAtInput.trim().length > 0 && endsAtInput.trim().length > 0 && !isCreating,
    publishing: isCreating,
    publishOutcomeState,
    publishOutcomeLabel: lastPublishOutcome
      ? `${lastPublishOutcome.startsAt.slice(0, 10)} · ${new Date(lastPublishOutcome.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to ${new Date(lastPublishOutcome.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : null,
  });
  const governance = buildAppointmentsGovernance({
    request: activeRequest,
    patient: activePatient,
    coordinationState,
    coverageState,
    scheduleRange,
    openSlots,
    requestScheduleContext,
  });

  function persistWorkspaceState(
    patch:
      | Partial<typeof workspaceState>
      | ((current: typeof workspaceState) => typeof workspaceState),
  ): void {
    setWorkspaceState((current) => {
      const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      writeWorkspaceState(APPOINTMENTS_WORKSPACE_PAGE, next);
      return next;
    });
  }

  function handleRequestStatusChange(status: AppointmentRequestFilter): void {
    persistWorkspaceState({ requestStatus: status });
  }

  function handleSlotStatusChange(status: AppointmentSlotFilter): void {
    persistWorkspaceState({ slotStatus: status });
  }

  function handleScheduleViewChange(view: ScheduleView): void {
    persistWorkspaceState({ scheduleView: view });
  }

  function handleScheduleDateShift(direction: 'previous' | 'next'): void {
    persistWorkspaceState((current) => {
      const anchorDate = parseLocalDateKey(current.scheduleDate) ?? new Date();
      const offset = direction === 'next' ? 1 : -1;
      const nextDate =
        current.scheduleView === 'day'
          ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + offset)
          : new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + offset * 7);

      return {
        ...current,
        scheduleDate: toLocalDateKey(nextDate),
      };
    });
  }

  function handleScheduleToday(): void {
    persistWorkspaceState({
      scheduleDate: toLocalDateKey(new Date()),
    });
  }

  function selectRequest(requestId: string): void {
    setSelectedRequestId(requestId);
    if (isNarrowLayout) {
      setFocusMode('workspace');
    }
  }

  function clearSelectionToQueue(): void {
    setSelectedRequestId(null);
    setFocusMode('queue');
  }

  async function refreshWorkspace() {
    return Promise.all([
      scheduleSlotsQuery.refetch(),
      requestsQuery.refetch(),
      openSlotsSummaryQuery.refetch(),
      pendingRequestsSummaryQuery.refetch(),
      patientsQuery.refetch(),
    ]);
  }

  function openPatientFromRequest(request = activeRequest): void {
    if (!request) {
      return;
    }

    const patientId = request.patientId.trim();
    if (!patientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(patientId)}`, {
      state: createPatientEntryState({
        patientId,
        source: 'appointments',
        subtype: request.workflowStatus?.trim() || request.status,
        hint: request.note?.trim() || 'Scheduling follow-through',
        focus: 'appointments',
        returnTo: '/appointments',
      }),
    });
  }

  async function handleCreateSlot(): Promise<void> {
    setErrorNotice(null);
    setLastPublishOutcome(null);
    setIsCreating(true);

    try {
      const startsAt = toIsoDateTime(startsAtInput);
      const endsAt = toIsoDateTime(endsAtInput);
      const createdSlot = await createAppointmentSlot({
        startsAt,
        endsAt,
        meetingLink: meetingLinkInput.trim() || undefined,
      });

      setStartsAtInput('');
      setEndsAtInput('');
      setMeetingLinkInput('');

      const [
        scheduleSlotsResult,
        requestsResult,
        openSlotsResult,
        pendingRequestsResult,
      ] = await refreshWorkspace();

      const openSlotsData = openSlotsResult.data;
      const pendingRequestsData = pendingRequestsResult.data;
      const canConfirmOutcome =
        !pendingRequestsResult.error &&
        Array.isArray(pendingRequestsData);

      if (canConfirmOutcome) {
        let refreshedOpenSlots = Array.isArray(openSlotsData) ? openSlotsData : null;
        let matchedSlot = refreshedOpenSlots
          ? matchPublishedOpenSlot(createdSlot, refreshedOpenSlots)
          : null;

        if (!matchedSlot) {
          refreshedOpenSlots = await listAppointmentSlots({ status: 'available', limit: 100 });
          matchedSlot = matchPublishedOpenSlot(createdSlot, refreshedOpenSlots);
        }

        if (matchedSlot) {
          queryClient.setQueryData(['appointments-slots-summary', 'available'], refreshedOpenSlots);

          const matchedStartsAtMs = Date.parse(matchedSlot.startsAt);
          const scheduleRangeStartMs = Date.parse(scheduleRange.from);
          const scheduleRangeEndMs = Date.parse(scheduleRange.to);

          if (
            Number.isFinite(matchedStartsAtMs) &&
            matchedStartsAtMs >= scheduleRangeStartMs &&
            matchedStartsAtMs < scheduleRangeEndMs
          ) {
            queryClient.setQueryData<AppointmentSlot[]>(
              ['appointments-schedule-slots', scheduleRange.from, scheduleRange.to],
              (current = []) =>
                sortSlotsByStart([
                  ...current.filter((slot) => slot.slotId !== matchedSlot.slotId),
                  matchedSlot,
                ]),
            );
          }

          setLastPublishOutcome({
            slotId: matchedSlot.slotId,
            startsAt: matchedSlot.startsAt,
            endsAt: matchedSlot.endsAt,
          });
        }
      }

      if (scheduleSlotsResult.error || requestsResult.error) {
        // The page still stays operational; the refreshed route data already surfaced its own state.
      }
    } catch (error) {
      setErrorNotice({
        scope: 'publish',
        message: toUserMessage(asAppError(error)),
      });
      setLastPublishOutcome(null);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleReview(status: 'approved' | 'rejected'): Promise<void> {
    if (!activeRequest) {
      return;
    }

    setErrorNotice(null);
    setLastRequestReviewOutcome(null);
    setReviewingKey(`${activeRequest.requestId}:${status}`);

    try {
      const reviewedItem = await reviewAppointmentRequest(activeRequest.requestId, status);
      const [, , openSlotsResult, pendingRequestsResult] = await refreshWorkspace();
      const refreshedPendingRequests = pendingRequestsResult.data;
      const refreshedOpenSlots = openSlotsResult.data;
      const movedOutOfPending =
        Array.isArray(refreshedPendingRequests) &&
        !refreshedPendingRequests.some((item) => item.requestId === reviewedItem.requestId);

      if (
        !pendingRequestsResult.error &&
        !openSlotsResult.error &&
        Array.isArray(refreshedPendingRequests) &&
        Array.isArray(refreshedOpenSlots) &&
        movedOutOfPending
      ) {
        const patientId = reviewedItem.patientId.trim();
        const patientLabel =
          patientMap.get(patientId)?.displayName?.trim() || patientId;

        setLastRequestReviewOutcome({
          status,
          patientLabel,
        });
      }
    } catch (error) {
      setLastRequestReviewOutcome(null);
      setErrorNotice({
        scope: 'review',
        message: toUserMessage(asAppError(error)),
      });
    } finally {
      setReviewingKey(null);
    }
  }

  return {
    activeHeader,
    activeRequest,
    capacity,
    clearSelectionToQueue,
    coverageState,
    errorNotice,
    focusMode,
    governance,
    handleCreateSlot,
    handleRequestStatusChange,
    handleRefresh: refreshWorkspace,
    handleReview,
    handleScheduleDateShift,
    handleScheduleToday,
    handleScheduleViewChange,
    handleSlotStatusChange,
    isRefreshing:
      scheduleSlotsQuery.isFetching ||
      requestsQuery.isFetching ||
      openSlotsSummaryQuery.isFetching ||
      pendingRequestsSummaryQuery.isFetching ||
      patientsQuery.isFetching,
    lastPublishOutcome,
    lastRequestReviewOutcome,
    loading:
      requestsQuery.isLoading ||
      scheduleSlotsQuery.isLoading ||
      pendingRequestsSummaryQuery.isLoading ||
      openSlotsSummaryQuery.isLoading,
    mutationPending: reviewingKey !== null,
    pendingRequestsCount,
    persistWorkspaceState,
    planner,
    publishVm,
    requestEmptyState: {
      title:
        requestStatus === 'pending'
          ? 'No requests are waiting right now'
          : `No ${requestStatus} requests`,
      description:
        requestStatus === 'pending'
          ? availableSlotsCount > 0
            ? 'Queue is quiet and published capacity is ready if new demand arrives.'
            : 'Queue is quiet. New booking requests will appear here when clinician review is needed.'
          : 'Requests matching this review state will appear here when scheduling activity changes.',
    },
    requestRows,
    requestStatus,
    scheduleDate,
    scheduleView,
    selectRequest,
    selectedRequestId,
    setEndsAtInput,
    setFocusMode,
    setMeetingLinkInput,
    setStartsAtInput,
    showQueueOnly: isNarrowLayout && requests.length > 0 && (!activeRequest || focusMode === 'queue'),
    slotStatus,
    statusBar,
    openPatientFromRequest,
  };
}
