import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { usePatientHandoff } from '../hooks/usePatientHandoff';
import { getSavedCommunicationFilter } from '../services/clinicianWorkspacePreferences';
import { useDashboardCommunicationOverview } from '../services/clinicianApi';
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
  getLatestPatientHandoffNote,
  getPatientHandoffFollowUpOwnerLabel,
  getPatientHandoffNextActionLabel,
  type PatientHandoffNextAction,
} from '../services/patientHandoffWorkspace';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../utils/dashboard';
import { toUserMessage } from '../utils/errors';
import { truncateText } from '../utils/text';

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
  if (thread.latestEventKind === 'clinician-reply') {
    return 'Latest local clinician reply';
  }

  if (thread.needsResponse) {
    return 'Latest patient message waiting on clinician follow-up';
  }

  if (thread.unread) {
    return 'Latest patient message not yet reviewed in this browser';
  }

  return 'Latest patient message';
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

function getCommunicationThreadTone(thread: CommunicationThread): 'safety' | 'response' | 'follow-up' | 'unread' | 'reviewed' {
  if (thread.safetyFlagged) {
    return 'safety';
  }

  if (thread.needsResponse) {
    return 'response';
  }

  if (thread.followUpRequested) {
    return 'follow-up';
  }

  if (thread.unread) {
    return 'unread';
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
  const filteredThreads = useMemo(
    () => filterCommunicationThreads(allThreads, currentView),
    [allThreads, currentView],
  );
  const currentViewLabel = useMemo(
    () =>
      COMMUNICATION_THREAD_VIEW_OPTIONS.find((option) => option.id === currentView)?.label ?? 'All',
    [currentView],
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
  const activePatientHandoff = usePatientHandoff(
    activeThread?.validPatientId ? activeThread.patientId : null,
  );
  const latestPatientHandoffNote = useMemo(
    () => getLatestPatientHandoffNote(activePatientHandoff),
    [activePatientHandoff],
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

  const selectedTemplate = useMemo(
    () =>
      communicationAuthoring.templates.find((template) => template.id === selectedTemplateId) ?? null,
    [communicationAuthoring.templates, selectedTemplateId],
  );

  function handleOpenHandoffNextAction(action: PatientHandoffNextAction): void {
    if (!activeThread?.validPatientId || !action) {
      return;
    }

    if (action === 'alerts') {
      navigate(`/alerts?patientId=${encodeURIComponent(activeThread.patientId)}`);
      return;
    }

    if (action === 'appointments') {
      navigate('/appointments');
      return;
    }

    if (action === 'plan') {
      navigate(`/patients/${encodeURIComponent(activeThread.patientId)}/plan`);
    }
  }

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

  const activeThreadMissingFromView = Boolean(selectedThread && !activeThread);
  const hasThreads = allThreads.length > 0;
  const hasVisibleThreads = visibleThreads.length > 0;
  const reduceCommunicationAttention =
    notificationPreferences.effectiveCommunicationCueMode === 'reduced';
  const activeThreadTone = activeThread ? getCommunicationThreadTone(activeThread) : null;
  const communicationSummary = useMemo(
    () => ({
      inReview: allThreads.length,
      needsResponse: allThreads.filter((thread) => thread.needsResponse).length,
      safetyFlagged: allThreads.filter((thread) => thread.safetyFlagged).length,
      followUpRequested: allThreads.filter((thread) => thread.followUpRequested).length,
      unread: allThreads.filter((thread) => thread.unread).length,
    }),
    [allThreads],
  );
  const inboxComposition = useMemo(() => {
    const buckets = {
      safety: 0,
      response: 0,
      followUp: 0,
      unread: 0,
      reviewed: 0,
    };

    for (const thread of allThreads) {
      const tone = getCommunicationThreadTone(thread);

      if (tone === 'safety') {
        buckets.safety += 1;
        continue;
      }

      if (tone === 'response') {
        buckets.response += 1;
        continue;
      }

      if (tone === 'follow-up') {
        buckets.followUp += 1;
        continue;
      }

      if (tone === 'unread') {
        buckets.unread += 1;
        continue;
      }

      buckets.reviewed += 1;
    }

    return [
      { key: 'safety', label: 'Safety flagged', value: buckets.safety },
      { key: 'response', label: 'Needs response', value: buckets.response },
      { key: 'follow-up', label: 'Follow-up requested', value: buckets.followUp },
      { key: 'unread', label: 'Unread', value: buckets.unread },
      { key: 'reviewed', label: 'In review', value: buckets.reviewed },
    ];
  }, [allThreads]);
  const communicationGuidance =
    communicationSummary.safetyFlagged > 0
      ? 'Safety-sensitive threads still require clinician review.'
      : communicationSummary.needsResponse > 0
        ? 'Response-needed follow-up still leads the inbox.'
        : communicationSummary.followUpRequested > 0
          ? 'Follow-up requested threads still need a clinician pass.'
          : communicationSummary.unread > 0
            ? 'Unread threads still need first review in this browser.'
            : hasThreads
              ? 'Current inbox review is clear in this browser.'
              : 'No patient communication is waiting in this workspace.';

  return (
    <Stack className="page-stack dashboard-page-shell dashboard-page-shell--communication communication-page communication-page--inbox" gap="5">
      <Section
        className="dashboard-page-header dashboard-page-header--communication communication-page__header"
        eyebrow="Clinician follow-up"
        title="Inbox"
        subtitle="Review patient-linked communication, keep safety context close, and reply with browser-local continuity."
        actions={
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
        }
      />

      <section className="inbox-brief" aria-label="Communication inbox summary">
        <div className="inbox-brief__lead">
          <p className="inbox-brief__eyebrow">Inbox summary</p>
          <h2 className="inbox-brief__title">Clinical communication review</h2>
          <p className="inbox-brief__copy">{communicationGuidance}</p>
        </div>

        <div className="inbox-brief__stats" role="list" aria-label="Inbox counts">
          <article className="inbox-brief__stat" role="listitem">
            <p className="inbox-brief__stat-label">In review</p>
            <p className="inbox-brief__stat-value">{communicationSummary.inReview}</p>
            <p className="inbox-brief__stat-detail">{currentViewLabel} view</p>
          </article>
          <article
            className={`inbox-brief__stat inbox-brief__stat--response${
              reduceCommunicationAttention ? '' : ' communication-page__status-card--response-hot'
            }`}
            data-testid="communication-needs-response-pill"
            role="listitem"
          >
            <p className="inbox-brief__stat-label">Needs response</p>
            <p className="inbox-brief__stat-value">{communicationSummary.needsResponse}</p>
            <p className="inbox-brief__stat-detail">Clinician follow-up is still waiting</p>
          </article>
          <article className="inbox-brief__stat inbox-brief__stat--safety" role="listitem">
            <p className="inbox-brief__stat-label">Safety flagged</p>
            <p className="inbox-brief__stat-value">{communicationSummary.safetyFlagged}</p>
            <p className="inbox-brief__stat-detail">Escalation-sensitive threads in view</p>
          </article>
          <article className="inbox-brief__stat inbox-brief__stat--composition" role="listitem">
            <p className="inbox-brief__stat-label">Current mix</p>
            <div className="inbox-brief__composition" role="list">
              {inboxComposition.slice(0, 3).map((segment) => (
                <span
                  key={segment.key}
                  className={`inbox-brief__composition-item inbox-brief__composition-item--${segment.key}`}
                  role="listitem"
                >
                  {segment.label}: {segment.value}
                </span>
              ))}
            </div>
          </article>
        </div>
      </section>

      <div className="inbox-shell">
        <aside className="inbox-thread-panel" aria-label="Communication queue">
          <header className="inbox-panel__header">
            <div className="inbox-panel__copy">
              <p className="inbox-panel__eyebrow">Thread list</p>
              <h2 className="inbox-panel__title">Communication queue</h2>
              <p className="inbox-panel__note">Patient-linked threads ready for clinician review.</p>
            </div>
          </header>

          <div className="communication-page__filters inbox-thread-panel__filters" role="group" aria-label="Communication filters">
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

          {communicationQuery.isLoading && !hasThreads ? (
            <div className="communication-page__thread-skeletons" aria-label="Communication queue loading placeholder">
              <Skeleton height={92} />
              <Skeleton height={92} />
              <Skeleton height={92} />
            </div>
          ) : communicationQuery.error && !hasThreads ? (
            <div className="communication-page__inline-state" role="status">
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
            <EmptyState
              title="No communication waiting"
              description="Patient communication needing clinician review will appear here."
              tone="success"
            />
          ) : !hasVisibleThreads ? (
            <EmptyState
              title="No threads match this view"
              description="Choose another filter to return to the current communication queue."
              tone="warning"
            />
          ) : (
            <div className="communication-page__thread-list" role="list" aria-label="Communication threads">
              {visibleThreads.map((thread) => {
                const isSelected = thread.id === activeThread?.id;
                const threadTone = getCommunicationThreadTone(thread);
                const dominantBadges = [
                  isSelected ? 'Current review' : null,
                  thread.safetyFlagged ? 'Safety flagged' : null,
                  thread.needsResponse ? 'Needs response' : null,
                  thread.unread ? 'Unread' : null,
                  !thread.safetyFlagged && !thread.needsResponse && !thread.unread && thread.followUpRequested
                    ? 'Follow-up requested'
                    : null,
                ].filter(Boolean) as string[];

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
                      <div className="communication-page__thread-identity">
                        <span className="communication-page__thread-avatar" aria-hidden="true">
                          {getPatientInitials(thread.patientName)}
                        </span>
                        <div className="communication-page__thread-identity-copy">
                          <div className="communication-page__thread-item-top">
                            <strong className="communication-page__thread-name">{thread.patientName}</strong>
                            <span
                              className="communication-page__thread-time"
                              title={formatDashboardDateTime(thread.latestEventAt)}
                            >
                              {formatDashboardRelativeTime(thread.latestEventAt)}
                            </span>
                          </div>
                          {thread.validPatientId ? (
                            <span className="communication-page__thread-id">ID: {thread.patientId}</span>
                          ) : null}
                        </div>
                      </div>
                      <p className="communication-page__thread-preview">{thread.latestEventPreview}</p>
                      <div className="communication-page__thread-meta">
                        <span className="communication-page__thread-meta-note">{getThreadMetaSummary(thread)}</span>
                        <div className="communication-page__thread-badges">
                          {dominantBadges.map((label) => (
                            <Badge
                              key={label}
                              variant={
                                label === 'Safety flagged'
                                  ? 'danger'
                                  : label === 'Needs response'
                                    ? 'warning'
                                    : label === 'Unread'
                                      ? 'new'
                                      : label === 'Follow-up requested'
                                        ? 'neutral'
                                        : 'default'
                              }
                            >
                              {label}
                            </Badge>
                          ))}
                          {thread.handled && dominantBadges.length === 0 ? (
                            <Badge variant="success">Handled</Badge>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </aside>

        <section
          className={`inbox-reading-pane${
            activeThreadTone ? ` inbox-reading-pane--${activeThreadTone}` : ''
          }`}
          aria-label="Active communication review"
        >
          {communicationQuery.isLoading && !hasThreads ? (
            <div className="communication-page__timeline-skeletons" aria-label="Communication timeline loading placeholder">
              <Skeleton height={88} />
              <Skeleton height={88} />
            </div>
          ) : activeThread ? (
            <div className="communication-page__timeline-body">
              <header className="inbox-reading-pane__header">
                <div className="inbox-reading-pane__anchor">
                  <span className="inbox-reading-pane__avatar" aria-hidden="true">
                    {getPatientInitials(activeThread.patientName)}
                  </span>
                  <div className="inbox-reading-pane__copy">
                    <p className="inbox-panel__eyebrow">Active thread</p>
                    <h2 className="inbox-reading-pane__title">{activeThread.patientName}</h2>
                    <p className="inbox-reading-pane__subtitle">
                      {activeThread.validPatientId ? `ID: ${activeThread.patientId} · ` : ''}
                      {getThreadMetaSummary(activeThread)}
                    </p>
                  </div>
                </div>
                <div className="inbox-reading-pane__header-side">
                  <div className="inbox-reading-pane__summary-pills">
                    <span className="inbox-reading-pane__summary-pill">{currentViewLabel} view</span>
                    <span
                      className="inbox-reading-pane__summary-pill"
                      title={formatDashboardDateTime(activeThread.latestEventAt)}
                    >
                      Updated {formatDashboardRelativeTime(activeThread.latestEventAt)}
                    </span>
                  </div>
                  {activeThread.validPatientId ? (
                    <div className="communication-page__timeline-actions inbox-reading-pane__actions">
                      {activeThread.safetyFlagged ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/alerts?patientId=${encodeURIComponent(activeThread.patientId)}&source=chat`,
                            )
                          }
                        >
                          Open alerts
                        </Button>
                      ) : null}
                      <Button
                        variant={activeThread.safetyFlagged ? 'ghost' : 'secondary'}
                        size="sm"
                        onClick={() => navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)}
                      >
                        Open patient
                      </Button>
                    </div>
                  ) : null}
                </div>
              </header>

              <section className="inbox-reading-pane__context">
                <div
                  className={`inbox-context-summary${
                    activeThreadTone ? ` inbox-context-summary--${activeThreadTone}` : ''
                  }`}
                >
                  <div className="inbox-context-summary__copy">
                    <p className="inbox-panel__eyebrow">Thread state</p>
                    <p className="inbox-context-summary__text">
                      This timeline shows communication currently surfaced in the dashboard plus clinician replies stored locally in this browser.
                    </p>
                    <p className="inbox-context-summary__note">
                      Earlier patient message history may not be available in this foundation workspace.
                    </p>
                  </div>
                  <div className="communication-page__timeline-badges inbox-context-summary__badges">
                    {activeThread.safetyFlagged ? <Badge variant="danger">Safety flagged</Badge> : null}
                    {activeThread.needsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                    {activeThread.unread ? <Badge variant="new">Unread</Badge> : null}
                    {activeThread.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                  </div>
                </div>

                {activePatientHandoff ? (
                  <section
                    className="inbox-handoff"
                    aria-label="Internal handoff context"
                    data-testid="communication-handoff-context"
                  >
                    <div className="inbox-handoff__copy">
                      <div className="inbox-handoff__head">
                        <Badge variant="neutral">Internal handoff</Badge>
                      </div>
                      {activePatientHandoff.currentHandoff?.summary ? (
                        <p className="inbox-handoff__summary">{activePatientHandoff.currentHandoff.summary}</p>
                      ) : latestPatientHandoffNote ? (
                        <p className="inbox-handoff__summary">
                          {truncateText(latestPatientHandoffNote.text, 180).text}
                        </p>
                      ) : null}
                      <dl className="communication-page__handoff-facts">
                        {activePatientHandoff.currentHandoff ? (
                          <>
                            <div>
                              <dt>Next step</dt>
                              <dd>{getPatientHandoffNextActionLabel(activePatientHandoff.currentHandoff.nextAction)}</dd>
                            </div>
                            <div>
                              <dt>Follow-up owner</dt>
                              <dd>
                                {getPatientHandoffFollowUpOwnerLabel(
                                  activePatientHandoff.currentHandoff.followUpOwner,
                                )}
                              </dd>
                            </div>
                          </>
                        ) : null}
                        <div>
                          <dt>{activePatientHandoff.currentHandoff ? 'Updated by' : 'Latest note by'}</dt>
                          <dd>
                            {activePatientHandoff.currentHandoff
                              ? activePatientHandoff.currentHandoff.updatedBy.authorDisplayName
                              : latestPatientHandoffNote?.createdBy.authorDisplayName ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>{activePatientHandoff.currentHandoff ? 'Updated' : 'Latest note'}</dt>
                          <dd>
                            <span
                              title={formatDashboardDateTime(
                                activePatientHandoff.currentHandoff?.updatedAt ??
                                  latestPatientHandoffNote?.createdAt ??
                                  '',
                              )}
                            >
                              {formatDashboardRelativeTime(
                                activePatientHandoff.currentHandoff?.updatedAt ??
                                  latestPatientHandoffNote?.createdAt ??
                                  new Date(0).toISOString(),
                              )}
                            </span>
                          </dd>
                        </div>
                      </dl>
                      <p className="inbox-handoff__note">
                        Stored only in this browser for local patient handoff continuity.
                      </p>
                    </div>
                    {activePatientHandoff.currentHandoff?.nextAction &&
                    (activePatientHandoff.currentHandoff.nextAction === 'alerts' ||
                      activePatientHandoff.currentHandoff.nextAction === 'appointments' ||
                      activePatientHandoff.currentHandoff.nextAction === 'plan') ? (
                      <div className="inbox-handoff__actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleOpenHandoffNextAction(activePatientHandoff.currentHandoff!.nextAction)
                          }
                        >
                          {getPatientHandoffNextActionLabel(activePatientHandoff.currentHandoff.nextAction)}
                        </Button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </section>

              <section className="inbox-reading-pane__stream">
                <div className="communication-page__timeline-list" role="list" aria-label="Patient communication timeline">
                  {activeThread.timeline.map((event) => {
                    const eventTypeBadge = getEventTypeBadge(event);

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
                            <span
                              className="communication-page__timeline-event-time"
                              title={formatDashboardDateTime(event.occurredAt)}
                            >
                              {formatDashboardRelativeTime(event.occurredAt)}
                            </span>
                          </div>
                          <div className="communication-page__timeline-event-badges">
                            <Badge variant={eventTypeBadge.variant}>{eventTypeBadge.label}</Badge>
                            {event.flaggedBySafety ? <Badge variant="danger">Safety flagged</Badge> : null}
                            {event.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                            {event.localOnly ? <Badge variant="default">Local</Badge> : null}
                          </div>
                        </div>
                        <p className="communication-page__timeline-event-preview">{event.preview}</p>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="inbox-composer">
                <div className="inbox-composer__header">
                  <div>
                    <p className="inbox-panel__eyebrow">Compose console</p>
                    <h3 className="inbox-composer__title">Clinician reply</h3>
                  </div>
                </div>
                <div className="communication-page__composer">
                  <div className="communication-authoring-tools" role="group" aria-label="Reply helpers">
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
                  <p className="communication-page__composer-truth">
                    Replies are stored only in this browser for the current clinician during this foundation pass.
                  </p>
                  <div className="communication-page__composer-identity" aria-label="Local clinician identity">
                    <span className="communication-page__composer-identity-label">Local clinician identity</span>
                    <div className="communication-page__composer-identity-card">
                      <ClinicianAvatar identity={clinicianIdentity} decorative size="sm" />
                      <div className="communication-page__composer-identity-copy">
                        <strong>{clinicianIdentity.displayName}</strong>
                        {clinicianIdentity.secondaryLine ? <span>{clinicianIdentity.secondaryLine}</span> : null}
                      </div>
                    </div>
                  </div>
                  <label className="form-field communication-page__composer-field">
                    <span>Clinician reply</span>
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
            </div>
          ) : activeThreadMissingFromView ? (
            <EmptyState
              title="Selected thread is outside this view"
              description="Choose a thread from the filtered list to continue communication review."
              tone="warning"
            />
          ) : hasThreads ? (
            <EmptyState
              title="Select a patient thread"
              description="Open a communication thread from the list to review the current patient timeline."
              tone="neutral"
            />
          ) : (
            <EmptyState
              title="No communication timeline available"
              description="Patient communication will appear here when the dashboard has message review context to show."
              tone="neutral"
            />
          )}
        </section>
      </div>
    </Stack>
  );
}
