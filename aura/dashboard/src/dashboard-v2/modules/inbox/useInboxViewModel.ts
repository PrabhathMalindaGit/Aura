import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCommunicationAuthoring } from '../../../hooks/useCommunicationAuthoring';
import { useClinicianIdentity } from '../../../hooks/useClinicianIdentity';
import { useConnectionStatus } from '../../../services/connection';
import {
  insertSignatureIntoDraft,
  insertTemplateIntoDraft,
} from '../../../services/communicationAuthoring';
import { getSavedCommunicationFilter } from '../../../services/clinicianWorkspacePreferences';
import {
  recordCommunicationThreadOpened,
  useAppendPatientCoordinationNote,
  useDashboardCommunicationOverview,
  usePatientCoordination,
} from '../../../services/clinicianApi';
import {
  addCommunicationThreadReply,
  COMMUNICATION_THREAD_VIEW_OPTIONS,
  deriveCommunicationThreads,
  filterCommunicationThreads,
  findCommunicationThreadByPatientId,
  markCommunicationThreadReviewed,
  parseCommunicationThreadView,
  readCommunicationWorkspaceLocalState,
  type CommunicationThread,
  type CommunicationThreadView,
} from '../../../services/communicationWorkspace';
import { toUserMessage } from '../../../utils/errors';
import type { DashboardCommunicationOverviewItem } from '../../../types/models';
import {
  buildInboxQueueRow,
  buildInboxSupport,
  buildInboxWorkspace,
  type InboxQueueRowVm,
  type InboxSupportVm,
  type InboxWorkspaceVm,
} from '../../adapters/communication';
import { useInboxUiStore } from '../../state/useInboxUiStore';
import type { InboxSupportView } from './components/SupportContextDrawer';

interface UseInboxViewModelOptions {
  isNarrowLayout: boolean;
}

function normalizePatientId(value: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countThreadsByView(
  threads: CommunicationThread[],
  view: CommunicationThreadView,
): number {
  return filterCommunicationThreads(threads, view).length;
}

function buildGuidanceLine(threads: CommunicationThread[]): string {
  const safety = threads.filter((thread) => thread.safetyFlagged).length;
  const delayed = threads.filter((thread) => thread.responseDelayed).length;
  const needsResponse = threads.filter((thread) => thread.needsResponse).length;
  const reviewed = threads.filter((thread) => thread.reviewedAfterLatestInbound && !thread.responseDelayed).length;

  if (safety > 0) {
    return `${safety} safety-flagged ${safety === 1 ? 'thread needs' : 'threads need'} visible review.`;
  }

  if (delayed > 0) {
    return `${delayed} ${delayed === 1 ? 'thread is' : 'threads are'} beyond the configured response window.`;
  }

  if (needsResponse > 0) {
    return `${needsResponse} ${needsResponse === 1 ? 'thread needs' : 'threads need'} clinician follow-up now.`;
  }

  if (reviewed > 0) {
    return `${reviewed} ${reviewed === 1 ? 'thread is' : 'threads are'} reviewed and still visible for workflow follow-through.`;
  }

  if (threads.length > 0) {
    return `${threads.length} ${threads.length === 1 ? 'thread is' : 'threads are'} currently in review.`;
  }

  return 'No patient communication is waiting in this workspace.';
}

export function useInboxViewModel({
  isNarrowLayout,
}: UseInboxViewModelOptions) {
  const navigate = useNavigate();
  const connection = useConnectionStatus();
  const clinicianIdentity = useClinicianIdentity();
  const authoring = useCommunicationAuthoring();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedThreadId = useInboxUiStore((state) => state.selectedThreadId);
  const focusMode = useInboxUiStore((state) => state.focusMode);
  const setSelectedThreadId = useInboxUiStore((state) => state.setSelectedThreadId);
  const setFocusMode = useInboxUiStore((state) => state.setFocusMode);
  const initialDefaultViewRef = useRef<CommunicationThreadView>(getSavedCommunicationFilter());
  const [localState, setLocalState] = useState(() =>
    readCommunicationWorkspaceLocalState(clinicianIdentity.authScopeId ?? clinicianIdentity.clinicianId),
  );
  const [selectedThreadView, setSelectedThreadView] = useState<CommunicationThreadView | null>(null);
  const [draftReply, setDraftReply] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sharedNoteDraft, setSharedNoteDraft] = useState('');
  const [sharedNoteNotice, setSharedNoteNotice] = useState<string | null>(null);
  const [sharedNoteError, setSharedNoteError] = useState<string | null>(null);
  const [activeSupportView, setActiveSupportView] = useState<InboxSupportView>('shared');
  const draftSessionInitializationRef = useRef<Record<string, true>>({});
  const authoringRef = useRef(authoring);
  const communicationScopeKey = clinicianIdentity.authScopeId ?? clinicianIdentity.clinicianId;
  const communicationQuery = useDashboardCommunicationOverview(100);
  const currentView = searchParams.has('view')
    ? parseCommunicationThreadView(searchParams.get('view'))
    : initialDefaultViewRef.current;
  const requestedPatientId = normalizePatientId(searchParams.get('patientId'));

  useEffect(() => {
    authoringRef.current = authoring;
  }, [authoring]);

  useEffect(() => {
    setLocalState(readCommunicationWorkspaceLocalState(communicationScopeKey));
    draftSessionInitializationRef.current = {};
    setDraftReply('');
  }, [communicationScopeKey]);

  useEffect(() => {
    if (authoring.templates.length === 0) {
      setSelectedTemplateId('');
      return;
    }

    if (!authoring.templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(authoring.templates[0]?.id ?? '');
    }
  }, [authoring.templates, selectedTemplateId]);

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
    if (allThreads.length === 0) {
      setSelectedThreadId(null);
      if (isNarrowLayout) {
        setFocusMode('queue');
      }
      return;
    }

    if (requestedThread) {
      setSelectedThreadId(requestedThread.id);
      setSelectedThreadView(currentView);
      setFocusMode('workspace');
      return;
    }

    const selectedVisibleInFiltered =
      selectedThreadId !== null && filteredThreads.some((thread) => thread.id === selectedThreadId);
    const selectedVisibleInAll =
      selectedThreadId !== null && allThreads.some((thread) => thread.id === selectedThreadId);
    const shouldKeepSelectedVisible =
      selectedVisibleInAll &&
      selectedThreadView === currentView &&
      !selectedVisibleInFiltered;

    if (selectedVisibleInFiltered || shouldKeepSelectedVisible) {
      if (!isNarrowLayout) {
        setFocusMode('workspace');
      }
      return;
    }

    const fallbackThread = filteredThreads[0] ?? allThreads[0] ?? null;

    if (!fallbackThread) {
      setSelectedThreadId(null);
      if (isNarrowLayout) {
        setFocusMode('queue');
      }
      return;
    }

    if (isNarrowLayout && selectedThreadId) {
      if (!selectedVisibleInAll) {
        setSelectedThreadId(fallbackThread.id);
      }
      return;
    }

    setSelectedThreadId(fallbackThread.id);
    setSelectedThreadView(currentView);

    if (!isNarrowLayout) {
      setFocusMode('workspace');
    }
  }, [
    allThreads,
    currentView,
    filteredThreads,
    isNarrowLayout,
    requestedThread,
    selectedThreadId,
    selectedThreadView,
    setFocusMode,
    setSelectedThreadId,
  ]);

  const selectedThread = useMemo(
    () => allThreads.find((thread) => thread.id === selectedThreadId) ?? null,
    [allThreads, selectedThreadId],
  );

  const shouldKeepSelectedVisible = Boolean(
    selectedThread &&
      selectedThreadView === currentView &&
      !filteredThreads.some((thread) => thread.id === selectedThread.id),
  );

  const visibleThreads = useMemo(() => {
    if (!selectedThread || !shouldKeepSelectedVisible) {
      return filteredThreads;
    }

    return [selectedThread, ...filteredThreads.filter((thread) => thread.id !== selectedThread.id)];
  }, [filteredThreads, selectedThread, shouldKeepSelectedVisible]);

  const selectedThreadForWorkspace = useMemo(() => {
    if (isNarrowLayout && focusMode === 'queue' && !requestedThreadId(searchParams)) {
      return null;
    }

    return (
      filteredThreads.find((thread) => thread.id === selectedThreadId) ??
      (shouldKeepSelectedVisible ? selectedThread : null)
    );
  }, [
    filteredThreads,
    focusMode,
    isNarrowLayout,
    searchParams,
    selectedThread,
    selectedThreadId,
    shouldKeepSelectedVisible,
  ]);

  const activeThreadContext = useMemo(
    () =>
      selectedThreadForWorkspace
        ? threadContextMap.get(selectedThreadForWorkspace.id) ?? null
        : null,
    [selectedThreadForWorkspace, threadContextMap],
  );

  const activePatientId =
    selectedThreadForWorkspace?.validPatientId ? selectedThreadForWorkspace.patientId : null;
  const coordinationQuery = usePatientCoordination(activePatientId);
  const appendSharedCoordinationNoteMutation = useAppendPatientCoordinationNote(activePatientId ?? '');

  useEffect(() => {
    if (!selectedThreadForWorkspace?.validPatientId || !selectedThreadForWorkspace.latestInboundAt) {
      return;
    }

    setLocalState((current) =>
      markCommunicationThreadReviewed(
        current,
        selectedThreadForWorkspace.patientId,
        selectedThreadForWorkspace.latestInboundAt,
        communicationScopeKey,
      ),
    );
  }, [
    communicationScopeKey,
    selectedThreadForWorkspace?.id,
    selectedThreadForWorkspace?.latestInboundAt,
    selectedThreadForWorkspace?.patientId,
    selectedThreadForWorkspace?.validPatientId,
  ]);

  useEffect(() => {
    if (!selectedThreadForWorkspace?.validPatientId) {
      return;
    }

    void recordCommunicationThreadOpened(selectedThreadForWorkspace.patientId, {
      sourceSurface: 'communication_inbox',
    }).catch(() => {
      // Keep inbox navigation resilient if the internal signal cannot be recorded.
    });
  }, [selectedThreadForWorkspace?.id, selectedThreadForWorkspace?.patientId, selectedThreadForWorkspace?.validPatientId]);

  useEffect(() => {
    const activeThreadId = selectedThreadForWorkspace?.id;
    if (!activeThreadId) {
      setDraftReply('');
      return;
    }

    if (draftSessionInitializationRef.current[activeThreadId]) {
      return;
    }

    draftSessionInitializationRef.current[activeThreadId] = true;
    const nextAuthoring = authoringRef.current;
    const shouldSeedSignature =
      selectedThreadForWorkspace.validPatientId &&
      nextAuthoring.autoAppendSignature &&
      nextAuthoring.hasSignature;

    setDraftReply(shouldSeedSignature ? nextAuthoring.defaultSignature : '');
  }, [selectedThreadForWorkspace]);

  useEffect(() => {
    setSharedNoteDraft('');
    setSharedNoteNotice(null);
    setSharedNoteError(null);
    setActiveSupportView('shared');
  }, [activePatientId]);

  const queueRows = useMemo<InboxQueueRowVm[]>(
    () =>
      visibleThreads.map((thread) =>
        buildInboxQueueRow(thread, threadContextMap.get(thread.id) ?? null),
      ),
    [threadContextMap, visibleThreads],
  );

  const activeWorkspace = useMemo<InboxWorkspaceVm | null>(
    () =>
      selectedThreadForWorkspace
        ? buildInboxWorkspace(selectedThreadForWorkspace, activeThreadContext)
        : null,
    [activeThreadContext, selectedThreadForWorkspace],
  );

  const support = useMemo<InboxSupportVm | null>(
    () =>
      selectedThreadForWorkspace
        ? buildInboxSupport(
            selectedThreadForWorkspace,
            activeThreadContext,
            coordinationQuery.data ?? null,
          )
        : null,
    [activeThreadContext, coordinationQuery.data, selectedThreadForWorkspace],
  );

  const viewCounts = useMemo(
    () =>
      COMMUNICATION_THREAD_VIEW_OPTIONS.reduce<Record<CommunicationThreadView, number>>(
        (accumulator, option) => {
          accumulator[option.id] = countThreadsByView(allThreads, option.id);
          return accumulator;
        },
        {
          all: 0,
          'needs-response': 0,
          'response-delayed': 0,
          'safety-flagged': 0,
          reviewed: 0,
        },
      ),
    [allThreads],
  );

  const guidanceLine = buildGuidanceLine(allThreads);
  const updatedAtLabel = connection.lastSuccessAt
    ? new Date(connection.lastSuccessAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  const showInitialLoading = communicationQuery.isLoading && allThreads.length === 0;
  const staleErrorBannerVisible = Boolean(communicationQuery.error && allThreads.length > 0);
  const blockingOfflineVisible =
    !connection.online && allThreads.length === 0 && !communicationQuery.error;
  const statusTitle = communicationQuery.error
    ? 'Unable to load inbox'
    : blockingOfflineVisible
      ? 'Offline'
      : undefined;
  const statusDescription = communicationQuery.error
    ? toUserMessage(communicationQuery.error)
    : blockingOfflineVisible
      ? 'No cached communication snapshot is available yet. Reconnect and retry.'
      : undefined;

  const emptyTitle = currentView === 'all' ? 'No communication waiting' : 'No threads match this view';
  const emptyDescription =
    currentView === 'all'
      ? 'Patient communication needing clinician review will appear here.'
      : 'Choose another filter to return to the current communication queue.';
  const currentViewLabel =
    COMMUNICATION_THREAD_VIEW_OPTIONS.find((option) => option.id === currentView)?.label ?? 'All';

  const updateSearchParams = useCallback(
    (next: { patientId?: string | null; view?: CommunicationThreadView | null }) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);

        if (next.view) {
          params.set('view', next.view);
        } else if (next.view === null) {
          params.delete('view');
        }

        if (typeof next.patientId === 'string' && next.patientId.trim()) {
          params.set('patientId', next.patientId.trim());
        } else if (next.patientId === null) {
          params.delete('patientId');
        }

        return params;
      });
    },
    [setSearchParams],
  );

  const refreshInbox = useCallback(() => {
    void communicationQuery.refetch();
  }, [communicationQuery]);

  const selectThread = useCallback(
    (key: string) => {
      const nextThread = allThreads.find((thread) => thread.id === key);
      if (!nextThread) {
        return;
      }

      setSelectedThreadId(nextThread.id);
      setSelectedThreadView(currentView);
      setFocusMode('workspace');
      updateSearchParams({
        patientId: nextThread.validPatientId ? nextThread.patientId : null,
        view: currentView,
      });
    },
    [allThreads, currentView, setFocusMode, setSelectedThreadId, updateSearchParams],
  );

  const setCurrentView = useCallback(
    (value: CommunicationThreadView) => {
      updateSearchParams({ view: value });
    },
    [updateSearchParams],
  );

  const clearSelectionToQueue = useCallback(() => {
    setFocusMode('queue');
  }, [setFocusMode]);

  const handleSaveLocalDraft = useCallback(() => {
    if (!selectedThreadForWorkspace?.validPatientId) {
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
          patientId: selectedThreadForWorkspace.patientId,
          text: nextDraft,
        },
        communicationScopeKey,
      ),
    );
    setDraftReply('');
  }, [communicationScopeKey, draftReply, selectedThreadForWorkspace]);

  const handleInsertTemplate = useCallback(() => {
    const selectedTemplate =
      authoring.templates.find((template) => template.id === selectedTemplateId) ?? null;

    if (!selectedTemplate) {
      return;
    }

    setDraftReply((current) =>
      insertTemplateIntoDraft(current, selectedTemplate.body, {
        signature: authoring.defaultSignature,
      }),
    );
  }, [authoring.defaultSignature, authoring.templates, selectedTemplateId]);

  const handleInsertSignature = useCallback(() => {
    if (!authoring.hasSignature) {
      return;
    }

    setDraftReply((current) => insertSignatureIntoDraft(current, authoring.defaultSignature));
  }, [authoring.defaultSignature, authoring.hasSignature]);

  const submitSharedNote = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
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
    },
    [activePatientId, activeThreadContext?.messageId, appendSharedCoordinationNoteMutation, sharedNoteDraft],
  );

  const openAlerts = useCallback(() => {
    if (!selectedThreadForWorkspace?.validPatientId) {
      return;
    }

    navigate(
      `/alerts?patientId=${encodeURIComponent(selectedThreadForWorkspace.patientId)}&source=chat`,
    );
  }, [navigate, selectedThreadForWorkspace]);

  const openPatient = useCallback(() => {
    if (!selectedThreadForWorkspace?.validPatientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(selectedThreadForWorkspace.patientId)}`);
  }, [navigate, selectedThreadForWorkspace]);

  const openStructuredCoordination = useCallback(() => {
    if (!selectedThreadForWorkspace?.validPatientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(selectedThreadForWorkspace.patientId)}/communications`);
  }, [navigate, selectedThreadForWorkspace]);

  return {
    authoring,
    clinicianIdentity,
    currentView,
    currentViewLabel,
    activeWorkspace,
    draftReply,
    emptyActionLabel: currentView === 'all' ? 'Refresh inbox' : 'Return to all',
    emptyDescription,
    emptyTitle,
    focusMode,
    guidanceLine,
    queueRows,
    refreshInbox,
    selectThread,
    selectedKey: selectedThreadId,
    selectedTemplateId,
    setCurrentView,
    setDraftReply,
    setSelectedTemplateId,
    setSharedNoteDraft,
    setActiveSupportView,
    sharedNoteDraft,
    sharedNoteError,
    sharedNoteNotice,
    showInitialLoading,
    statusDescription,
    statusTitle,
    staleErrorBannerVisible,
    blockingOfflineVisible,
    submitSharedNote,
    support,
    activeSupportView,
    totalThreads: allThreads.length,
    currentViewCount: viewCounts[currentView],
    updatedAtLabel,
    viewCounts,
    isRefreshing: communicationQuery.isFetching,
    handleInsertSignature,
    handleInsertTemplate,
    handleSaveLocalDraft,
    clearSelectionToQueue,
    openAlerts,
    openPatient,
    openStructuredCoordination,
    coordinationLoading:
      coordinationQuery.isLoading && coordinationQuery.data === undefined,
    coordinationError:
      coordinationQuery.isError && coordinationQuery.data === undefined
        ? toUserMessage(coordinationQuery.error)
        : null,
    sharedNotePending: appendSharedCoordinationNoteMutation.isPending,
  };
}

function requestedThreadId(searchParams: URLSearchParams): string {
  return normalizePatientId(searchParams.get('patientId'));
}
