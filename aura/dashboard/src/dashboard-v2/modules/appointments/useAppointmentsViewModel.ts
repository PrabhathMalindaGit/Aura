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
  clinicianQueryKeys,
  createAppointmentSlot,
  listAppointmentRequests,
  listAppointmentSlots,
  reviewAppointmentRequest,
  usePatients,
} from '../../../services/clinicianApi';
import { readWorkspaceState, writeWorkspaceState } from '../../../services/workspaceState';
import type { AppointmentRequestItem, AppointmentSlot, PatientSummary } from '../../../types/models';
import { asAppError, isRetryable, toUserMessage } from '../../../utils/errors';
import { createPatientEntryState } from '../../../utils/patientEntryContext';
import {
  PRESENTATION_PATIENTS,
  PRESENTATION_PUBLISH_DEFAULTS,
  PRESENTATION_REQUESTS,
  PRESENTATION_SCHEDULING_WORKSPACE_STATE,
  PRESENTATION_SLOTS,
} from './presentationSchedulingData';

const APPOINTMENTS_WORKSPACE_PAGE = 'appointments';
const PRESENTATION_RANGE_NOTICE =
  'Presentation data is prepared for Apr 13 - Apr 19, 2026. Planner controls stay inside that local presentation range.';
const PRESENTATION_REQUEST_ID_PREFIX = 'presentation-request-';

interface PublishOutcomeState {
  slotId: string;
  startsAt: string;
  endsAt: string;
}

interface RequestReviewOutcomeState {
  status: 'approved' | 'rejected';
  patientLabel: string;
  localOnly?: boolean;
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

function parseEnvBoolean(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

function isSchedulingPresentationDataEnabled(): boolean {
  return (
    parseEnvBoolean(import.meta.env.DEV) ||
    parseEnvBoolean(import.meta.env.VITE_AURA_SCHEDULING_PRESENTATION_DATA_ENABLED)
  );
}

function mergePatients(
  currentPatients: PatientSummary[] | undefined,
  presentationPatients: PatientSummary[],
): PatientSummary[] {
  const byId = new Map<string, PatientSummary>();

  for (const patient of currentPatients ?? []) {
    byId.set(patient.id, patient);
  }
  for (const patient of presentationPatients) {
    byId.set(patient.id, patient);
  }

  return Array.from(byId.values());
}

function slotOverlapsRange(slot: AppointmentSlot, from: string, to: string): boolean {
  const slotStartMs = Date.parse(slot.startsAt);
  const slotEndMs = Date.parse(slot.endsAt);
  const rangeStartMs = Date.parse(from);
  const rangeEndMs = Date.parse(to);

  if (
    !Number.isFinite(slotStartMs) ||
    !Number.isFinite(slotEndMs) ||
    !Number.isFinite(rangeStartMs) ||
    !Number.isFinite(rangeEndMs)
  ) {
    return false;
  }

  return slotStartMs < rangeEndMs && slotEndMs > rangeStartMs;
}

function formatPresentationSlotDetail(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Local presentation availability';
  }

  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function isPresentationRequest(request: AppointmentRequestItem): boolean {
  return (
    request.requestId.startsWith(PRESENTATION_REQUEST_ID_PREFIX) ||
    request.patientId.startsWith('presentation-')
  );
}

export function useAppointmentsViewModel({
  isNarrowLayout,
}: UseAppointmentsViewModelOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const presentationDataEnabled = isSchedulingPresentationDataEnabled();
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
  const [presentationDataLoaded, setPresentationDataLoaded] = useState(false);
  const [presentationRequests, setPresentationRequests] = useState<AppointmentRequestItem[]>(() => [
    ...PRESENTATION_REQUESTS,
  ]);
  const [presentationPublishedSlots, setPresentationPublishedSlots] = useState<AppointmentSlot[]>([]);
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
    enabled: !presentationDataLoaded,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const requestsQuery = useQuery({
    queryKey: ['appointments-requests', requestStatus],
    queryFn: () => listAppointmentRequests({ status: requestStatus, limit: 100 }),
    enabled: !presentationDataLoaded,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const openSlotsSummaryQuery = useQuery({
    queryKey: ['appointments-slots-summary', 'available'],
    queryFn: () => listAppointmentSlots({ status: 'available', limit: 100 }),
    enabled: !presentationDataLoaded,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const pendingRequestsSummaryQuery = useQuery({
    queryKey: ['appointments-requests-summary', 'pending'],
    queryFn: () => listAppointmentRequests({ status: 'pending', limit: 100 }),
    enabled: !presentationDataLoaded,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const presentationSlots = useMemo(
    () => sortSlotsByStart([...PRESENTATION_SLOTS, ...presentationPublishedSlots]),
    [presentationPublishedSlots],
  );

  const patientMap = useMemo(() => {
    const next = new Map<string, PatientSummary>();
    const patients = presentationDataLoaded
      ? mergePatients(patientsQuery.data, PRESENTATION_PATIENTS)
      : patientsQuery.data ?? [];

    for (const patient of patients) {
      next.set(patient.id, patient);
    }
    return next;
  }, [patientsQuery.data, presentationDataLoaded]);

  const scheduleSlots = useMemo(() => {
    const slots = presentationDataLoaded ? presentationSlots : scheduleSlotsQuery.data ?? [];

    return sortSlotsByStart(
      slots.filter((slot) => slotOverlapsRange(slot, scheduleRange.from, scheduleRange.to)),
    );
  }, [presentationDataLoaded, presentationSlots, scheduleRange.from, scheduleRange.to, scheduleSlotsQuery.data]);
  const requests = useMemo(() => {
    if (presentationDataLoaded) {
      return presentationRequests.filter((item) => item.status === requestStatus);
    }

    return requestsQuery.data ?? [];
  }, [presentationDataLoaded, presentationRequests, requestStatus, requestsQuery.data]);
  const openSlots = useMemo(() => {
    if (presentationDataLoaded) {
      return presentationSlots.filter((slot) => (slot.status ?? 'available') === 'available');
    }

    return openSlotsSummaryQuery.data ?? [];
  }, [openSlotsSummaryQuery.data, presentationDataLoaded, presentationSlots]);
  const pendingRequests = useMemo(() => {
    if (presentationDataLoaded) {
      return presentationRequests.filter((item) => item.status === 'pending');
    }

    return pendingRequestsSummaryQuery.data ?? [];
  }, [pendingRequestsSummaryQuery.data, presentationDataLoaded, presentationRequests]);

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
      setFocusMode('workspace');
      return;
    }

    if (selectedRequestId && requests.some((item) => item.requestId === selectedRequestId)) {
      return;
    }

    setSelectedRequestId(requests[0]?.requestId ?? null);
    setFocusMode('workspace');
  }, [
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
  const patientWorkspaceUnavailableReason =
    activeRequest && isPresentationRequest(activeRequest)
      ? 'Patient workspace unavailable for presentation data.'
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
  const basePublishVm = buildAppointmentPublishVm({
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
  const publishVm = presentationDataLoaded
    ? {
        ...basePublishVm,
        guidance:
          'Presentation data is local only. Publishing updates this presentation view without writing backend records.',
        metaLabel: 'Presentation local only',
        outcomeTitle: lastPublishOutcome ? 'Availability added to presentation view' : null,
        outcomeFollowThrough: lastPublishOutcome
          ? 'No backend records were written. Reset or refresh the page to return to real scheduling data.'
          : null,
      }
    : basePublishVm;
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

  function updateWorkspaceState(
    patch:
      | Partial<typeof workspaceState>
      | ((current: typeof workspaceState) => typeof workspaceState),
  ): void {
    persistWorkspaceState(patch);
  }

  function handleRequestStatusChange(status: AppointmentRequestFilter): void {
    updateWorkspaceState({ requestStatus: status });
  }

  function handleSlotStatusChange(status: AppointmentSlotFilter): void {
    updateWorkspaceState({ slotStatus: status });
  }

  function keepPresentationSchedule(view: ScheduleView = scheduleView): void {
    updateWorkspaceState((current) => ({
      ...current,
      scheduleView: view,
      scheduleDate: PRESENTATION_SCHEDULING_WORKSPACE_STATE.scheduleDate,
    }));
  }

  function handleScheduleViewChange(view: ScheduleView): void {
    if (presentationDataLoaded) {
      keepPresentationSchedule(view);
      return;
    }

    updateWorkspaceState({ scheduleView: view });
  }

  function handleScheduleDateShift(direction: 'previous' | 'next'): void {
    if (presentationDataLoaded) {
      keepPresentationSchedule();
      return;
    }

    updateWorkspaceState((current) => {
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
    if (presentationDataLoaded) {
      keepPresentationSchedule();
      return;
    }

    updateWorkspaceState({
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

  function writePresentationQueryData(
    extraSlots = presentationPublishedSlots,
    extraRequests = presentationRequests,
  ): void {
    const presentationRange = getScheduleRange(
      PRESENTATION_SCHEDULING_WORKSPACE_STATE.scheduleView,
      PRESENTATION_SCHEDULING_WORKSPACE_STATE.scheduleDate,
    );
    const pendingPresentationRequests = extraRequests.filter(
      (item) => item.status === 'pending',
    );
    const allPresentationSlots = sortSlotsByStart([...PRESENTATION_SLOTS, ...extraSlots]);

    queryClient.setQueryData<PatientSummary[]>(
      clinicianQueryKeys.patients(),
      mergePatients(patientsQuery.data, PRESENTATION_PATIENTS),
    );
    queryClient.setQueryData<AppointmentSlot[]>(
      ['appointments-schedule-slots', presentationRange.from, presentationRange.to],
      allPresentationSlots,
    );
    queryClient.setQueryData<AppointmentRequestItem[]>(
      ['appointments-requests', 'pending'],
      pendingPresentationRequests,
    );
    queryClient.setQueryData<AppointmentRequestItem[]>(
      ['appointments-requests', 'approved'],
      extraRequests.filter((item) => item.status === 'approved'),
    );
    queryClient.setQueryData<AppointmentRequestItem[]>(
      ['appointments-requests', 'rejected'],
      extraRequests.filter((item) => item.status === 'rejected'),
    );
    queryClient.setQueryData<AppointmentSlot[]>(
      ['appointments-slots-summary', 'available'],
      allPresentationSlots.filter((slot) => (slot.status ?? 'available') === 'available'),
    );
    queryClient.setQueryData<AppointmentRequestItem[]>(
      ['appointments-requests-summary', 'pending'],
      pendingPresentationRequests,
    );
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

  async function refreshPresentationWorkspace(): Promise<void> {
    writePresentationQueryData();
  }

  function openPatientFromRequest(request = activeRequest): void {
    if (!request) {
      return;
    }

    if (isPresentationRequest(request)) {
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

      if (presentationDataLoaded) {
        const createdSlot: AppointmentSlot & {
          displayTitle: string;
          displayDetail: string;
          displayMode: string;
        } = {
          slotId: `presentation-local-${Date.now()}`,
          clinicianName: 'Clinician One',
          startsAt,
          endsAt,
          modality: 'video',
          meetingLink: meetingLinkInput.trim() || undefined,
          status: 'available',
          createdAt: new Date().toISOString(),
          displayTitle: 'Published availability',
          displayDetail: formatPresentationSlotDetail(startsAt, endsAt),
          displayMode: meetingLinkInput.trim() ? 'Telehealth' : 'In-person',
        };
        const nextPresentationPublishedSlots = sortSlotsByStart([
          ...presentationPublishedSlots,
          createdSlot,
        ]);

        setPresentationPublishedSlots(nextPresentationPublishedSlots);
        writePresentationQueryData(nextPresentationPublishedSlots);
        setStartsAtInput('');
        setEndsAtInput('');
        setMeetingLinkInput('');
        setLastPublishOutcome({
          slotId: createdSlot.slotId,
          startsAt: createdSlot.startsAt,
          endsAt: createdSlot.endsAt,
        });
        return;
      }

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
      if (isPresentationRequest(activeRequest)) {
        const reviewedAt = new Date().toISOString();
        const reviewedItem: AppointmentRequestItem = {
          ...activeRequest,
          status,
          reviewedAt,
          updatedAt: reviewedAt,
        };
        const nextPresentationRequests = presentationRequests.map((item) =>
          item.requestId === reviewedItem.requestId ? reviewedItem : item,
        );
        const nextVisibleRequests = nextPresentationRequests.filter(
          (item) => item.status === requestStatus,
        );
        const patientId = reviewedItem.patientId.trim();
        const patientLabel =
          patientMap.get(patientId)?.displayName?.trim() || patientId;

        setPresentationRequests(nextPresentationRequests);
        writePresentationQueryData(presentationPublishedSlots, nextPresentationRequests);
        setSelectedRequestId(nextVisibleRequests[0]?.requestId ?? null);
        setLastRequestReviewOutcome({
          status,
          patientLabel,
          localOnly: true,
        });
        return;
      }

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

  async function loadPresentationData(): Promise<void> {
    if (!presentationDataEnabled) {
      return;
    }

    const pendingPresentationRequests = PRESENTATION_REQUESTS.filter(
      (item) => item.status === 'pending',
    );

    await Promise.all([
      queryClient.cancelQueries({ queryKey: clinicianQueryKeys.patients() }),
      queryClient.cancelQueries({ queryKey: ['appointments-schedule-slots'] }),
      queryClient.cancelQueries({ queryKey: ['appointments-requests'] }),
      queryClient.cancelQueries({ queryKey: ['appointments-slots-summary'] }),
      queryClient.cancelQueries({ queryKey: ['appointments-requests-summary'] }),
    ]);

    setPresentationPublishedSlots([]);
    setPresentationRequests([...PRESENTATION_REQUESTS]);
    writePresentationQueryData([], PRESENTATION_REQUESTS);
    setWorkspaceState(PRESENTATION_SCHEDULING_WORKSPACE_STATE);
    setSelectedRequestId(pendingPresentationRequests[0]?.requestId ?? null);
    setFocusMode('workspace');
    setStartsAtInput(PRESENTATION_PUBLISH_DEFAULTS.startsAtInput);
    setEndsAtInput(PRESENTATION_PUBLISH_DEFAULTS.endsAtInput);
    setMeetingLinkInput(PRESENTATION_PUBLISH_DEFAULTS.meetingLinkInput);
    setErrorNotice(null);
    setLastPublishOutcome(null);
    setLastRequestReviewOutcome(null);
    setPresentationDataLoaded(true);
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
    handleRefresh: presentationDataLoaded ? refreshPresentationWorkspace : refreshWorkspace,
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
    patientWorkspaceUnavailableReason,
    pendingRequestsCount,
    persistWorkspaceState,
    presentationDataControls: {
      enabled: presentationDataEnabled,
      loaded: presentationDataLoaded,
      notice: presentationDataLoaded ? PRESENTATION_RANGE_NOTICE : null,
      load: loadPresentationData,
    },
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
    showQueueOnly: false,
    slotStatus,
    statusBar,
    openPatientFromRequest,
  };
}
