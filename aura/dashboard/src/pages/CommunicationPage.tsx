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
import { getSavedCommunicationFilter } from '../services/clinicianWorkspacePreferences';
import {
  useDashboardCommunicationOverview,
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
  getClinicianCoordinationFollowUpOwnerLabel,
  getClinicianCoordinationNextStepLabel,
  getLatestClinicianCoordinationNote,
} from '../utils/clinicianCoordination';
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
    return 'Local clinician reply is the latest activity';
  }

  if (thread.needsResponse) {
    return 'Waiting on clinician follow-up';
  }

  if (thread.unread) {
    return 'Not yet reviewed in this browser';
  }

  if (thread.followUpRequested) {
    return 'Follow-up requested in recent patient messaging';
  }

  return 'Recent patient message in review';
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getThreadPriorityBadge(thread: CommunicationThread): {
  label: string;
  variant: 'danger' | 'warning' | 'new' | 'neutral';
} | null {
  if (thread.safetyFlagged) {
    return { label: 'Safety flagged', variant: 'danger' };
  }

  if (thread.needsResponse) {
    return { label: 'Needs response', variant: 'warning' };
  }

  if (thread.unread) {
    return { label: 'Unread', variant: 'new' };
  }

  if (thread.followUpRequested) {
    return { label: 'Follow-up requested', variant: 'neutral' };
  }

  return null;
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
  const activePatientId = activeThread?.validPatientId ? activeThread.patientId : null;
  const activePatientCoordinationQuery = usePatientCoordination(activePatientId);
  const activePatientCoordination = activePatientCoordinationQuery.data ?? null;
  const latestPatientCoordinationNote = useMemo(
    () => getLatestClinicianCoordinationNote(activePatientCoordination),
    [activePatientCoordination],
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
      total: allThreads.length,
      needsResponse: allThreads.filter((thread) => thread.needsResponse).length,
      safetyFlagged: allThreads.filter((thread) => thread.safetyFlagged).length,
      followUpRequested: allThreads.filter((thread) => thread.followUpRequested).length,
      unread: allThreads.filter((thread) => thread.unread).length,
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
      : communicationSummary.needsResponse > 0
        ? `${formatCountLabel(
            communicationSummary.needsResponse,
            'thread needs',
            'threads need',
          )} clinician follow-up now.`
        : communicationSummary.followUpRequested > 0
          ? `${formatCountLabel(
              communicationSummary.followUpRequested,
              'thread has',
              'threads have',
            )} follow-up requested.`
          : communicationSummary.unread > 0
            ? `${formatCountLabel(
                communicationSummary.unread,
                'thread is',
                'threads are',
              )} still unread in this browser.`
            : hasThreads
              ? `${formatCountLabel(
                  communicationSummary.total,
                  'thread is',
                  'threads are',
                )} currently in review.`
              : 'No patient communication is waiting in this workspace.';

  return (
    <Stack className="page-stack dashboard-page-shell dashboard-page-shell--communication communication-page communication-page--inbox" gap="5">
      <Section
        className="dashboard-page-header dashboard-page-header--communication communication-page__header"
        eyebrow="Clinician follow-up"
        title="Inbox"
        subtitle="Review patient communication that needs clinician follow-up, keep local drafts separate, and reference shared coordination."
      />

      <section className="inbox-triage-bar" aria-label="Inbox controls">
        <div className="inbox-triage-bar__summary">
          <div className="inbox-triage-bar__cues" role="list" aria-label="Inbox communication pressure">
            <span
              className={`inbox-triage-bar__cue inbox-triage-bar__cue--response${
                reduceCommunicationAttention ? '' : ' communication-page__status-card--response-hot'
              }`}
              data-testid="communication-needs-response-pill"
              role="listitem"
            >
              Needs response {communicationSummary.needsResponse}
            </span>
            {communicationSummary.safetyFlagged > 0 ? (
              <span className="inbox-triage-bar__cue inbox-triage-bar__cue--safety" role="listitem">
                Safety flagged {communicationSummary.safetyFlagged}
              </span>
            ) : null}
          </div>
          <p className="inbox-triage-bar__note">{communicationGuidance}</p>
        </div>

        <div className="inbox-triage-bar__actions">
          <div className="communication-page__filters inbox-triage-bar__filters" role="group" aria-label="Communication filters">
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

      <section className="inbox-workspace" aria-label="Inbox response workspace">
        <aside className="inbox-thread-rail" aria-label="Communication queue">
          <header className="inbox-thread-rail__header">
            <div className="inbox-panel__copy">
              <h2 className="inbox-panel__title">Communication queue</h2>
              <p className="inbox-panel__note">Select the next patient thread that needs follow-through.</p>
            </div>
          </header>

          {communicationQuery.isLoading && !hasThreads ? (
            <div className="communication-page__thread-skeletons inbox-thread-rail__state" aria-label="Communication queue loading placeholder">
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
            <div className="communication-page__thread-list inbox-thread-rail__list" role="list" aria-label="Communication threads">
              {visibleThreads.map((thread) => {
                const isSelected = thread.id === activeThread?.id;
                const threadTone = getCommunicationThreadTone(thread);
                const primaryBadge = getThreadPriorityBadge(thread);

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
                              {primaryBadge ? <Badge variant={primaryBadge.variant}>{primaryBadge.label}</Badge> : null}
                            </div>
                            <span
                              className="communication-page__thread-time"
                              title={formatDashboardDateTime(thread.latestEventAt)}
                            >
                              {formatDashboardRelativeTime(thread.latestEventAt)}
                            </span>
                          </div>
                          <div className="inbox-thread-item__meta-line">
                            <span className="communication-page__thread-meta-note">{getThreadMetaSummary(thread)}</span>
                            {thread.validPatientId ? (
                              <span className="communication-page__thread-id">ID: {thread.patientId}</span>
                            ) : null}
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
            <div className="communication-page__timeline-skeletons inbox-response-stage__state" aria-label="Communication timeline loading placeholder">
              <Skeleton height={88} />
              <Skeleton height={88} />
            </div>
          ) : activeThread ? (
            <div className="communication-page__timeline-body inbox-response-stage__body">
              <header className="inbox-response-stage__header">
                <div className="inbox-response-stage__anchor">
                  <span className="inbox-response-stage__avatar" aria-hidden="true">
                    {getPatientInitials(activeThread.patientName)}
                  </span>
                  <div className="inbox-response-stage__copy">
                    <h2 className="inbox-reading-pane__title">{activeThread.patientName}</h2>
                    <p className="inbox-response-stage__subtitle">{getThreadMetaSummary(activeThread)}</p>
                    <div className="inbox-response-stage__meta">
                      {activeThread.validPatientId ? (
                        <span className="communication-page__thread-id">ID: {activeThread.patientId}</span>
                      ) : null}
                      <span
                        className="inbox-response-stage__updated"
                        title={formatDashboardDateTime(activeThread.latestEventAt)}
                      >
                        Updated {formatDashboardRelativeTime(activeThread.latestEventAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="inbox-response-stage__header-side">
                  <div className="communication-page__timeline-badges inbox-response-stage__badges">
                    {activeThread.safetyFlagged ? <Badge variant="danger">Safety flagged</Badge> : null}
                    {activeThread.needsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                    {activeThread.unread ? <Badge variant="new">Unread</Badge> : null}
                    {activeThread.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                  </div>
                  {activeThread.validPatientId ? (
                    <div className="communication-page__timeline-actions inbox-response-stage__actions">
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

              <section className="inbox-response-stage__stream">
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
                <h3 className="inbox-composer__title">Clinician reply</h3>
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

                  <div className="inbox-composer__truth-strip">
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
                    <p className="communication-page__composer-truth">
                      Replies are stored only in this browser for the current clinician during this foundation pass.
                    </p>
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

              <section className="inbox-support" aria-label="Communication support context">
                <div className="inbox-support__note">
                  <p className="inbox-support__text">
                    This timeline shows communication currently surfaced in the dashboard plus clinician replies stored locally in this browser.
                  </p>
                  <p className="inbox-support__subtext">
                    Shared coordination appears below and is saved in Aura for the care team.
                  </p>
                </div>

                {activeThread?.validPatientId ? (
                  <section
                    className="inbox-handoff"
                    aria-label="Shared clinician coordination"
                    data-testid="communication-shared-coordination"
                  >
                    {activePatientCoordinationQuery.isLoading &&
                    activePatientCoordinationQuery.data === undefined ? (
                      <div className="inbox-handoff__copy">
                        <div className="inbox-handoff__head">
                          <Badge variant="neutral">Shared coordination</Badge>
                        </div>
                        <Skeleton height={18} />
                        <Skeleton height={18} />
                      </div>
                    ) : activePatientCoordinationQuery.isError &&
                      activePatientCoordination === null ? (
                      <>
                        <div className="inbox-handoff__copy">
                          <div className="inbox-handoff__head">
                            <Badge variant="warning">Shared coordination unavailable</Badge>
                          </div>
                          <p className="inbox-handoff__summary">
                            {toUserMessage(activePatientCoordinationQuery.error)}
                          </p>
                          <p className="inbox-handoff__note">
                            Local reply drafts are unaffected and stay in this browser.
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)}
                          >
                            Open patient
                          </Button>
                        </div>
                      </>
                    ) : activePatientCoordination ? (
                      <>
                        <div className="inbox-handoff__copy">
                          <div className="inbox-handoff__head">
                            <Badge variant="neutral">Shared coordination</Badge>
                          </div>
                          {activePatientCoordination.currentHandoff?.summary ? (
                            <p className="inbox-handoff__summary">
                              {activePatientCoordination.currentHandoff.summary}
                            </p>
                          ) : latestPatientCoordinationNote ? (
                            <p className="inbox-handoff__summary">
                              {truncateText(latestPatientCoordinationNote.text, 180).text}
                            </p>
                          ) : null}
                          <dl className="communication-page__handoff-facts">
                            {activePatientCoordination.currentHandoff ? (
                              <>
                                <div>
                                  <dt>Next step</dt>
                                  <dd>
                                    {getClinicianCoordinationNextStepLabel(
                                      activePatientCoordination.currentHandoff.nextStep,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Follow-up owner</dt>
                                  <dd>
                                    {getClinicianCoordinationFollowUpOwnerLabel(
                                      activePatientCoordination.currentHandoff.followUpOwner,
                                    )}
                                  </dd>
                                </div>
                              </>
                            ) : null}
                            <div>
                              <dt>
                                {activePatientCoordination.currentHandoff ? 'Updated by' : 'Latest note by'}
                              </dt>
                              <dd>
                                {activePatientCoordination.currentHandoff
                                  ? activePatientCoordination.currentHandoff.updatedBy.displayName
                                  : latestPatientCoordinationNote?.createdBy.displayName ?? '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>{activePatientCoordination.currentHandoff ? 'Updated' : 'Latest note'}</dt>
                              <dd>
                                <span
                                  title={formatDashboardDateTime(
                                    activePatientCoordination.currentHandoff?.updatedAt ??
                                      latestPatientCoordinationNote?.createdAt ??
                                      '',
                                  )}
                                >
                                  {formatDashboardRelativeTime(
                                    activePatientCoordination.currentHandoff?.updatedAt ??
                                      latestPatientCoordinationNote?.createdAt ??
                                      new Date(0).toISOString(),
                                  )}
                                </span>
                              </dd>
                            </div>
                          </dl>
                          <p className="inbox-handoff__note">
                            Shared with the care team in Aura. Local reply drafts remain separate.
                          </p>
                        </div>
                        <div className="inbox-handoff__actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)}
                          >
                            Open patient
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="inbox-handoff__copy">
                          <div className="inbox-handoff__head">
                            <Badge variant="neutral">Shared coordination</Badge>
                          </div>
                          <p className="inbox-handoff__summary">No shared coordination yet.</p>
                          <p className="inbox-handoff__note">
                            Save shared coordination in Patient Detail when the care team needs context.
                          </p>
                        </div>
                        <div className="inbox-handoff__actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)}
                          >
                            Open patient
                          </Button>
                        </div>
                      </>
                    )}
                  </section>
                ) : null}
              </section>
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
      </section>
    </Stack>
  );
}
