import { PatientDecisionSurface } from '../../../../components/patients/PatientDecisionSurface';
import { RecentAlertsPanel } from '../../../../components/patients/RecentAlertsPanel';
import type { SeenAlertMap } from '../../../../services/seenStore';
import type { AlertItem } from '../../../../types/models';
import type { PatientPriorityItem, PatientRecommendedAction } from '../../../../utils/patientDetail';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import type {
  PatientWorkspaceActionId,
  PatientWorkspaceGovernanceVm,
  PatientWorkspaceOverviewVm,
} from '../../../adapters/patientWorkspace';
import { PatientContextSummary } from './PatientContextSummary';

interface PatientOverviewPaneProps {
  overview: PatientWorkspaceOverviewVm;
  governance: PatientWorkspaceGovernanceVm;
  priorities: PatientPriorityItem[];
  recommendedActions: PatientRecommendedAction[];
  prioritiesError: string | null;
  recommendedActionsError: string | null;
  alerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
  alertsFreshnessLabel: string | null;
  alertMutationPending: boolean;
  onAction: (actionId: PatientWorkspaceActionId) => void;
  onRetry: () => void;
  onAcknowledgeAlert: (alert: AlertItem) => void;
  onResolveAlert: (alert: AlertItem) => void;
  onViewAllAlerts: () => void;
  onOpenContext: () => void;
}

export function PatientOverviewPane({
  overview,
  governance,
  priorities,
  recommendedActions,
  prioritiesError,
  recommendedActionsError,
  alerts,
  seenAlertMap,
  alertsFreshnessLabel,
  alertMutationPending,
  onAction,
  onRetry,
  onAcknowledgeAlert,
  onResolveAlert,
  onViewAllAlerts,
  onOpenContext,
}: PatientOverviewPaneProps): JSX.Element {
  return (
    <div className="v2-patient-pane v2-patient-pane--overview" data-testid="v2-patient-overview-pane">
      <div className="v2-patient-overview-cockpit">
        <PatientDecisionSurface
          priorities={priorities}
          recommendedActions={recommendedActions}
          isLoading={false}
          priorityError={prioritiesError}
          recommendedActionsError={recommendedActionsError}
          onRetry={onRetry}
          onAction={(key) => onAction(key === 'trends' ? 'history' : key)}
        />

        <DashboardV2Surface className="v2-patient-review-summary" tone="muted">
          <div className="v2-patient-review-summary__header">
            <div>
              <DashboardV2Text tone="label">Current context</DashboardV2Text>
              <DashboardV2Heading as="h3">Selected-window patient state</DashboardV2Heading>
            </div>
            {overview.freshnessLabel ? <DashboardV2Text tone="caption">{overview.freshnessLabel}</DashboardV2Text> : null}
          </div>
          <div className="v2-patient-review-summary__grid">
            {overview.reviewWindowItems.map((item) => (
              <article key={item.label} className="v2-patient-review-summary__item">
                <DashboardV2Text tone="label">{item.label}</DashboardV2Text>
                <DashboardV2Text as="strong" tone="strong">{item.value}</DashboardV2Text>
                <DashboardV2Text tone="muted">{item.note}</DashboardV2Text>
              </article>
            ))}
          </div>
        </DashboardV2Surface>
      </div>

      <PatientContextSummary
        governance={governance}
        mode="overview"
        onOpenContext={onOpenContext}
      />

      <div className="v2-patient-overview-grid">
        <DashboardV2Surface className="v2-patient-overview-card v2-patient-overview-card--trajectory" tone="elevated">
          <DashboardV2Text tone="label">Clinical trajectory</DashboardV2Text>
          <DashboardV2Heading as="h3">{overview.trajectory.headline}</DashboardV2Heading>
          <DashboardV2Text tone="muted">{overview.trajectory.summary}</DashboardV2Text>
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-overview-card v2-patient-overview-card--follow-through" tone="base">
          <DashboardV2Text tone="label">Follow-through digest</DashboardV2Text>
          <div className="v2-patient-digest-list">
            {overview.followThroughDigest.map((item) => (
              <article key={item.label} className="v2-patient-digest-item">
                <DashboardV2Text tone="label">{item.label}</DashboardV2Text>
                <DashboardV2Text as="strong" tone="strong">{item.value}</DashboardV2Text>
                <DashboardV2Text tone="muted">{item.text}</DashboardV2Text>
              </article>
            ))}
          </div>
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-overview-card v2-patient-overview-card--guidance" tone="base">
          <DashboardV2Text tone="label">Guidance digest</DashboardV2Text>
          <div className="v2-patient-digest-list">
            {overview.guidanceDigest.map((item) => (
              <article key={item.label} className="v2-patient-digest-item">
                <DashboardV2Text tone="label">{item.label}</DashboardV2Text>
                <DashboardV2Text as="strong" tone="strong">{item.value}</DashboardV2Text>
                <DashboardV2Text tone="muted">{item.text}</DashboardV2Text>
              </article>
            ))}
          </div>
        </DashboardV2Surface>
      </div>

      <RecentAlertsPanel
        alerts={alerts}
        seenAlertMap={seenAlertMap}
        freshnessLabel={alertsFreshnessLabel}
        mutationPending={alertMutationPending}
        onAcknowledge={onAcknowledgeAlert}
        onResolve={onResolveAlert}
        onViewAll={onViewAllAlerts}
      />
    </div>
  );
}
