import { Link } from 'react-router-dom';
import { PanelRightOpen } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import type { PatientWorkspaceHeaderVm } from '../../../adapters/patientWorkspace';

interface PatientWorkspaceHeaderProps {
  header: PatientWorkspaceHeaderVm;
  selectedDays: 14 | 30;
  onSelectDays: (days: 14 | 30) => void;
  showSupportAction?: boolean;
  onOpenSupport?: () => void;
  children?: React.ReactNode;
}

export function PatientWorkspaceHeader({
  header,
  selectedDays,
  onSelectDays,
  showSupportAction = false,
  onOpenSupport,
  children,
}: PatientWorkspaceHeaderProps): JSX.Element {
  return (
    <header className="v2-patient-header v2-surface v2-surface--elevated">
      <div className="v2-patient-header__topline">
        <div className="v2-patient-header__return">
          <Link
            to={header.returnTo}
            className="v2-patient-header__return-link"
            data-testid="v2-patient-return-link"
          >
            {header.returnLabel}
          </Link>
          {header.sourceCue ? (
            <DashboardV2Text as="span" tone="caption" className="v2-patient-header__source-cue">
              {header.sourceCue}
            </DashboardV2Text>
          ) : null}
        </div>

        <div className="v2-patient-header__actions">
          <div className="v2-patient-header__days" aria-label="Review window">
            <DashboardV2Button
              tone={selectedDays === 14 ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => onSelectDays(14)}
              aria-pressed={selectedDays === 14}
              data-testid="v2-patient-days-14"
            >
              14 days
            </DashboardV2Button>
            <DashboardV2Button
              tone={selectedDays === 30 ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => onSelectDays(30)}
              aria-pressed={selectedDays === 30}
              data-testid="v2-patient-days-30"
            >
              30 days
            </DashboardV2Button>
          </div>

          {showSupportAction && onOpenSupport ? (
            <DashboardV2Button
              tone="ghost"
              size="sm"
              onPress={onOpenSupport}
              leadingIcon={<PanelRightOpen size={16} />}
            >
              Context
            </DashboardV2Button>
          ) : null}
        </div>
      </div>

      <div className="v2-patient-header__identity-row">
        <div className="v2-patient-header__identity-copy">
          <DashboardV2Text tone="label">Patient workspace</DashboardV2Text>
          <div className="v2-patient-header__name-row">
            <DashboardV2Heading as="h1" className="v2-patient-header__name">
              {header.patientName}
            </DashboardV2Heading>
            <DashboardV2Badge tone={header.statusTone}>{header.statusLabel}</DashboardV2Badge>
          </div>
          <div className="v2-patient-header__meta">
            <DashboardV2Text as="span" tone="muted">
              ID: {header.patientId}
            </DashboardV2Text>
            {header.rehabPhaseLabel ? (
              <DashboardV2Text as="span" tone="muted">
                {header.rehabPhaseLabel}
              </DashboardV2Text>
            ) : null}
            <DashboardV2Text
              as="span"
              tone="muted"
              title={header.lastActivityTitle}
            >
              {header.lastActivityLabel}
            </DashboardV2Text>
          </div>
        </div>

        <div className="v2-patient-header__facts" aria-label="Immediate patient facts">
          {header.facts.map((fact) => (
            <article key={fact.label} className="v2-patient-header__fact">
              <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
              <DashboardV2Text as="strong" tone="strong">
                {fact.value}
              </DashboardV2Text>
              <DashboardV2Text tone="muted">{fact.note}</DashboardV2Text>
            </article>
          ))}
        </div>
      </div>

      <div className="v2-patient-header__subnav">
        {children}
      </div>
    </header>
  );
}
