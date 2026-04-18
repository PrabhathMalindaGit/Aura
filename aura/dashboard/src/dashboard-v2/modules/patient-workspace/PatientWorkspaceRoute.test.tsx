/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientWorkspaceRouteFacade } from '../../config/routeFacades';
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from '../../config/migrationGates';
import { installMatchMediaMock } from '../../../test/mocks';

const patientWorkspaceMockState = vi.hoisted(() => ({
  patientName: 'Taylor Moss',
  returnTo: '/worklist',
  returnLabel: 'Return to Worklist',
  sourceCue: 'Opened from Worklist',
}));

vi.mock('../../../pages/PatientDetailPage', () => ({
  PatientDetailPage: () => <div data-testid="legacy-patient-detail">Legacy patient detail</div>,
}));

vi.mock('../../../components/patients/PatientHandoffPanel', () => ({
  PatientHandoffPanel: ({ patientId }: { patientId: string }) => (
    <div data-testid="mock-handoff-panel">{`Shared coordination for ${patientId}`}</div>
  ),
}));

vi.mock('../../../components/patients/PatientDecisionSurface', () => ({
  PatientDecisionSurface: () => <div data-testid="mock-patient-decision-surface">Decision surface</div>,
}));

vi.mock('../../../components/patients/RecentAlertsPanel', () => ({
  RecentAlertsPanel: () => <div data-testid="mock-recent-alerts-panel">Recent alerts</div>,
}));

vi.mock('../../../components/patients/PatientCommunicationPanel', () => ({
  PatientCommunicationPanel: () => <div data-testid="mock-patient-communication-panel">Communication panel</div>,
}));

vi.mock('../../../components/patients/PatientTasksPanel', () => ({
  PatientTasksPanel: () => <div data-testid="mock-patient-tasks-panel">Tasks panel</div>,
}));

vi.mock('../../../components/patients/PatientAppointmentsPanel', () => ({
  PatientAppointmentsPanel: () => <div data-testid="mock-patient-appointments-panel">Appointments panel</div>,
}));

vi.mock('../../../components/patients/TrendCharts', () => ({
  TrendCharts: () => <div data-testid="mock-trend-charts">Trend charts</div>,
}));

vi.mock('../../../components/patients/DayDetailPanel', () => ({
  DayDetailPanel: () => null,
}));

vi.mock('./usePatientWorkspaceViewModel', async () => {
  const React = await import('react');
  const { useLocation, useNavigate, useParams } = await import('react-router-dom');

  return {
    usePatientWorkspaceViewModel: () => {
      const location = useLocation();
      const navigate = useNavigate();
      const { patientId = 'patient-1' } = useParams();
      const [supportDrawerOpen, setSupportDrawerOpen] = React.useState(false);
      const [activeSupportView, setActiveSupportView] = React.useState<'coordination' | 'workflow' | 'governance'>('coordination');
      const searchParams = new URLSearchParams(location.search);
      const selectedDays = searchParams.get('days') === '30' ? 30 : 14;
      const activeTab =
        location.pathname.endsWith('/communications')
          ? 'communications'
          : location.pathname.endsWith('/guidance')
            ? 'guidance'
            : location.pathname.endsWith('/history')
              ? 'history'
              : 'overview';

      const openTab = (tabId: 'overview' | 'communications' | 'guidance' | 'history') => {
        const nextPath =
          tabId === 'overview'
            ? `/patients/${patientId}/overview`
            : `/patients/${patientId}/${tabId}`;
        navigate({
          pathname: nextPath,
          search: location.search,
        });
      };

      const setSelectedDaysValue = (days: 14 | 30) => {
        const nextSearch = new URLSearchParams(location.search);
        nextSearch.set('days', String(days));
        navigate({
          pathname: location.pathname,
          search: `?${nextSearch.toString()}`,
        });
      };

      return {
        patientId,
        activeTab,
        selectedDays,
        header: {
          patientName: patientWorkspaceMockState.patientName,
          patientId,
          statusLabel: 'Active',
          statusTone: 'info',
          rehabPhaseLabel: 'Strength & Control',
          lastActivityLabel: 'Last check-in 2h ago',
          lastActivityTitle: 'Last check-in 2 hours ago',
          returnTo: patientWorkspaceMockState.returnTo,
          returnLabel: patientWorkspaceMockState.returnLabel,
          sourceCue: patientWorkspaceMockState.sourceCue,
          navLinks: [
            { id: 'overview', label: 'Overview', to: `/patients/${patientId}/overview` },
            { id: 'communications', label: 'Communications', to: `/patients/${patientId}/communications` },
            { id: 'guidance', label: 'Guidance', to: `/patients/${patientId}/guidance` },
            { id: 'history', label: 'History', to: `/patients/${patientId}/history` },
          ],
          facts: [
            { label: 'Alerts', value: '1 open', note: 'Contextual and explainable' },
            { label: 'Risk', value: 'High', note: 'Server-derived current risk' },
            { label: 'Review', value: 'Needs follow-up', note: 'Shared coordination separate' },
          ],
        },
        decisionStrip: {
          scopeLabel:
            activeTab === 'communications'
              ? 'Communications'
              : activeTab === 'guidance'
                ? 'Guidance'
                : activeTab === 'history'
                  ? 'History'
                  : 'Overview',
          whyNowTitle: 'Current patient review focus',
          whyNowBody: 'The patient workspace keeps one stable clinical context while the subroute changes.',
          attentionLine: 'Why now remains separate from durable governance metadata.',
          facts: [
            { label: 'Latest activity', value: '2h ago', note: 'Patient check-in available' },
            { label: 'Open tasks', value: '1', note: 'Linked workflow remains secondary' },
            { label: 'Messages', value: '1 delayed', note: 'Server response state only' },
            { label: 'Guidance', value: 'PROM due', note: 'Visible without portal noise' },
          ],
          actions: [
            { id: 'alerts', label: 'Open alerts' },
            { id: 'communication', label: 'Open communication' },
          ],
        },
        overview: {
          freshnessLabel: 'Loaded 2 minutes ago',
          reviewWindowItems: [
            { label: 'Check-ins', value: '5', note: 'In the selected window' },
            { label: 'Alerts', value: '1 open', note: 'Needs clinician context' },
            { label: 'Tasks', value: '1 active', note: 'Workflow stays secondary' },
            { label: 'PROMs', value: '1 due', note: 'Guidance snapshot only' },
          ],
          trajectory: {
            headline: 'Pain is worsening in the current window',
            summary: 'The compact snapshot points into History instead of recreating the full chart suite here.',
          },
          followThroughDigest: [
            { label: 'Communications', value: '1 delayed', text: 'Follow-up remains linked to inbox truth.' },
            { label: 'Tasks', value: '1 active', text: 'Task context stays in workflow, not identity chrome.' },
          ],
          guidanceDigest: [
            { label: 'PROM queue', value: '1 due', text: 'Guidance remains distinct from history.' },
            { label: 'Recovery support', value: 'Adaptive', text: 'Configuration is available without dominating the lane.' },
          ],
        },
        communications: {
          freshnessLabel: 'Loaded 1 minute ago',
          serverTruthNote: 'Server-reviewed communication state remains authoritative.',
          localTruthNote: 'Local quick replies remain browser-private and never become shared notes.',
        },
        guidance: {
          freshnessLabel: 'Loaded just now',
          rehabSummary: 'Structured guidance stays separate from communication and governance.',
          recoverySupportSummary: 'Adaptive follow-up is active.',
        },
        history: {
          freshnessLabel: 'Loaded 3 minutes ago',
          summaryItems: [
            { label: 'Pain trend', value: 'Worsening', note: 'Interpret with chart context' },
            { label: 'Mood trend', value: 'Stable', note: 'Accessible chart path stays available' },
            { label: 'Adherence', value: '62%', note: 'Use chart plus chronology together' },
            { label: 'Sessions', value: '2 recent', note: 'Reference only, not dashboard chrome' },
          ],
        },
        governance: {
          explanation: 'Governance surfaces show provenance, threshold context, and shared coordination without outranking the main lane.',
          provenance: ['clinician-entered', 'patient-reported'],
          workflowFacts: [
            { label: 'Follow-up owner', value: 'Clinician One' },
            { label: 'Linked task', value: 'Check medication adherence' },
          ],
          governanceFacts: [
            { label: 'Last reviewed', value: 'Unknown' },
            { label: 'Shared handoff', value: 'Updated 20m ago' },
          ],
          thresholdFacts: [
            { label: 'Pain threshold', value: '7/10' },
            { label: 'Delay threshold', value: '8 hours' },
          ],
        },
        patientDisplayName: patientWorkspaceMockState.patientName,
        headerNotices: [],
        activeSupportView,
        supportDrawerOpen,
        setSupportDrawerOpen,
        setActiveSupportView,
        setSelectedDays: setSelectedDaysValue,
        openSupportView: (view: 'coordination' | 'workflow' | 'governance') => {
          setActiveSupportView(view);
          setSupportDrawerOpen(true);
        },
        openPatientWorkspaceTab: openTab,
        onDecisionAction: vi.fn(),
        onOpenCommunicationWorkspace: vi.fn(),
        onOpenAppointmentsWorkspace: vi.fn(),
        onOpenAlertsWorkspace: vi.fn(),
        onOpenPlanWorkspace: vi.fn(),
        onOpenWorklist: vi.fn(),
        alerts: [],
        seenAlertMap: {},
        alertMutationPending: false,
        handleAlertStatusUpdate: vi.fn(),
        alertsFreshnessLabel: 'Loaded 2 minutes ago',
        patientPriorities: [],
        recommendedActions: [],
        patientPrioritiesError: null,
        recommendedActionsError: null,
        refreshOverview: vi.fn(),
        refreshCommunications: vi.fn(),
        refreshGuidance: vi.fn(),
        refreshHistory: vi.fn(),
        communicationItems: [
          {
            id: 'comm-1',
            patientId,
            patientName: patientWorkspaceMockState.patientName,
            messageId: 'message-1',
            needsResponse: true,
            flaggedBySafety: true,
            followUpRequested: true,
            messageCreatedAt: '2026-04-17T08:30:00.000Z',
            messagePreview: 'Pain is much worse after exercise today.',
            responseState: 'delayed',
            responseDelayed: true,
            responseDelayHours: 8,
            reviewedAfterLatestInbound: false,
          },
        ],
        communicationTimeline: [],
        canQuickReplyFromPatientDetail: true,
        patientCommunicationBlockedBySafety: false,
        patientQuickReply: '',
        setPatientQuickReply: vi.fn(),
        selectedQuickReplyTemplateId: '',
        setSelectedQuickReplyTemplateId: vi.fn(),
        communicationAuthoring: { templates: [], hasSignature: true },
        handlePatientQuickReply: vi.fn(),
        handleInsertPatientQuickReplyTemplate: vi.fn(),
        handleInsertPatientQuickReplySignature: vi.fn(),
        patientTasks: [],
        patientActiveTasks: [],
        patientRecentCompletedTasks: [],
        completingTaskId: null,
        handleCompleteTask: vi.fn(),
        tasksFreshnessLabel: 'Loaded 1 minute ago',
        patientAppointments: [],
        appointmentsFreshnessLabel: 'Loaded 1 minute ago',
        rehab: null,
        selectedRehabKey: '',
        setSelectedRehabKey: vi.fn(),
        handleRehabSave: vi.fn(),
        rehabSaveError: null,
        isSavingRehab: false,
        promDue: [],
        completedProms: [],
        promTemplateKey: 'AURA_RECOVERY_5',
        setPromTemplateKey: vi.fn(),
        promDueAt: '',
        setPromDueAt: vi.fn(),
        handleAssignProm: vi.fn(),
        promSaveError: null,
        isAssigningProm: false,
        pendingInsights: [],
        approvedInsights: [],
        handleGenerateInsights: vi.fn(),
        handleReviewPatientInsight: vi.fn(),
        isGeneratingInsights: false,
        insightReviewingId: null,
        insightActionError: null,
        insightActionNotice: null,
        patientPlan: null,
        patientRecoverySupport: null,
        recoverySupportDraft: {
          checkinMode: 'adaptive',
          nudgesEnabled: true,
          rationale: '',
          temporaryForceFullOption: 'off',
        },
        setRecoverySupportCheckinMode: vi.fn(),
        setRecoverySupportNudgesEnabled: vi.fn(),
        setRecoverySupportRationale: vi.fn(),
        setRecoverySupportTemporaryFullFlowOption: vi.fn(),
        handleSaveRecoverySupport: vi.fn(),
        recoverySupportError: null,
        recoverySupportNotice: null,
        isSavingRecoverySupport: false,
        currentAdaptationDecision: null,
        adaptationHistory: [],
        activeCaregiverAccessItems: [],
        thresholds: null,
        coordinationRecord: null,
        safetyEvents: [],
        selectedDayPoint: null,
        selectedDayAlerts: [],
        chronologyItems: [],
        normalizedTrends: [],
        trendSummary: {
          painDirection: 'flat',
          moodDirection: 'flat',
          adherenceDirection: 'flat',
          checkinCount: 0,
        },
        showTrendsLoading: false,
        expandedTrendMetric: null,
        setExpandedTrendMetric: vi.fn(),
        setSelectedDayKey: vi.fn(),
        recentSleepRows: [],
        recentBodyMapSummary: [],
        recentHydrationSummary: { avgDailyMl: null, daysMeetingTarget: 0 },
        recentNutritionSummary: { trackedDays: 0, avgFruitVeg: null, proteinOkHighDays: 0 },
        recentWearablesSummary: {
          trackedDays: 0,
          avgSteps: null,
          avgActiveMinutes: null,
          avgRestingHr: null,
          source: 'mock',
        },
        recentMedicationSummary: { scheduled: 0, taken: 0, skipped: 0, adherencePct: null },
        recentPhotos: [],
      };
    },
  };
});

function LocationEcho(): JSX.Element {
  const location = useLocation();
  return <div data-testid="route-location">{`${location.pathname}${location.search}`}</div>;
}

function renderPatientWorkspace(initialEntry: string): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/patients/:patientId" element={<PatientWorkspaceRouteFacade />} />
        <Route path="/patients/:patientId/overview" element={<PatientWorkspaceRouteFacade />} />
        <Route path="/patients/:patientId/communications" element={<PatientWorkspaceRouteFacade />} />
        <Route path="/patients/:patientId/guidance" element={<PatientWorkspaceRouteFacade />} />
        <Route path="/patients/:patientId/history" element={<PatientWorkspaceRouteFacade />} />
      </Routes>
      <LocationEcho />
    </MemoryRouter>,
  );
}

function setPatientWorkspaceGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      'patient-workspace': enabled,
    },
  });
}

describe('PatientWorkspaceRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    resetDashboardV2GatesForTests();
    patientWorkspaceMockState.patientName = 'Taylor Moss';
    patientWorkspaceMockState.returnTo = '/worklist';
    patientWorkspaceMockState.returnLabel = 'Return to Worklist';
    patientWorkspaceMockState.sourceCue = 'Opened from Worklist';
    installMatchMediaMock(() => false);
  });

  afterEach(() => {
    cleanup();
    resetDashboardV2GatesForTests();
  });

  it('falls back to the legacy patient detail route when the workspace is explicitly rolled back', async () => {
    setPatientWorkspaceGate(false);
    renderPatientWorkspace('/patients/patient-1');

    expect(await screen.findByTestId('legacy-patient-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('v2-patient-workspace-route')).not.toBeInTheDocument();
  });

  it('renders the v2 patient workspace by default for the overview alias and keeps the inline rail on wide layouts', async () => {

    renderPatientWorkspace('/patients/patient-1?days=30');

    expect(await screen.findByTestId('v2-patient-workspace-route')).toBeInTheDocument();
    expect(screen.getByTestId('v2-patient-overview-pane')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taylor Moss' })).toBeInTheDocument();
    expect(screen.getByTestId('v2-patient-governance-rail')).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/patients/patient-1?days=30');
  });

  it('keeps the patient header stable while switching between real subroutes', async () => {
    const user = userEvent.setup();

    renderPatientWorkspace('/patients/patient-1/communications');

    expect(await screen.findByTestId('v2-patient-communications-pane')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taylor Moss' })).toBeInTheDocument();

    await user.click(screen.getByTestId('v2-patient-nav-guidance'));

    expect(await screen.findByTestId('v2-patient-guidance-pane')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taylor Moss' })).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/patients/patient-1/guidance');
  });

  it('moves support context into a drawer on medium layouts', async () => {
    const user = userEvent.setup();
    installMatchMediaMock((query) => query.includes('(max-width: 1279px)') && !query.includes('(max-width: 1023px)'));

    renderPatientWorkspace('/patients/patient-1/overview');

    expect(await screen.findByTestId('v2-patient-overview-pane')).toBeInTheDocument();
    expect(screen.queryByTestId('v2-patient-governance-rail')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open support' }));

    expect(await screen.findByRole('heading', { name: 'Patient support context' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shared coordination' })).toBeInTheDocument();
  });

  it('keeps the compressed narrow shell and the history pane for direct deep links', async () => {
    installMatchMediaMock((query) => query.includes('(max-width: 1279px)') || query.includes('(max-width: 1023px)'));

    renderPatientWorkspace('/patients/patient-1/history');

    expect(await screen.findByTestId('v2-patient-history-pane')).toBeInTheDocument();
    expect(screen.queryByTestId('v2-patient-governance-rail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open support' })).toBeInTheDocument();
  });
});
