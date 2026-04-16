import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClinicianTruthChips,
  type ClinicianTruthChip,
} from '../components/clinician/ClinicianTruthChips';
import { ClinicianDisclosure } from '../components/clinician/ClinicianDisclosure';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ClinicianAvatar } from '../components/ui/ClinicianAvatar';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useCommunicationAuthoring } from '../hooks/useCommunicationAuthoring';
import { useClinicianIdentity } from '../hooks/useClinicianIdentity';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { getSavedCommunicationFilter } from '../services/clinicianWorkspacePreferences';
import {
  recordCommunicationThreadOpened,
  useDashboardCommunicationOverview,
  useAppendPatientCoordinationNote,
  usePatientCoordination,
} from '../services/clinicianApi';
import {
  insertSignatureIntoDraft,
  insertTemplateIntoDraft,
} from '../services/communicationAuthoring';
import { getClinicianInitials } from '../services/clinicianIdentity';
import {
  COMMUNICATION_THREAD_VIEW_OPTIONS,
  addCommunicationThreadReply,
  deriveCommunicationThreads,
  findCommunicationThreadByPatientId,
  filterCommunicationThreads,
  markCommunicationThreadReviewed,
  parseCommunicationThreadView,
  readCommunicationWorkspaceLocalState,
  type CommunicationThread,
  type CommunicationThreadView,
} from '../services/communicationWorkspace';
import {
  getClinicianCoordinationLinkedTaskAssigneeLabel,
  getClinicianCoordinationLinkedTaskEmptyLabel,
  getClinicianCoordinationLinkedTaskSourceLabel,
  getClinicianCoordinationLinkedTaskStatusLabel,
  getClinicianCoordinationLinkedTaskUnavailableLabel,
  getClinicianCoordinationLatestActivity,
  getClinicianCoordinationFollowUpOwnerLabel,
  getClinicianCoordinationNextStepLabel,
} from '../utils/clinicianCoordination';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../utils/dashboard';
import { toUserMessage } from '../utils/errors';
import { truncateText } from '../utils/text';
import type { DashboardCommunicationOverviewItem } from '../types/models';

function normalizePatientId(value: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countThreadsByView(
  threads: CommunicationThread[],
  view: CommunicationThreadView,
): number {
  return filterCommunicationThreads(threads, view).length;
}

function getThreadMetaSummary(thread: CommunicationThread): string {
  if (thread.safetyFlagged) {
    return 'Safety context is active and should stay visible through review';
  }

  if (thread.responseDelayed) {
    return 'Response is delayed past the configured threshold';
  }

  if (thread.needsResponse) {
    return 'Waiting on clinician follow-up';
  }

  if (thread.reviewedAfterLatestInbound) {
    return 'Durable care-team review is recorded';
  }

  if (thread.latestEventKind === 'clinician-reply') {
    return 'Local clinician reply is the latest activity';
  }

  if (thread.followUpRequested) {
    return 'Follow-up requested in recent patient messaging';
  }

  return 'Recent patient message in review';
}

function getThreadTruthChips(thread: CommunicationThread): ClinicianTruthChip[] {
  const chips: ClinicianTruthChip[] = [];

  if (thread.safetyFlagged) {
    chips.push({ label: 'Safety flagged', variant: 'danger', truth: 'server' });
  }

  if (thread.responseDelayed) {
    chips.push({ label: 'Response delayed', variant: 'warning', truth: 'server' });
  } else if (thread.needsResponse) {
    chips.push({ label: 'Needs response', variant: 'warning', truth: 'server' });
  }

  if (thread.reviewedAfterLatestInbound && !thread.responseDelayed) {
    chips.push({ label: 'Reviewed', variant: 'info', truth: 'server' });
  }

  if (thread.followUpRequested) {
    chips.push({ label: 'Linked follow-up', variant: 'neutral', truth: 'server' });
  }

  return chips;
}

function getCommunicationContextSummary(item: DashboardCommunicationOverviewItem | null): string | null {
  if (!item) {
    return null;
  }

  const parts = [
    item.patientRiskLevel === 'high' ? 'Higher risk context' : 'Lower risk context',
    typeof item.openAlertCount === 'number'
      ? `${item.openAlertCount} open alert${item.openAlertCount === 1 ? '' : 's'}`
      : null,
    item.lastPainScore !== undefined ? `Last pain ${item.lastPainScore}/10` : null,
    item.reviewedAfterLatestInbound && item.lastReviewedAt
      ? `Reviewed ${formatDashboardRelativeTime(item.lastReviewedAt)}`
      : null,
    (item.responseDelayed === true || item.responseState === 'delayed')
      ? `Response delayed past ${item.responseDelayHours ?? 'configured'}h`
      : item.responseDelayHours
        ? `Response target ${item.responseDelayHours}h`
        : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getPatientInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? '')
      .join('') || 'P'
  );
}

function getCommunicationThreadTone(thread: CommunicationThread): 'safety' | 'response' | 'follow-up' | 'reviewed' {
  if (thread.safetyFlagged) {
    return 'safety';
  }

  if (thread.responseDelayed) {
    return 'response';
  }

  if (thread.needsResponse) {
    return 'response';
  }

  if (thread.followUpRequested) {
    return 'follow-up';
  }

  return 'reviewed';
}

function getEventTypeBadge(event: CommunicationThread['timeline'][number]): {
  label: string;
  variant: 'default' | 'neutral' | 'success';
} {
  if (event.kind === 'clinician-reply') {
    return {
      label: event.localOnly ? 'Local clinician reply' : 'Clinician reply',
      variant: 'success',
    };
  }

  return {
    label: 'Patient message',
    variant: 'neutral',
  };
}

function getTimelineEventBadges(event: CommunicationThread['timeline'][number]): Array<{
  label: string;
  variant: 'default' | 'neutral' | 'success' | 'danger';
}> {
  const eventTypeBadge = getEventTypeBadge(event);
  const badges: Array<{
    label: string;
    variant: 'default' | 'neutral' | 'success' | 'danger';
  }> = [eventTypeBadge];

  if (event.flaggedBySafety) {
    badges.push({ label: 'Safety flagged', variant: 'danger' });
  } else if (event.followUpRequested) {
    badges.push({ label: 'Follow-up requested', variant: 'neutral' });
  } else if (event.localOnly && event.kind !== 'clinician-reply') {
    badges.push({ label: 'Local', variant: 'default' });
  }

  return badges.slice(0, 2);
}

function getTimelineEventMetaNote(event: CommunicationThread['timeline'][number]): string | null {
  if (event.flaggedBySafety && event.followUpRequested) {
    return 'Follow-up requested';
  }

  if (event.localOnly && event.kind !== 'clinician-reply') {
    return 'Local-only context';
  }

  return null;
}

export function CommunicationPage(): JSX.Element {
  const navigate = useNavigate();
  const clinicianIdentity = useClinicianIdentity();
  const communicationAuthoring = useCommunicationAuthoring();
  const notificationPreferences = useNotificationPreferences();
  const communicationScopeKey = clinicianIdentity.authScopeId ?? clinicianIdentity.clinicianId;
  const [searchParams, setSearchParams] = useSearchParams();
  const [localState, setLocalState] = useState(() => readCommunicationWorkspaceLocalState(communicationScopeKey));
  const [draftReply, setDraftReply] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sharedNoteDraft, setSharedNoteDraft] = useState('');
  const [sharedNoteNotice, setSharedNoteNotice] = useState<string | null>(null);
  const [sharedNoteError, setSharedNoteError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadView, setSelectedThreadView] = useState<CommunicationThreadView | null>(null);
  const hasInitializedSelectionRef = useRef(false);
  const draftSessionInitializationRef = useRef<Record<string, true>>({});
  const communicationAuthoringRef = useRef(communicationAuthoring);
  const initialDefaultViewRef = useRef<CommunicationThreadView>(getSavedCommunicationFilter());
  const communicationQuery = useDashboardCommunicationOverview(100);

  const currentView = searchParams.has('view')
    ? parseCommunicationThreadView(searchParams.get('view'))
    : initialDefaultViewRef.current;
  const requestedPatientId = normalizePatientId(searchParams.get('patientId'));
  const allThreads = useMemo(
    () => deriveCommunicationThreads(communicationQuery.data?.items ?? [], localState),
    [communicationQuery.data?.items, localState],
  );
  const threadContextMap = useMemo(() => {
    const map = new Map<string, DashboardCommunicationOverviewItem>();
    for (const item of communicationQuery.data?.items ?? []) {
      const key = item.patientId.trim() || `unknown-${item.id}`;
      const existing = map.get(key);
      if (!existing || Date.parse(item.messageCreatedAt) > Date.parse(existing.messageCreatedAt)) {
        map.set(key, item);
      }
    }
    return map;
  }, [communicationQuery.data?.items]);
  const filteredThreads = useMemo(
    () => filterCommunicationThreads(allThreads, currentView),
    [allThreads, currentView],
  );
  const requestedThread = useMemo(
    () => findCommunicationThreadByPatientId(allThreads, requestedPatientId),
    [allThreads, requestedPatientId],
  );

  useEffect(() => {
    communicationAuthoringRef.current = communicationAuthoring;
  }, [communicationAuthoring]);

  useEffect(() => {
    setLocalState(readCommunicationWorkspaceLocalState(communicationScopeKey));
    draftSessionInitializationRef.current = {};
    setDraftReply('');
  }, [communicationScopeKey]);

  useEffect(() => {
    if (communicationAuthoring.templates.length === 0) {
      setSelectedTemplateId('');
      return;
    }

    if (!communicationAuthoring.templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(communicationAuthoring.templates[0]?.id ?? '');
    }
  }, [communicationAuthoring.templates, selectedTemplateId]);

  useEffect(() => {
    let nextSelectedThreadId = selectedThreadId;
    let nextSelectedThreadView = selectedThreadView;

    if (requestedThread) {
      hasInitializedSelectionRef.current = true;
      nextSelectedThreadId = requestedThread.id;
      nextSelectedThreadView = currentView;
    } else if (selectedThreadId && allThreads.some((thread) => thread.id === selectedThreadId)) {
      hasInitializedSelectionRef.current = true;
      nextSelectedThreadId = selectedThreadId;
    } else if (!hasInitializedSelectionRef.current) {
      hasInitializedSelectionRef.current = true;
      nextSelectedThreadId = filteredThreads[0]?.id ?? allThreads[0]?.id ?? null;
      nextSelectedThreadView = nextSelectedThreadId ? currentView : null;
    } else {
      nextSelectedThreadId = allThreads[0]?.id ?? null;
      nextSelectedThreadView = nextSelectedThreadId ? currentView : null;
    }

    if (selectedThreadId !== nextSelectedThreadId) {
      setSelectedThreadId(nextSelectedThreadId);
    }

    if (selectedThreadView !== nextSelectedThreadView) {
      setSelectedThreadView(nextSelectedThreadView);
    }
  }, [allThreads, currentView, filteredThreads, requestedThread, selectedThreadId, selectedThreadView]);

  const selectedThread = useMemo(
    () => allThreads.find((thread) => thread.id === selectedThreadId) ?? null,
    [allThreads, selectedThreadId],
  );
  const activeThreadContext = useMemo(
    () => (selectedThread ? threadContextMap.get(selectedThread.id) ?? null : null),
    [selectedThread, threadContextMap],
  );
  const selectedThreadVisibleInCurrentView = useMemo(
    () => filteredThreads.some((thread) => thread.id === selectedThreadId),
    [filteredThreads, selectedThreadId],
  );
  const shouldKeepSelectedThreadVisible = Boolean(
    selectedThread &&
      selectedThreadView === currentView &&
      !selectedThreadVisibleInCurrentView,
  );
  const visibleThreads = useMemo(() => {
    if (!selectedThread || !shouldKeepSelectedThreadVisible) {
      return filteredThreads;
    }

    return [selectedThread, ...filteredThreads.filter((thread) => thread.id !== selectedThread.id)];
  }, [filteredThreads, selectedThread, shouldKeepSelectedThreadVisible]);
  const activeThread = useMemo(
    () =>
      filteredThreads.find((thread) => thread.id === selectedThreadId) ??
      (shouldKeepSelectedThreadVisible ? selectedThread : null),
    [filteredThreads, selectedThread, selectedThreadId, shouldKeepSelectedThreadVisible],
  );
  const activePatientId = activeThread?.validPatientId ? activeThread.patientId : null;
  const appendSharedCoordinationNoteMutation = useAppendPatientCoordinationNote(
    activePatientId ?? '',
  );
  const activePatientCoordinationQuery = usePatientCoordination(activePatientId);
  const activePatientCoordination = activePatientCoordinationQuery.data ?? null;
  const activePatientCurrentHandoff = activePatientCoordination?.currentHandoff ?? null;
  const activePatientCoordinationNotes = useMemo(
    () => activePatientCoordination?.noteHistory ?? [],
    [activePatientCoordination],
  );
  const activePatientLinkedTask = activePatientCurrentHandoff?.linkedTask ?? null;
  const activePatientLinkedTaskId = activePatientCurrentHandoff?.linkedTaskId ?? '';
  const latestSharedCoordinationActivity = useMemo(
    () => getClinicianCoordinationLatestActivity(activePatientCoordination),
    [activePatientCoordination],
  );
  const recentSharedCoordinationNotes = useMemo(
    () => activePatientCoordinationNotes.slice(0, 3),
    [activePatientCoordinationNotes],
  );
  const activeThreadId = activeThread?.id ?? null;
  const activeThreadCanSeedSignature = Boolean(activeThread?.validPatientId);

  useEffect(() => {
    if (!activeThread?.validPatientId || !activeThread.latestInboundAt) {
      return;
    }

    setLocalState((current) =>
      markCommunicationThreadReviewed(
        current,
        activeThread.patientId,
        activeThread.latestInboundAt,
        communicationScopeKey,
      ),
    );
  }, [
    activeThread?.id,
    activeThread?.latestInboundAt,
    activeThread?.patientId,
    activeThread?.validPatientId,
    communicationScopeKey,
  ]);

  useEffect(() => {
    if (!activeThread?.validPatientId) {
      return;
    }

    void recordCommunicationThreadOpened(activeThread.patientId, {
      sourceSurface: 'communication_inbox',
    }).catch(() => {
      // Keep inbox navigation resilient if the internal signal cannot be recorded.
    });
  }, [activeThread?.id, activeThread?.patientId, activeThread?.validPatientId]);

  useEffect(() => {
    if (!activeThreadId) {
      setDraftReply('');
      return;
    }

    if (draftSessionInitializationRef.current[activeThreadId]) {
      setDraftReply('');
      return;
    }

    draftSessionInitializationRef.current[activeThreadId] = true;
    const nextAuthoring = communicationAuthoringRef.current;
    const shouldSeedSignature =
      activeThreadCanSeedSignature &&
      nextAuthoring.autoAppendSignature &&
      nextAuthoring.hasSignature;

    setDraftReply(shouldSeedSignature ? nextAuthoring.defaultSignature : '');
  }, [activeThreadCanSeedSignature, activeThreadId]);

  useEffect(() => {
    setSharedNoteDraft('');
    setSharedNoteNotice(null);
    setSharedNoteError(null);
  }, [activePatientId]);

  const selectedTemplate = useMemo(
    () =>
      communicationAuthoring.templates.find((template) => template.id === selectedTemplateId) ?? null,
    [communicationAuthoring.templates, selectedTemplateId],
  );

  function updateSearchParams(next: {
    patientId?: string | null;
    view?: CommunicationThreadView;
  }): void {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);

      if (next.view) {
        params.set('view', next.view);
      } else {
        params.delete('view');
      }

      if (typeof next.patientId === 'string' && next.patientId.trim()) {
        params.set('patientId', next.patientId.trim());
      } else if (next.patientId === null) {
        params.delete('patientId');
      }

      return params;
    });
  }

  function handleSelectThread(thread: CommunicationThread): void {
    setSelectedThreadId(thread.id);
    setSelectedThreadView(currentView);
    updateSearchParams({
      view: currentView,
      patientId: thread.validPatientId ? thread.patientId : null,
    });
  }

  function handleViewChange(nextView: CommunicationThreadView): void {
    updateSearchParams({ view: nextView });
  }

  function handleSendReply(): void {
    if (!activeThread?.validPatientId) {
      return;
    }

    const nextDraft = draftReply.trim();
    if (!nextDraft) {
      return;
    }

    setLocalState((current) =>
      addCommunicationThreadReply(
        current,
        {
          patientId: activeThread.patientId,
          text: nextDraft,
        },
        communicationScopeKey,
      ),
    );
    setDraftReply('');
  }

  function handleInsertTemplate(): void {
    if (!selectedTemplate) {
      return;
    }

    setDraftReply((current) =>
      insertTemplateIntoDraft(current, selectedTemplate.body, {
        signature: communicationAuthoring.defaultSignature,
      }),
    );
  }

  function handleInsertSignature(): void {
    if (!communicationAuthoring.hasSignature) {
      return;
    }

    setDraftReply((current) =>
      insertSignatureIntoDraft(current, communicationAuthoring.defaultSignature),
    );
  }

  function handleAddSharedNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSharedNoteNotice(null);
    setSharedNoteError(null);

    if (!activePatientId) {
      return;
    }

    if (sharedNoteDraft.trim().length === 0) {
      setSharedNoteError('Add a short shared coordination note before saving.');
      return;
    }

    appendSharedCoordinationNoteMutation.mutate(
      {
        text: sharedNoteDraft,
        messageId: activeThreadContext?.messageId,
      },
      {
        onSuccess: () => {
          setSharedNoteDraft('');
          setSharedNoteError(null);
          setSharedNoteNotice('Shared coordination note added for the care team.');
        },
        onError: (error) => {
          setSharedNoteNotice(null);
          setSharedNoteError(toUserMessage(error));
        },
      },
    );
  }

  const activeThreadMissingFromView = Boolean(selectedThread && !activeThread);
  const hasThreads = allThreads.length > 0;
  const hasVisibleThreads = visibleThreads.length > 0;
  const reduceCommunicationAttention =
    notificationPreferences.effectiveCommunicationCueMode === 'reduced';
  const activeThreadTone = activeThread ? getCommunicationThreadTone(activeThread) : null;
  const communicationSummary = useMemo(
    () => ({
      total: allThreads.length,
      needsResponse: allThreads.filter((thread) => thread.needsResponse).length,
      responseDelayed: allThreads.filter((thread) => thread.responseDelayed).length,
      safetyFlagged: allThreads.filter((thread) => thread.safetyFlagged).length,
      reviewed: allThreads.filter(
        (thread) => thread.reviewedAfterLatestInbound && !thread.responseDelayed,
      ).length,
      followUpRequested: allThreads.filter((thread) => thread.followUpRequested).length,
    }),
    [allThreads],
  );
  const communicationGuidance =
    communicationSummary.safetyFlagged > 0
      ? `${formatCountLabel(
          communicationSummary.safetyFlagged,
          'safety-flagged thread',
          'safety-flagged threads',
        )} and ${formatCountLabel(
          communicationSummary.needsResponse,
          'thread need',
          'threads need',
        )} response review now.`
      : communicationSummary.responseDelayed > 0
        ? `${formatCountLabel(
            communicationSummary.responseDelayed,
            'thread is',
            'threads are',
          )} beyond the configured response window.`
        : communicationSummary.needsResponse > 0
        ? `${formatCountLabel(
            communicationSummary.needsResponse,
            'thread needs',
            'threads need',
          )} clinician follow-up now.`
        : communicationSummary.reviewed > 0
          ? `${formatCountLabel(
              communicationSummary.reviewed,
              'thread is',
              'threads are',
            )} already reviewed and still visible for workflow follow-through.`
          : communicationSummary.followUpRequested > 0
          ? `${formatCountLabel(
              communicationSummary.followUpRequested,
              'thread has',
              'threads have',
            )} follow-up requested.`
          : hasThreads
              ? `${formatCountLabel(
                  communicationSummary.total,
                  'thread is',
                  'threads are',
                )} currently in review.`
              : 'No patient communication is waiting in this workspace.';
  const triageCounters = useMemo(
    () => [
      {
        key: 'needs-response',
        label: 'Needs response',
        value: communicationSummary.needsResponse,
        tone: 'response' as const,
      },
      {
        key: 'response-delayed',
        label: 'Response delayed',
        value: communicationSummary.responseDelayed,
        tone: 'delayed' as const,
      },
      {
        key: 'safety-flagged',
        label: 'Safety flagged',
        value: communicationSummary.safetyFlagged,
        tone: 'safety' as const,
      },
    ],
    [communicationSummary],
  );
  const activeThreadSummaryFacts = useMemo(() => {
    if (!activeThread) {
      return [];
    }

    const items = [
      {
        label: 'Response state',
        value: activeThread.responseDelayed
          ? 'Delayed'
          : activeThread.needsResponse
            ? 'Needs response'
            : activeThread.reviewedAfterLatestInbound
              ? 'Reviewed'
              : 'In review',
        note: getThreadMetaSummary(activeThread),
        tone: activeThread.safetyFlagged
          ? 'danger'
          : activeThread.responseDelayed
          ? 'warning'
          : activeThread.reviewedAfterLatestInbound
            ? 'success'
            : 'neutral',
      },
      {
        label: 'Updated',
        value: formatDashboardDateTime(activeThread.latestEventAt),
        note: 'Latest patient-visible thread activity',
        tone: 'neutral',
      },
    ];

    if (activeThreadContext?.responseDueAt) {
      items.push({
        label: 'Due by',
        value: formatDashboardDateTime(activeThreadContext.responseDueAt),
        note: activeThread.responseDelayed ? 'Past target' : 'Configured response target',
        tone: activeThread.responseDelayed ? 'danger' : 'neutral',
      });
    }

    if (activeThreadContext) {
      items.push({
        label: 'Risk context',
        value: activeThreadContext.patientRiskLevel === 'high' ? 'Higher risk' : 'Lower risk',
        note:
          typeof activeThreadContext.openAlertCount === 'number'
            ? `${activeThreadContext.openAlertCount} open alert${
                activeThreadContext.openAlertCount === 1 ? '' : 's'
              }`
            : 'No open alert count available',
        tone: activeThreadContext.patientRiskLevel === 'high' ? 'warning' : 'neutral',
      });
    }

    if (activeThreadContext?.lastCheckinAt) {
      items.push({
        label: 'Last check-in',
        value: formatDashboardRelativeTime(activeThreadContext.lastCheckinAt),
        note: 'Most recent patient check-in context',
        tone: 'neutral',
      });
    }

    return items.slice(0, 4);
  }, [activeThread, activeThreadContext]);
  const activeThreadTruthChips = useMemo<ClinicianTruthChip[]>(() => {
    if (!activeThread) {
      return [];
    }

    return [
      ...getThreadTruthChips(activeThread),
      ...(!activeThread.unread
        ? [{ label: 'Opened here', variant: 'neutral', truth: 'local' as const }]
        : []),
    ];
  }, [activeThread]);
  const activeThreadVisibleTruthChips = useMemo(
    () => activeThreadTruthChips.slice(0, 4),
    [activeThreadTruthChips],
  );
  const activeThreadPatientId = activeThread?.validPatientId ? activeThread.patientId : '';
  const hasSupportRail = activeThreadPatientId.length > 0;

  return (
    <Stack className="page-stack dashboard-page-shell dashboard-page-shell--communication communication-page communication-page--inbox" gap="5">
      <Section
        className="dashboard-page-header dashboard-page-header--communication communication-page__header"
        eyebrow="Clinician follow-up"
        title="Inbox"
        subtitle="Review patient communication that needs clinician follow-up, keep local drafts separate, and reference shared coordination."
      />

      <section className="inbox-triage-bar" aria-label="Inbox controls">
        <div className="inbox-triage-strip__lead">
          <div className="inbox-triage-strip__copy">
            <p className="inbox-triage-strip__eyebrow">Queue focus</p>
            <p className="inbox-triage-bar__note">{communicationGuidance}</p>
          </div>

          <div className="inbox-triage-strip__counters" aria-label="Queue priority counters">
            {triageCounters.map((counter) => (
              <div
                key={counter.key}
                data-testid={
                  counter.key === 'needs-response' ? 'communication-needs-response-pill' : undefined
                }
                className={`inbox-triage-strip__counter inbox-triage-strip__counter--${counter.tone}${
                  counter.key === 'needs-response' && !reduceCommunicationAttention
                    ? ' communication-page__status-card--response-hot'
                    : ''
                }`}
              >
                <p className="inbox-triage-strip__counter-label">{counter.label}</p>
                <p className="inbox-triage-strip__counter-value">{counter.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="inbox-triage-bar__actions">
          <div
            className="communication-page__filters inbox-triage-bar__filters"
            role="group"
            aria-label="Communication filters"
          >
            {COMMUNICATION_THREAD_VIEW_OPTIONS.map((option) => {
              const isActive = option.id === currentView;
              const count = countThreadsByView(allThreads, option.id);

              return (
                <Button
                  key={option.id}
                  className="communication-page__filter-button"
                  variant={isActive ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={isActive}
                  onClick={() => handleViewChange(option.id)}
                >
                  {option.label}
                  <span className="communication-page__filter-count">{count}</span>
                </Button>
              );
            })}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void communicationQuery.refetch();
            }}
            disabled={communicationQuery.isFetching}
          >
            {communicationQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </section>

      <section
        className={`inbox-workspace${hasSupportRail ? '' : ' inbox-workspace--no-support'}`}
        aria-label="Inbox response workspace"
      >
        <aside className="inbox-thread-rail" aria-label="Communication queue">
          <header className="inbox-thread-rail__header">
            <div className="inbox-panel__copy">
              <h2 className="inbox-panel__title">Communication queue</h2>
              <p className="inbox-panel__note">Select the next patient thread that needs follow-through.</p>
            </div>
          </header>

          {communicationQuery.isLoading && !hasThreads ? (
            <div
              className="communication-page__thread-skeletons inbox-thread-rail__state"
              aria-label="Communication queue loading placeholder"
            >
              <Skeleton height={92} />
              <Skeleton height={92} />
              <Skeleton height={92} />
            </div>
          ) : communicationQuery.error && !hasThreads ? (
            <div className="communication-page__inline-state inbox-thread-rail__state" role="status">
              <p>{toUserMessage(communicationQuery.error)}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void communicationQuery.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : !hasThreads ? (
            <div className="inbox-thread-rail__state">
              <EmptyState
                title="No communication waiting"
                description="Patient communication needing clinician review will appear here."
                tone="success"
              />
            </div>
          ) : !hasVisibleThreads ? (
            <div className="inbox-thread-rail__state">
              <EmptyState
                title="No threads match this view"
                description="Choose another filter to return to the current communication queue."
                tone="warning"
              />
            </div>
          ) : (
            <div
              className="communication-page__thread-list inbox-thread-rail__list"
              role="list"
              aria-label="Communication threads"
            >
              {visibleThreads.map((thread) => {
                const isSelected = thread.id === activeThread?.id;
                const threadTone = getCommunicationThreadTone(thread);
                const threadContext = threadContextMap.get(thread.id) ?? null;
                const threadContextSummary = getCommunicationContextSummary(threadContext);
                const threadTruthChips = getThreadTruthChips(thread).slice(0, 2);
                const queueMetaLine = threadContextSummary ?? getThreadMetaSummary(thread);

                return (
                  <article key={thread.id} className="communication-page__thread-list-item" role="listitem">
                    <button
                      type="button"
                      className={`communication-page__thread-item inbox-thread-item${
                        isSelected ? ' communication-page__thread-item--active' : ''
                      } communication-page__thread-item--${threadTone}`}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectThread(thread)}
                    >
                      <div className="communication-page__thread-identity inbox-thread-item__identity">
                        <span className="communication-page__thread-avatar" aria-hidden="true">
                          {getPatientInitials(thread.patientName)}
                        </span>
                        <div className="communication-page__thread-identity-copy">
                          <div className="communication-page__thread-item-top inbox-thread-item__headline">
                            <div className="inbox-thread-item__headline-copy">
                              <strong className="communication-page__thread-name">{thread.patientName}</strong>
                            </div>
                            <span
                              className="communication-page__thread-time"
                              title={formatDashboardDateTime(thread.latestEventAt)}
                            >
                              {formatDashboardDateTime(thread.latestEventAt)}
                            </span>
                          </div>
                          {threadTruthChips.length > 0 ? (
                            <ClinicianTruthChips chips={threadTruthChips} />
                          ) : null}
                          <div className="inbox-thread-item__meta-line">
                            <span className="communication-page__thread-meta-note">{queueMetaLine}</span>
                          </div>
                        </div>
                      </div>
                      <p className="communication-page__thread-preview">{thread.latestEventPreview}</p>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </aside>

        <section
          className={`inbox-response-stage${
            activeThreadTone ? ` inbox-response-stage--${activeThreadTone}` : ''
          }`}
          aria-label="Active communication review"
        >
          {communicationQuery.isLoading && !hasThreads ? (
            <div
              className="communication-page__timeline-skeletons inbox-response-stage__state"
              aria-label="Communication timeline loading placeholder"
            >
              <Skeleton height={88} />
              <Skeleton height={88} />
            </div>
          ) : activeThread ? (
            <div className="communication-page__timeline-body inbox-response-stage__body">
              <section className="inbox-active-summary" aria-label="Active thread summary">
                <div className="inbox-active-summary__header">
                  <div className="inbox-active-summary__identity">
                    <span className="inbox-response-stage__avatar" aria-hidden="true">
                      {getPatientInitials(activeThread.patientName)}
                    </span>
                    <div className="inbox-active-summary__copy">
                      <p className="inbox-triage-strip__eyebrow">Active thread</p>
                      <h2 className="inbox-active-summary__title">{activeThread.patientName}</h2>
                      <p className="inbox-active-summary__note">{getThreadMetaSummary(activeThread)}</p>
                    </div>
                  </div>

                  <div className="inbox-active-summary__actions">
                    {activeThread.validPatientId && activeThread.safetyFlagged ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/alerts?patientId=${encodeURIComponent(activeThread.patientId)}&source=chat`,
                          )
                        }
                      >
                        Open alerts
                      </Button>
                    ) : activeThread.validPatientId ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)
                        }
                      >
                        Open patient
                      </Button>
                    ) : null}

                    {activeThread.validPatientId && activeThread.safetyFlagged ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)
                        }
                      >
                        Open patient
                      </Button>
                    ) : null}

                    {activeThread.validPatientId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/patients/${encodeURIComponent(activeThread.patientId)}/communications`,
                          )
                        }
                      >
                        Structured coordination
                      </Button>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void communicationQuery.refetch();
                      }}
                      disabled={communicationQuery.isFetching}
                    >
                      {communicationQuery.isFetching ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                </div>

                <div className="inbox-active-summary__meta">
                  {activeThread.validPatientId ? (
                    <span className="communication-page__thread-id">ID: {activeThread.patientId}</span>
                  ) : null}
                  <span
                    className="inbox-response-stage__updated"
                    title={formatDashboardDateTime(activeThread.latestEventAt)}
                  >
                    Updated {formatDashboardRelativeTime(activeThread.latestEventAt)}
                  </span>
                  {activeThreadContext ? (
                    <span>{getCommunicationContextSummary(activeThreadContext)}</span>
                  ) : null}
                </div>

                {activeThreadVisibleTruthChips.length > 0 ? (
                  <ClinicianTruthChips chips={activeThreadVisibleTruthChips} />
                ) : null}

                {activeThreadSummaryFacts.length > 0 ? (
                  <dl className="inbox-active-summary__facts">
                    {activeThreadSummaryFacts.map((item) => (
                      <div
                        key={item.label}
                        className={`inbox-active-summary__fact-row inbox-active-summary__fact-row--${
                          item.tone ?? 'neutral'
                        }`}
                      >
                        <dt>{item.label}</dt>
                        <div className="inbox-active-summary__fact-copy">
                          <dd>{item.value}</dd>
                          <p>{item.note}</p>
                        </div>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </section>

              <section className="inbox-timeline-panel">
                <div className="inbox-lane-section__header">
                  <div className="inbox-lane-section__copy">
                    <p className="inbox-triage-strip__eyebrow">Main review lane</p>
                    <h3 className="inbox-lane-section__title">Timeline</h3>
                  </div>
                </div>

                <div
                  className="communication-page__timeline-list"
                  role="list"
                  aria-label="Patient communication timeline"
                >
                  {activeThread.timeline.map((event) => {
                    const eventBadges = getTimelineEventBadges(event);
                    const eventMetaNote = getTimelineEventMetaNote(event);

                    return (
                      <article
                        key={event.id}
                        className={`communication-page__timeline-event communication-page__timeline-event--${
                          event.kind === 'clinician-reply' ? 'clinician' : 'patient'
                        }`}
                        role="listitem"
                      >
                        <div className="communication-page__timeline-event-head">
                          <div className="communication-page__timeline-event-copy">
                            {event.kind === 'clinician-reply' ? (
                              <div className="communication-page__timeline-event-author">
                                <ClinicianAvatar
                                  identity={{
                                    displayName: event.senderLabel,
                                    initials: getClinicianInitials(event.senderLabel),
                                    photo: null,
                                  }}
                                  decorative
                                  size="sm"
                                />
                                <div className="communication-page__timeline-event-author-copy">
                                  <strong>{event.senderLabel}</strong>
                                  {event.senderSecondaryLabel ? (
                                    <span className="communication-page__timeline-event-secondary">
                                      {event.senderSecondaryLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <strong>{event.senderLabel}</strong>
                            )}
                            <div className="communication-page__timeline-event-meta">
                              <span
                                className="communication-page__timeline-event-time"
                                title={formatDashboardDateTime(event.occurredAt)}
                              >
                                {formatDashboardRelativeTime(event.occurredAt)}
                              </span>
                              {eventMetaNote ? (
                                <span className="communication-page__timeline-event-secondary">
                                  {eventMetaNote}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {eventBadges.length > 0 ? (
                            <div className="communication-page__timeline-event-badges">
                              {eventBadges.map((badge) => (
                                <Badge key={`${event.id}-${badge.label}`} variant={badge.variant}>
                                  {badge.label}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <p className="communication-page__timeline-event-preview">{event.preview}</p>
                      </article>
                    );
                  })}
                </div>
              </section>

              <ClinicianDisclosure
                title="Local personal reply draft"
                summary="Local to this browser for this clinician. Not sent from Aura and not shared with the care team."
                defaultOpen
              >
                <section className="inbox-draft-panel">
                  <div className="communication-page__composer">
                    <div
                      className="communication-authoring-tools inbox-draft-panel__toolbar"
                      role="group"
                      aria-label="Reply helpers"
                    >
                      <label
                        className="form-field communication-authoring-tools__picker"
                        htmlFor="communication-reply-template-picker"
                      >
                        <span>Quick reply template</span>
                        <select
                          id="communication-reply-template-picker"
                          value={selectedTemplateId}
                          onChange={(event) => setSelectedTemplateId(event.target.value)}
                          aria-label="Quick reply template"
                          disabled={communicationAuthoring.templates.length === 0}
                        >
                          {communicationAuthoring.templates.length === 0 ? (
                            <option value="">No saved templates in Settings</option>
                          ) : null}
                          {communicationAuthoring.templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="communication-authoring-tools__actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleInsertTemplate}
                          disabled={!selectedTemplate}
                        >
                          Insert template
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleInsertSignature}
                          disabled={!communicationAuthoring.hasSignature}
                        >
                          Insert signature
                        </Button>
                      </div>
                    </div>

                    <div className="inbox-draft-panel__identity">
                      <div
                        className="communication-page__composer-identity"
                        aria-label="Local clinician identity"
                      >
                        <span className="communication-page__composer-identity-label">
                          Local clinician identity
                        </span>
                        <div className="communication-page__composer-identity-card">
                          <ClinicianAvatar identity={clinicianIdentity} decorative size="sm" />
                          <div className="communication-page__composer-identity-copy">
                            <strong>{clinicianIdentity.displayName}</strong>
                            {clinicianIdentity.secondaryLine ? (
                              <span>{clinicianIdentity.secondaryLine}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="inbox-draft-panel__truth">
                        <ClinicianTruthChips
                          chips={[{ label: 'Local draft', variant: 'neutral', truth: 'local' }]}
                        />
                      </div>
                    </div>

                    <label className="form-field communication-page__composer-field inbox-draft-panel__field">
                      <span>Personal reply draft</span>
                      <textarea
                        value={draftReply}
                        onChange={(event) => {
                          setDraftReply(event.target.value);
                        }}
                        rows={4}
                        placeholder="Add a calm clinician follow-up note for this patient thread."
                        disabled={!activeThread.validPatientId}
                      />
                    </label>
                    <div className="communication-page__composer-footer">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSendReply}
                        disabled={!activeThread.validPatientId || draftReply.trim().length === 0}
                      >
                        Save local reply
                      </Button>
                    </div>
                  </div>
                </section>
              </ClinicianDisclosure>
            </div>
          ) : activeThreadMissingFromView ? (
            <div className="inbox-response-stage__state">
              <EmptyState
                title="Selected thread is outside this view"
                description="Choose a thread from the filtered list to continue communication review."
                tone="warning"
              />
            </div>
          ) : hasThreads ? (
            <div className="inbox-response-stage__state">
              <EmptyState
                title="Select a patient thread"
                description="Open a communication thread from the list to review the current patient timeline."
                tone="neutral"
              />
            </div>
          ) : (
            <div className="inbox-response-stage__state">
              <EmptyState
                title="No communication timeline available"
                description="Patient communication will appear here when the dashboard has message review context to show."
                tone="neutral"
              />
            </div>
          )}
        </section>

        {hasSupportRail ? (
          <aside
            className="inbox-support-rail inbox-support"
            aria-label="Shared clinician coordination"
            data-testid="communication-shared-coordination"
          >
            <section className="inbox-support-group inbox-support-group--shared">
              <div className="inbox-support-group__header">
                <div className="inbox-support-group__copy">
                  <p className="inbox-support-group__eyebrow">Shared coordination</p>
                  <h3 className="inbox-support-group__title">Shared care-team coordination</h3>
                  <p className="inbox-support__text">
                    Shared in Aura for the care team across clinician sessions and devices. It stays separate from personal reply drafts and the patient message timeline.
                  </p>
                </div>
                <div className="inbox-handoff__actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/patients/${encodeURIComponent(activeThreadPatientId)}/communications`,
                      )
                    }
                  >
                    Open structured coordination in Patient Detail
                  </Button>
                </div>
              </div>

              {activePatientCoordinationQuery.isLoading &&
              activePatientCoordinationQuery.data === undefined ? (
                <div className="inbox-handoff__loading" aria-label="Shared coordination loading">
                  <Skeleton height={18} />
                  <Skeleton height={72} />
                  <Skeleton height={120} />
                </div>
              ) : activePatientCoordinationQuery.isError &&
                activePatientCoordination === null ? (
                <>
                  <div className="inbox-handoff__state inbox-handoff__state--error">
                    <p className="inbox-handoff__summary">
                      {toUserMessage(activePatientCoordinationQuery.error)}
                    </p>
                    <p className="inbox-handoff__note">
                      Personal reply drafts stay local to this browser while shared coordination reloads.
                    </p>
                  </div>
                  <div className="inbox-handoff__actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void activePatientCoordinationQuery.refetch();
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <section
                    className="inbox-handoff__snapshot"
                    aria-label="Current shared coordination snapshot"
                  >
                    <div className="inbox-handoff__head">
                      <p className="inbox-handoff__eyebrow">
                        {activePatientCurrentHandoff
                          ? 'Current shared handoff'
                          : 'No current shared handoff'}
                      </p>
                    </div>
                    {activePatientCurrentHandoff?.summary ? (
                      <p className="inbox-handoff__summary">{activePatientCurrentHandoff.summary}</p>
                    ) : (
                      <p className="inbox-handoff__summary">No current shared handoff saved.</p>
                    )}
                    <p className="inbox-handoff__note">
                      {activePatientCurrentHandoff
                        ? 'Read-only here. Use Patient Detail for structured handoff editing.'
                        : latestSharedCoordinationActivity
                          ? 'No current shared handoff is saved. The latest shared activity still stays visible below.'
                          : 'Add the first shared note below if the care team needs patient-scoped context now.'}
                    </p>
                    <dl className="communication-page__handoff-facts">
                      {activePatientCurrentHandoff ? (
                        <>
                          <div>
                            <dt>Next step</dt>
                            <dd>
                              {getClinicianCoordinationNextStepLabel(
                                activePatientCurrentHandoff.nextStep,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Follow-up owner</dt>
                            <dd>
                              {getClinicianCoordinationFollowUpOwnerLabel(
                                activePatientCurrentHandoff.followUpOwner,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Updated by</dt>
                            <dd>{activePatientCurrentHandoff.updatedBy.displayName}</dd>
                          </div>
                          <div>
                            <dt>Updated</dt>
                            <dd>
                              <span
                                title={formatDashboardDateTime(activePatientCurrentHandoff.updatedAt)}
                              >
                                {formatDashboardDateTime(activePatientCurrentHandoff.updatedAt)}
                              </span>
                            </dd>
                          </div>
                        </>
                      ) : null}
                    </dl>
                  </section>

                  <form className="inbox-handoff__note-form" onSubmit={handleAddSharedNote}>
                    <div className="inbox-handoff__form-heading">
                      <div>
                        <p className="inbox-handoff__eyebrow">Shared note</p>
                        <h4 className="inbox-handoff__form-title">
                          Add care-team coordination context
                        </h4>
                      </div>
                      <span className="inbox-handoff__form-side">Shared in Aura</span>
                    </div>
                    <label className="form-field">
                      <span>Add shared coordination note</span>
                      <textarea
                        rows={3}
                        value={sharedNoteDraft}
                        disabled={appendSharedCoordinationNoteMutation.isPending}
                        onChange={(event) => {
                          setSharedNoteDraft(event.target.value);
                          setSharedNoteNotice(null);
                          setSharedNoteError(null);
                        }}
                        placeholder="Add a short shared coordination note for the care team."
                      />
                    </label>
                    {sharedNoteError ? (
                      <p className="inbox-handoff__feedback inbox-handoff__feedback--error" role="alert">
                        {sharedNoteError}
                      </p>
                    ) : null}
                    {sharedNoteNotice ? (
                      <p
                        className="inbox-handoff__feedback inbox-handoff__feedback--success"
                        role="status"
                      >
                        {sharedNoteNotice}
                      </p>
                    ) : null}
                    <div className="inbox-handoff__form-footer">
                      <p className="inbox-handoff__form-note">
                        Adds to shared coordination history in Aura. It does not send a patient message or change your personal reply draft.
                      </p>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={
                          appendSharedCoordinationNoteMutation.isPending ||
                          sharedNoteDraft.trim().length === 0
                        }
                      >
                        {appendSharedCoordinationNoteMutation.isPending
                          ? 'Adding...'
                          : 'Add shared note'}
                      </Button>
                    </div>
                  </form>

                  {recentSharedCoordinationNotes.length > 0 ? (
                    <ClinicianDisclosure
                      title="Recent shared note history"
                      summary={`Showing ${recentSharedCoordinationNotes.length} recent ${
                        recentSharedCoordinationNotes.length === 1 ? 'note' : 'notes'
                      }.`}
                      defaultOpen
                    >
                      <section
                        className="inbox-handoff__notes"
                        aria-label="Recent shared coordination notes"
                      >
                        <div className="inbox-handoff__note-list" role="list">
                          {recentSharedCoordinationNotes.map((note) => (
                            <article
                              key={note.id}
                              className="inbox-handoff__note-item"
                              role="listitem"
                            >
                              <div className="inbox-handoff__note-meta">
                                <div className="inbox-handoff__note-author">
                                  <ClinicianAvatar
                                    identity={{
                                      displayName: note.createdBy.displayName,
                                      initials: getClinicianInitials(
                                        note.createdBy.displayName,
                                        note.createdBy.clinicianId,
                                      ),
                                      photo: null,
                                    }}
                                    decorative
                                    size="sm"
                                  />
                                  <div className="inbox-handoff__note-author-copy">
                                    <strong>{note.createdBy.displayName}</strong>
                                    <span>Shared coordination note</span>
                                  </div>
                                </div>
                                <time
                                  className="inbox-handoff__note-time"
                                  dateTime={note.createdAt}
                                  title={formatDashboardDateTime(note.createdAt)}
                                >
                                  {formatDashboardRelativeTime(note.createdAt)}
                                </time>
                              </div>
                              <p className="inbox-handoff__note-text">{note.text}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    </ClinicianDisclosure>
                  ) : null}
                </>
              )}
            </section>

            <section className="inbox-support-group inbox-support-group--workflow" aria-label="Workflow context">
              <div className="inbox-support-group__copy">
                <p className="inbox-support-group__eyebrow">Workflow context</p>
                <h3 className="inbox-support-group__title">Workflow context</h3>
                <p className="inbox-support__subtext">
                  Read-only workflow references stay visible here without changing your local draft.
                </p>
              </div>

              {!(
                activePatientCoordinationQuery.isLoading &&
                activePatientCoordinationQuery.data === undefined
              ) ? (
                <>
                  <section className="inbox-handoff__activity" aria-label="Linked follow-through task">
                    <div className="inbox-handoff__form-heading">
                      <div>
                        <p className="inbox-handoff__eyebrow">Linked follow-through task</p>
                        <h4 className="inbox-handoff__form-title">Existing workflow object</h4>
                      </div>
                      <span className="inbox-handoff__form-side">
                        {activePatientLinkedTaskId
                          ? activePatientLinkedTask
                            ? 'Linked task on file'
                            : getClinicianCoordinationLinkedTaskUnavailableLabel()
                          : getClinicianCoordinationLinkedTaskEmptyLabel()}
                      </span>
                    </div>
                    {activePatientLinkedTaskId ? (
                      activePatientLinkedTask ? (
                        <article className="inbox-handoff__note-item inbox-handoff__note-item--activity">
                          <div className="inbox-handoff__note-meta">
                            <div className="inbox-handoff__note-author-copy">
                              <strong>{activePatientLinkedTask.title}</strong>
                              <span>
                                Existing follow-through task reference only. Shared coordination does not create or complete this task.
                              </span>
                            </div>
                            <div className="inbox-handoff__activity-meta">
                              <span className="inbox-handoff__note-time">
                                {getClinicianCoordinationLinkedTaskStatusLabel(
                                  activePatientLinkedTask.status,
                                )}
                              </span>
                              <span
                                className="inbox-handoff__note-time"
                                title={formatDashboardDateTime(
                                  activePatientLinkedTask.dueAt ?? activePatientLinkedTask.updatedAt,
                                )}
                              >
                                {activePatientLinkedTask.dueAt
                                  ? `Due ${formatDashboardRelativeTime(activePatientLinkedTask.dueAt)}`
                                  : `Updated ${formatDashboardRelativeTime(
                                      activePatientLinkedTask.updatedAt,
                                    )}`}
                              </span>
                            </div>
                          </div>
                          <dl className="communication-page__handoff-facts">
                            <div>
                              <dt>Status</dt>
                              <dd>
                                {getClinicianCoordinationLinkedTaskStatusLabel(
                                  activePatientLinkedTask.status,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Priority</dt>
                              <dd>
                                {getClinicianCoordinationLinkedTaskStatusLabel(
                                  activePatientLinkedTask.priority,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Assignee</dt>
                              <dd>
                                {getClinicianCoordinationLinkedTaskAssigneeLabel(
                                  activePatientLinkedTask.assignedTo,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Due</dt>
                              <dd>
                                {activePatientLinkedTask.dueAt
                                  ? formatDashboardDateTime(activePatientLinkedTask.dueAt)
                                  : 'Not set'}
                              </dd>
                            </div>
                            {getClinicianCoordinationLinkedTaskSourceLabel(activePatientLinkedTask) ? (
                              <div>
                                <dt>Source</dt>
                                <dd>
                                  {getClinicianCoordinationLinkedTaskSourceLabel(
                                    activePatientLinkedTask,
                                  )}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </article>
                      ) : (
                        <div className="inbox-handoff__empty-state">
                          <p className="inbox-handoff__summary">
                            {getClinicianCoordinationLinkedTaskUnavailableLabel()}
                          </p>
                          <p className="inbox-handoff__note">
                            This handoff still points to a task id, but Aura cannot resolve that task right now.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="inbox-handoff__empty-state">
                        <p className="inbox-handoff__summary">
                          {getClinicianCoordinationLinkedTaskEmptyLabel()}
                        </p>
                        <p className="inbox-handoff__note">
                          If the care team needs an explicit workflow reference, link one from Patient Detail.
                        </p>
                      </div>
                    )}
                  </section>

                  <section
                    className="inbox-handoff__activity"
                    aria-label="Latest shared coordination activity"
                  >
                    <div className="inbox-handoff__form-heading">
                      <div>
                        <p className="inbox-handoff__eyebrow">Latest shared activity</p>
                        <h4 className="inbox-handoff__form-title">Most recent team-visible update</h4>
                      </div>
                      <span className="inbox-handoff__form-side">
                        {latestSharedCoordinationActivity
                          ? latestSharedCoordinationActivity.label
                          : 'No shared activity yet'}
                      </span>
                    </div>
                    {latestSharedCoordinationActivity ? (
                      <article className="inbox-handoff__note-item inbox-handoff__note-item--activity">
                        <div className="inbox-handoff__note-meta">
                          <div className="inbox-handoff__note-author">
                            <ClinicianAvatar
                              identity={{
                                displayName: latestSharedCoordinationActivity.author.displayName,
                                initials: getClinicianInitials(
                                  latestSharedCoordinationActivity.author.displayName,
                                  latestSharedCoordinationActivity.author.clinicianId,
                                ),
                                photo: null,
                              }}
                              decorative
                              size="sm"
                            />
                            <div className="inbox-handoff__note-author-copy">
                              <strong>{latestSharedCoordinationActivity.author.displayName}</strong>
                              <span>{latestSharedCoordinationActivity.label}</span>
                            </div>
                          </div>
                          <div className="inbox-handoff__activity-meta">
                            <time
                              className="inbox-handoff__note-time"
                              dateTime={latestSharedCoordinationActivity.timestamp}
                              title={formatDashboardDateTime(latestSharedCoordinationActivity.timestamp)}
                            >
                              {formatDashboardDateTime(latestSharedCoordinationActivity.timestamp)}
                            </time>
                            <span className="inbox-handoff__note-time">
                              {latestSharedCoordinationActivity.kind === 'handoff' ? 'Updated' : 'Added'}{' '}
                              {formatDashboardRelativeTime(latestSharedCoordinationActivity.timestamp)}
                            </span>
                          </div>
                        </div>
                        <p className="inbox-handoff__note-text">
                          {truncateText(
                            latestSharedCoordinationActivity.text || 'No summary saved.',
                            180,
                          ).text}
                        </p>
                      </article>
                    ) : (
                      <div className="inbox-handoff__empty-state">
                        <p className="inbox-handoff__summary">No shared activity yet.</p>
                        <p className="inbox-handoff__note">
                          Shared activity appears here after the care team saves a handoff or appends a note.
                        </p>
                      </div>
                    )}
                  </section>
                </>
              ) : null}
            </section>

            <section
              className="inbox-support-group inbox-support-group--reference"
              aria-label="Reference and help context"
            >
              <div className="inbox-support-group__copy">
                <p className="inbox-support-group__eyebrow">Reference / help</p>
                <h3 className="inbox-support-group__title">Reference / help context</h3>
                <p className="inbox-support__text">
                  This timeline is limited to patient communication plus local clinician replies saved in this browser.
                </p>
                <p className="inbox-support__subtext">
                  Shared coordination below is team-visible Aura context and never appears as a message bubble or sent history in this timeline.
                </p>
              </div>
            </section>
          </aside>
        ) : null}
      </section>
    </Stack>
  );
}
