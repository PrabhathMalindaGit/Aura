import type { KeyboardEvent } from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import type { AlertQueueRowVm, AlertsBadgeTone } from '../../../adapters/alerts';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2ClinicianQueueRow } from '../../../patterns/ClinicianQueueRow';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Text } from '../../../primitives/Text';

interface AlertQueueRowProps {
  row: AlertQueueRowVm;
  selected: boolean;
  rowIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
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
  rowIndex,
  onKeyDown,
  onSelect,
}: AlertQueueRowProps): JSX.Element {
  return (
    <DashboardV2ClinicianQueueRow
      className={[
        'v2-alert-row',
        `v2-alert-row--${row.severityTone}`,
        selected ? 'v2-alert-row--selected' : '',
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
      onKeyDown={onKeyDown}
      rowIndex={rowIndex}
      testId={`v2-alert-row-${row.alertId}`}
    >
      <div className="v2-alert-row__card-main">
        <div className="v2-alert-row__anchor">
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
            size="md"
          />
        </div>

        <div className="v2-alert-row__copy">
          <strong className="v2-alert-row__name">{row.patientName}</strong>
          <span className="v2-alert-row__reason">{row.reason}</span>
        </div>
      </div>

      <div className="v2-alert-row__badges">
        <DashboardV2Badge tone={mapBadgeTone(row.statusTone)}>
          {row.statusLabel}
        </DashboardV2Badge>
        <DashboardV2Badge tone={mapBadgeTone(row.severityTone)}>
          {row.severityLabel}
        </DashboardV2Badge>
        {row.stateBadges.map((badge) => (
          <DashboardV2Badge key={`${row.alertId}-${badge.label}`} tone={mapBadgeTone(badge.tone)}>
            {badge.label}
          </DashboardV2Badge>
        ))}
      </div>

      <div className="v2-alert-row__footer">
        <DashboardV2Text tone="caption" className="v2-alert-row__support">
          {row.supportLine || row.sourceLabel}
        </DashboardV2Text>
        <span className="v2-alert-row__freshness" title={row.freshnessTitle}>
          <Clock3 size={13} aria-hidden="true" />
          <span>{row.freshnessLabel}</span>
        </span>
      </div>

      {selected ? (
        <span className="v2-alert-row__selected-indicator" aria-label="Selected alert">
          <CheckCircle2 size={18} />
        </span>
      ) : null}
    </DashboardV2ClinicianQueueRow>
  );
}
