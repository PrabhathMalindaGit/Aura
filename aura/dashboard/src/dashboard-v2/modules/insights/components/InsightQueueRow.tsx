import type { InsightQueueRowVm, InsightsBadgeTone } from '../../../adapters/insights';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Text } from '../../../primitives/Text';

interface InsightQueueRowProps {
  row: InsightQueueRowVm;
  selected: boolean;
  checked: boolean;
  isVeryNarrow: boolean;
  onSelect: () => void;
  onToggle?: (checked: boolean) => void;
}

function mapBadgeTone(tone: InsightsBadgeTone): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
  if (tone === 'critical') {
    return 'critical';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'success') {
    return 'success';
  }
  if (tone === 'info') {
    return 'info';
  }
  return 'unknown';
}

export function InsightQueueRow({
  row,
  selected,
  checked,
  isVeryNarrow,
  onSelect,
  onToggle,
}: InsightQueueRowProps): JSX.Element {
  return (
    <div className="v2-insight-row-shell">
      {row.selectable && onToggle ? (
        <label className="v2-insight-row-shell__check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onToggle(event.currentTarget.checked)}
            aria-label={`Select ${row.title}`}
          />
        </label>
      ) : null}

      <button
        type="button"
        className={[
          'v2-insight-row',
          `v2-insight-row--${row.priorityTone}`,
          selected ? 'v2-insight-row--selected' : null,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={selected}
        onClick={onSelect}
        data-testid={`v2-insight-row-${row.insightId}`}
      >
        <div className="v2-insight-row__topline">
          <div className="v2-insight-row__identity">
            <DashboardV2Text tone="label">{row.patientId}</DashboardV2Text>
            <DashboardV2Text as="span" tone="caption">
              {row.categoryLabel}
            </DashboardV2Text>
          </div>
          <div className="v2-insight-row__meta">
            <DashboardV2Badge tone={mapBadgeTone(row.priorityTone)}>
              {isVeryNarrow ? row.priorityLabel : row.priorityLabel}
            </DashboardV2Badge>
            <DashboardV2Badge tone={mapBadgeTone(row.statusTone)}>
              {row.statusLabel}
            </DashboardV2Badge>
          </div>
        </div>

        <div className="v2-insight-row__body">
          <DashboardV2ClinicianPatientAnchor
            patientLabel={row.patientName}
            tone={
              row.priorityTone === 'critical'
                ? 'critical'
                : row.priorityTone === 'warning'
                  ? 'warning'
                  : row.priorityTone === 'success'
                    ? 'success'
                    : 'neutral'
            }
          />
          <div className="v2-insight-row__copy">
            <strong className="v2-insight-row__name">{row.patientName}</strong>
            <span className="v2-insight-row__title">{row.title}</span>
            <DashboardV2Text tone="muted" className="v2-insight-row__support">
              {row.supportLine}
            </DashboardV2Text>
          </div>

          <div className="v2-insight-row__timing" title={row.createdTitle}>
            <DashboardV2Text tone="label">{isVeryNarrow ? 'Age' : 'Created'}</DashboardV2Text>
            <strong>{row.createdLabel}</strong>
          </div>
        </div>

        <div className="v2-insight-row__badges">
          <DashboardV2Badge tone={mapBadgeTone(row.confidenceTone)}>
            {row.confidenceLabel}
          </DashboardV2Badge>
          <DashboardV2Text tone="muted" className="v2-insight-row__preview">
            {row.messagePreview}
          </DashboardV2Text>
        </div>
      </button>
    </div>
  );
}
