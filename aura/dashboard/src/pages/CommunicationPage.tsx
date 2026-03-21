import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ClinicianAvatar } from '../components/ui/ClinicianAvatar';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useClinicianIdentity } from '../hooks/useClinicianIdentity';
import { getSavedCommunicationFilter } from '../services/clinicianWorkspacePreferences';
import { useDashboardCommunicationOverview } from '../services/clinicianApi';
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
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../utils/dashboard';
import { toUserMessage } from '../utils/errors';

function normalizePatientId(value: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countThreadsByView(
  threads: CommunicationThread[],
  view: CommunicationThreadView,
): number {
  return filterCommunicationThreads(threads, view).length;
}

export function CommunicationPage(): JSX.Element {
  const navigate = useNavigate();
  const clinicianIdentity = useClinicianIdentity();
  const communicationScopeKey = clinicianIdentity.authScopeId ?? clinicianIdentity.clinicianId;
  const [searchParams, setSearchParams] = useSearchParams();
  const [localState, setLocalState] = useState(() => readCommunicationWorkspaceLocalState(communicationScopeKey));
  const [draftReply, setDraftReply] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadView, setSelectedThreadView] = useState<CommunicationThreadView | null>(null);
  const hasInitializedSelectionRef = useRef(false);
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
    setLocalState(readCommunicationWorkspaceLocalState(communicationScopeKey));
  }, [communicationScopeKey]);

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
    setDraftReply('');
  }, [activeThread?.id]);

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

  const activeThreadMissingFromView = Boolean(selectedThread && !activeThread);
  const hasThreads = allThreads.length > 0;
  const hasVisibleThreads = visibleThreads.length > 0;

  return (
    <Stack className="page-stack communication-page" gap="5">
      <Section
        className="dashboard-page-header communication-page__header"
        eyebrow="Clinician follow-up"
        title="Communication"
        subtitle="Review patient-linked communication, respond calmly, and keep safety-sensitive threads connected to clinical follow-through."
        meta={
          <span className="communication-page__meta" aria-live="polite">
            <span className="communication-page__meta-pill">
              {allThreads.length} {allThreads.length === 1 ? 'thread' : 'threads'}
            </span>
            <span className="communication-page__meta-pill communication-page__meta-pill--attention">
              {countThreadsByView(allThreads, 'needs-response')} need response
            </span>
            <span className="communication-page__meta-pill communication-page__meta-pill--risk">
              {countThreadsByView(allThreads, 'safety-flagged')} safety flagged
            </span>
          </span>
        }
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

      <div className="communication-page__layout">
        <Card
          className="communication-page__threads"
          title={
            <span className="communication-page__card-title">
              Communication queue
              <span className="communication-page__card-subtitle">
                Patient-linked conversations ready for clinician review.
              </span>
            </span>
          }
        >
          <div className="communication-page__filters" role="group" aria-label="Communication filters">
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
                return (
                  <article key={thread.id} className="communication-page__thread-list-item" role="listitem">
                    <button
                      type="button"
                      className={`communication-page__thread-item${
                        isSelected ? ' communication-page__thread-item--active' : ''
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectThread(thread)}
                    >
                      <div className="communication-page__thread-item-top">
                        <div>
                          <strong className="communication-page__thread-name">{thread.patientName}</strong>
                          {thread.validPatientId ? (
                            <span className="communication-page__thread-id">ID: {thread.patientId}</span>
                          ) : null}
                        </div>
                        <span
                          className="communication-page__thread-time"
                          title={formatDashboardDateTime(thread.latestEventAt)}
                        >
                          {formatDashboardRelativeTime(thread.latestEventAt)}
                        </span>
                      </div>
                      <p className="communication-page__thread-preview">{thread.latestEventPreview}</p>
                      <div className="communication-page__thread-meta">
                        <span className="communication-page__thread-meta-note">
                          {thread.latestEventKind === 'clinician-reply'
                            ? 'Latest clinician reply'
                            : 'Latest patient message'}
                        </span>
                        <div className="communication-page__thread-badges">
                          {thread.unread ? <Badge variant="warning">Unread</Badge> : null}
                          {thread.needsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                          {thread.safetyFlagged ? <Badge variant="danger">Safety flagged</Badge> : null}
                          {thread.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                          {thread.handled ? <Badge variant="success">Handled</Badge> : null}
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          className="communication-page__timeline"
          title={
            <span className="communication-page__card-title">
              {activeThread ? activeThread.patientName : 'Patient communication timeline'}
              <span className="communication-page__card-subtitle">
                Review the current communication context before responding.
              </span>
            </span>
          }
          action={
            activeThread?.validPatientId ? (
              <div className="communication-page__timeline-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/patients/${encodeURIComponent(activeThread.patientId)}`)}
                >
                  Open patient
                </Button>
                {activeThread.safetyFlagged ? (
                  <Button
                    variant="ghost"
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
              </div>
            ) : null
          }
        >
          {communicationQuery.isLoading && !hasThreads ? (
            <div className="communication-page__timeline-skeletons" aria-label="Communication timeline loading placeholder">
              <Skeleton height={88} />
              <Skeleton height={88} />
            </div>
          ) : activeThread ? (
            <div className="communication-page__timeline-body">
              <div className="communication-page__timeline-intro">
                <div className="communication-page__timeline-intro-copy">
                  <p className="communication-page__timeline-note">
                    This timeline shows communication currently surfaced in the dashboard plus clinician replies stored locally in this browser.
                  </p>
                  <p className="communication-page__timeline-note communication-page__timeline-note--muted">
                    Earlier patient message history may not be available in this foundation workspace.
                  </p>
                </div>
                <div className="communication-page__timeline-badges">
                  {activeThread.unread ? <Badge variant="warning">Unread</Badge> : null}
                  {activeThread.needsResponse ? <Badge variant="warning">Needs response</Badge> : null}
                  {activeThread.safetyFlagged ? <Badge variant="danger">Safety flagged</Badge> : null}
                  {activeThread.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                </div>
              </div>

              <div className="communication-page__timeline-list" role="list" aria-label="Patient communication timeline">
                {activeThread.timeline.map((event) => (
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
                        {event.localOnly ? <Badge variant="default">Local</Badge> : null}
                        {event.flaggedBySafety ? <Badge variant="danger">Safety flagged</Badge> : null}
                        {event.followUpRequested ? <Badge variant="neutral">Follow-up requested</Badge> : null}
                      </div>
                    </div>
                    <p className="communication-page__timeline-event-preview">{event.preview}</p>
                  </article>
                ))}
              </div>

              <div className="communication-page__composer">
                <div className="communication-page__composer-identity" aria-label="Replying as clinician identity">
                  <span className="communication-page__composer-identity-label">Replying as</span>
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
                  <p className="communication-page__composer-note">
                    Replies are stored only in this browser for the current clinician during this foundation pass.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSendReply}
                    disabled={!activeThread.validPatientId || draftReply.trim().length === 0}
                  >
                    Send reply
                  </Button>
                </div>
              </div>
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
        </Card>
      </div>
    </Stack>
  );
}
