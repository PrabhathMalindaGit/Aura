import type { AlertQueueRowVm, AlertsBadgeTone } from '../../../adapters/alerts';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2ClinicianQueueRow } from '../../../patterns/ClinicianQueueRow';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Text } from '../../../primitives/Text';

interface AlertQueueRowProps {
  row: AlertQueueRowVm;
  selected: boolean;
  isVeryNarrow: boolean;
  onSelect: () => void;
}

function mapBadgeTone(tone: AlertsBadgeTone): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
  if (tone === 'critical') {
    return 'safety';
  }

  if (tone === 'warning') {
    return 'delayed';
  }

  if (tone === 'success') {
    return 'clear';
  }

  if (tone === 'info') {
    return 'info';
  }

  return 'unknown';
}

export function AlertQueueRow({
  row,
  selected,
  isVeryNarrow,
  onSelect,
}: AlertQueueRowProps): JSX.Element {
  return (
    <DashboardV2ClinicianQueueRow
      className={[
        'v2-alert-row',
        `v2-alert-row--${row.severityTone}`,
      ]
        .filter(Boolean)
        .join(' ')}
      tone={
        row.severityTone === 'critical'
          ? 'critical'
          : row.severityTone === 'warning'
            ? 'warning'
            : row.severityTone === 'success'
              ? 'success'
              : 'neutral'
      }
      selected={selected}
      onPress={onSelect}
      testId={`v2-alert-row-${row.alertId}`}
    >
      <div className="v2-alert-row__topline">
        <div className="v2-alert-row__identity">
          <DashboardV2ClinicianPatientAnchor
            patientLabel={row.patientName}
            tone={
              row.severityTone === 'critical'
                ? 'critical'
                : row.severityTone === 'warning'
                  ? 'warning'
                  : row.severityTone === 'success'
                    ? 'success'
                    : 'neutral'
            }
          />
          <DashboardV2Text tone="label">{row.patientId}</DashboardV2Text>
          <DashboardV2Text as="span" tone="caption">{row.sourceLabel}</DashboardV2Text>
        </div>
        <div className="v2-alert-row__meta">
          <DashboardV2Badge tone={mapBadgeTone(row.severityTone)}>
            {row.severityLabel}
          </DashboardV2Badge>
          <DashboardV2Badge tone={mapBadgeTone(row.statusTone)}>
            {row.statusLabel}
          </DashboardV2Badge>
        </div>
      </div>

      <div className="v2-alert-row__body">
        <div className="v2-alert-row__copy">
          <strong className="v2-alert-row__name">{row.patientName}</strong>
          <span className="v2-alert-row__reason">{row.reason}</span>
          <DashboardV2Text tone="muted" className="v2-alert-row__support">
            {row.supportLine}
          </DashboardV2Text>
        </div>

        <div className="v2-alert-row__freshness" title={row.freshnessTitle}>
          <DashboardV2Text tone="label">{isVeryNarrow ? 'Age' : 'Freshness'}</DashboardV2Text>
          <strong>{row.freshnessLabel}</strong>
        </div>
      </div>

      {row.stateBadges.length > 0 ? (
        <div className="v2-alert-row__badges">
          {row.stateBadges.map((badge) => (
            <DashboardV2Badge key={`${row.alertId}-${badge.label}`} tone={mapBadgeTone(badge.tone)}>
              {badge.label}
            </DashboardV2Badge>
          ))}
        </div>
      ) : null}
    </DashboardV2ClinicianQueueRow>
  );
}
