import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Input } from '../../../primitives/Input';
import { DashboardV2Select } from '../../../primitives/Select';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Textarea } from '../../../primitives/Textarea';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import type {
  InsightItem,
  PatientRecoverySupportConfig,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  ExercisePlan,
  CaregiverAccessItem,
} from '../../../../types/models';
import {
  temporaryFullFlowOptionLabel,
  type PatientWorkspaceGuidanceVm,
  type TemporaryFullFlowOption,
} from '../../../adapters/patientWorkspace';

interface PatientGuidancePaneProps {
  guidance: PatientWorkspaceGuidanceVm;
  rehab: RehabPayload | null;
  selectedRehabKey: string;
  onSelectedRehabKeyChange: (value: string) => void;
  onSaveRehab: () => Promise<void>;
  rehabSaveError: string | null;
  isSavingRehab: boolean;
  promDue: PromDueCard[];
  completedProms: PromHistoryRow[];
  promTemplateKey: string;
  onPromTemplateKeyChange: (value: string) => void;
  promDueAt: string;
  onPromDueAtChange: (value: string) => void;
  onAssignProm: () => Promise<void>;
  promSaveError: string | null;
  isAssigningProm: boolean;
  pendingInsights: InsightItem[];
  approvedInsights: InsightItem[];
  onGenerateInsights: () => Promise<void>;
  onReviewInsight: (insightId: string, status: 'approved' | 'rejected') => Promise<void>;
  isGeneratingInsights: boolean;
  insightReviewingId: string | null;
  insightActionError: string | null;
  insightActionNotice: string | null;
  patientPlan: ExercisePlan | null;
  patientRecoverySupport: PatientRecoverySupportConfig | null;
  recoverySupportDraft: {
    checkinMode: PatientRecoverySupportConfig['checkinMode'];
    nudgesEnabled: boolean;
    rationale: string;
    temporaryForceFullOption: TemporaryFullFlowOption;
  };
  onRecoverySupportCheckinModeChange: (value: PatientRecoverySupportConfig['checkinMode']) => void;
  onRecoverySupportNudgesEnabledChange: (value: boolean) => void;
  onRecoverySupportRationaleChange: (value: string) => void;
  onRecoverySupportTemporaryFullFlowOptionChange: (value: TemporaryFullFlowOption) => void;
  onSaveRecoverySupport: () => Promise<void>;
  recoverySupportError: string | null;
  recoverySupportNotice: string | null;
  isSavingRecoverySupport: boolean;
  activeCaregiverAccessItems: CaregiverAccessItem[];
  onRetry: () => void;
}

function insightTone(confidence: InsightItem['confidence']): 'neutral' | 'warning' | 'success' {
  if (confidence === 'high') {
    return 'success';
  }
  if (confidence === 'medium') {
    return 'warning';
  }
  return 'neutral';
}

export function PatientGuidancePane({
  guidance,
  rehab,
  selectedRehabKey,
  onSelectedRehabKeyChange,
  onSaveRehab,
  rehabSaveError,
  isSavingRehab,
  promDue,
  completedProms,
  promTemplateKey,
  onPromTemplateKeyChange,
  promDueAt,
  onPromDueAtChange,
  onAssignProm,
  promSaveError,
  isAssigningProm,
  pendingInsights,
  approvedInsights,
  onGenerateInsights,
  onReviewInsight,
  isGeneratingInsights,
  insightReviewingId,
  insightActionError,
  insightActionNotice,
  patientPlan,
  patientRecoverySupport,
  recoverySupportDraft,
  onRecoverySupportCheckinModeChange,
  onRecoverySupportNudgesEnabledChange,
  onRecoverySupportRationaleChange,
  onRecoverySupportTemporaryFullFlowOptionChange,
  onSaveRecoverySupport,
  recoverySupportError,
  recoverySupportNotice,
  isSavingRecoverySupport,
  activeCaregiverAccessItems,
  onRetry,
}: PatientGuidancePaneProps): JSX.Element {
  return (
    <div className="v2-patient-pane v2-patient-pane--guidance" data-testid="v2-patient-guidance-pane">
      <DashboardV2Surface className="v2-patient-pane-intro" tone="muted">
        <DashboardV2Text tone="label">Guidance</DashboardV2Text>
        <DashboardV2Heading as="h3">Structured questionnaires, clinical guidance, rehab progression, and recovery support</DashboardV2Heading>
        <DashboardV2Text tone="muted">{guidance.promSummary}</DashboardV2Text>
        <DashboardV2Text tone="caption">
          {guidance.rehabSummary} · {guidance.insightSummary} · {guidance.recoverySupportSummary}
        </DashboardV2Text>
      </DashboardV2Surface>

      <div className="v2-patient-guidance-grid">
        <DashboardV2Surface className="v2-patient-guidance-card" tone="base">
          <div className="v2-patient-guidance-card__header">
            <div>
              <DashboardV2Text tone="label">Rehab progression</DashboardV2Text>
              <DashboardV2Heading as="h3">Current rehab phase</DashboardV2Heading>
            </div>
            <DashboardV2Button tone="secondary" size="sm" onPress={onRetry}>
              Refresh
            </DashboardV2Button>
          </div>
          <DashboardV2Select
            label="Current rehab phase"
            selectedKey={selectedRehabKey}
            onSelectionChange={(value) => onSelectedRehabKeyChange(value)}
            options={(rehab?.phases ?? []).map((phase) => ({
              id: phase.key,
              label: phase.title,
            }))}
            placeholder="Select rehab phase"
          />
          {rehabSaveError ? <DashboardV2Text tone="caption" className="v2-patient-form-error">{rehabSaveError}</DashboardV2Text> : null}
          <div className="v2-patient-actions-row">
            <DashboardV2Button tone="secondary" size="sm" onPress={() => void onSaveRehab()}>
              {isSavingRehab ? 'Saving…' : 'Save rehab phase'}
            </DashboardV2Button>
          </div>
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-guidance-card" tone="base">
          <DashboardV2Text tone="label">Questionnaires</DashboardV2Text>
          <DashboardV2Heading as="h3">PROM queue</DashboardV2Heading>
          <div className="v2-patient-guidance-list">
            {promDue.length === 0 ? (
              <DashboardV2Text tone="muted">No questionnaires are due right now.</DashboardV2Text>
            ) : (
              promDue.map((item) => (
                <article key={item.id} className="v2-patient-guidance-list__item">
                  <DashboardV2Text as="strong" tone="strong">{item.title}</DashboardV2Text>
                  <DashboardV2Text tone="muted">Due {new Date(item.dueAt).toLocaleString()}</DashboardV2Text>
                </article>
              ))
            )}
          </div>
          <DashboardV2Input
            label="PROM template key"
            value={promTemplateKey}
            onChange={(event) => onPromTemplateKeyChange(event.currentTarget.value)}
          />
          <DashboardV2Input
            label="Due date"
            type="datetime-local"
            value={promDueAt}
            onChange={(event) => onPromDueAtChange(event.currentTarget.value)}
          />
          {promSaveError ? <DashboardV2Text tone="caption" className="v2-patient-form-error">{promSaveError}</DashboardV2Text> : null}
          <div className="v2-patient-actions-row">
            <DashboardV2Button tone="secondary" size="sm" onPress={() => void onAssignProm()}>
              {isAssigningProm ? 'Assigning…' : 'Assign questionnaire'}
            </DashboardV2Button>
          </div>
          {completedProms.length > 0 ? (
            <div className="v2-patient-guidance-history">
              <DashboardV2Text tone="label">Recently completed</DashboardV2Text>
              {completedProms.slice(0, 3).map((item) => (
                <article key={item.id} className="v2-patient-guidance-history__item">
                  <DashboardV2Text as="strong" tone="strong">{item.title}</DashboardV2Text>
                  <DashboardV2Text tone="muted">
                    {new Date(item.completedAt).toLocaleString()} · {item.score?.bandLabel ?? 'No score'}
                  </DashboardV2Text>
                </article>
              ))}
            </div>
          ) : null}
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-guidance-card" tone="base">
          <div className="v2-patient-guidance-card__header">
            <div>
              <DashboardV2Text tone="label">Clinical guidance</DashboardV2Text>
              <DashboardV2Heading as="h3">Insights and review suggestions</DashboardV2Heading>
            </div>
            <DashboardV2Button tone="secondary" size="sm" onPress={() => void onGenerateInsights()}>
              {isGeneratingInsights ? 'Generating…' : 'Generate insights'}
            </DashboardV2Button>
          </div>
          {insightActionNotice ? <DashboardV2Text tone="caption">{insightActionNotice}</DashboardV2Text> : null}
          {insightActionError ? <DashboardV2Text tone="caption" className="v2-patient-form-error">{insightActionError}</DashboardV2Text> : null}
          <div className="v2-patient-guidance-list">
            {pendingInsights.length === 0 ? (
              <DashboardV2Text tone="muted">No pending guidance suggestions.</DashboardV2Text>
            ) : (
              pendingInsights.map((item) => (
                <article key={item.id} className="v2-patient-guidance-list__item">
                  <div className="v2-patient-guidance-list__meta">
                    <DashboardV2Badge tone={insightTone(item.confidence)}>{item.confidence}</DashboardV2Badge>
                    <DashboardV2Text tone="caption">{item.category}</DashboardV2Text>
                  </div>
                  <DashboardV2Text as="strong" tone="strong">{item.title}</DashboardV2Text>
                  <DashboardV2Text tone="muted">{item.message}</DashboardV2Text>
                  <div className="v2-patient-actions-row">
                    <DashboardV2Button
                      tone="secondary"
                      size="sm"
                      onPress={() => void onReviewInsight(item.id, 'approved')}
                    >
                      {insightReviewingId === `${item.id}:approved` ? 'Approving…' : 'Approve'}
                    </DashboardV2Button>
                    <DashboardV2Button
                      tone="ghost"
                      size="sm"
                      onPress={() => void onReviewInsight(item.id, 'rejected')}
                    >
                      {insightReviewingId === `${item.id}:rejected` ? 'Rejecting…' : 'Reject'}
                    </DashboardV2Button>
                  </div>
                </article>
              ))
            )}
          </div>
          {approvedInsights.length > 0 ? (
            <div className="v2-patient-guidance-history">
              <DashboardV2Text tone="label">Approved guidance</DashboardV2Text>
              {approvedInsights.slice(0, 3).map((item) => (
                <article key={item.id} className="v2-patient-guidance-history__item">
                  <DashboardV2Text as="strong" tone="strong">{item.title}</DashboardV2Text>
                  <DashboardV2Text tone="muted">{item.message}</DashboardV2Text>
                </article>
              ))}
            </div>
          ) : null}
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-guidance-card" tone="base">
          <DashboardV2Text tone="label">Recovery support</DashboardV2Text>
          <DashboardV2Heading as="h3">Check-in support configuration</DashboardV2Heading>
          <DashboardV2Select
            label="Check-in mode"
            selectedKey={recoverySupportDraft.checkinMode}
            onSelectionChange={(value) => onRecoverySupportCheckinModeChange(value as PatientRecoverySupportConfig['checkinMode'])}
            options={[
              { id: 'standard', label: 'Standard' },
              { id: 'adaptive', label: 'Adaptive' },
              { id: 'force_full', label: 'Force full' },
            ]}
          />
          <label className="v2-patient-checkbox">
            <input
              type="checkbox"
              checked={recoverySupportDraft.nudgesEnabled}
              onChange={(event) => onRecoverySupportNudgesEnabledChange(event.currentTarget.checked)}
            />
            <span>Nudges enabled</span>
          </label>
          <DashboardV2Select
            label="Temporary full-flow window"
            selectedKey={recoverySupportDraft.temporaryForceFullOption}
            onSelectionChange={(value) => onRecoverySupportTemporaryFullFlowOptionChange(value as TemporaryFullFlowOption)}
            options={(['off', '3d', '7d'] as TemporaryFullFlowOption[]).map((option) => ({
              id: option,
              label: temporaryFullFlowOptionLabel(option),
            }))}
          />
          <DashboardV2Textarea
            label="Clinical rationale"
            value={recoverySupportDraft.rationale}
            onChange={(event) => onRecoverySupportRationaleChange(event.currentTarget.value)}
          />
          {recoverySupportNotice ? <DashboardV2Text tone="caption">{recoverySupportNotice}</DashboardV2Text> : null}
          {recoverySupportError ? <DashboardV2Text tone="caption" className="v2-patient-form-error">{recoverySupportError}</DashboardV2Text> : null}
          <div className="v2-patient-actions-row">
            <DashboardV2Button tone="secondary" size="sm" onPress={() => void onSaveRecoverySupport()}>
              {isSavingRecoverySupport ? 'Saving…' : 'Save recovery support'}
            </DashboardV2Button>
          </div>
          <DashboardV2Text tone="caption">
            {patientRecoverySupport?.updatedAt
              ? `Last updated ${new Date(patientRecoverySupport.updatedAt).toLocaleString()}`
              : 'No patient-specific recovery-support override saved.'}
          </DashboardV2Text>
        </DashboardV2Surface>
      </div>

      <div className="v2-patient-guidance-footer">
        <DashboardV2Surface className="v2-patient-guidance-card" tone="muted">
          <DashboardV2Text tone="label">Exercise plan</DashboardV2Text>
          <DashboardV2Heading as="h3">{patientPlan ? `Version ${patientPlan.version}` : 'No plan assigned'}</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            {patientPlan
              ? `${patientPlan.items.length} exercise${patientPlan.items.length === 1 ? '' : 's'} in the current plan.`
              : 'The plan route remains the linked destination for structured exercise programming.'}
          </DashboardV2Text>
        </DashboardV2Surface>

        <DashboardV2Surface className="v2-patient-guidance-card" tone="muted">
          <DashboardV2Text tone="label">Caregiver access</DashboardV2Text>
          <DashboardV2Heading as="h3">{activeCaregiverAccessItems.length} active</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Caregiver access remains reference context here and does not replace clinician coordination.
          </DashboardV2Text>
        </DashboardV2Surface>
      </div>
    </div>
  );
}
