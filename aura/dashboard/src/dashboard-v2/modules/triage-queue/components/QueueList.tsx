import type { KeyboardEvent } from 'react';
import { cn } from '../../../../utils/cn';
import {
  getLeadSignalTone,
  type TriageQueueRowVm,
  type TriageSignalChipVm,
} from '../../../adapters/worklist';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Text } from '../../../primitives/Text';

interface QueueListProps {
  rows: TriageQueueRowVm[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

function mapStatusTone(tone: TriageQueueRowVm['statusTone']): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
  if (tone === 'success') {
    return 'success';
  }

  if (tone === 'warning') {
    return 'warning';
  }

  return 'neutral';
}

function mapSignalChipTone(chip: TriageSignalChipVm): React.ComponentProps<typeof DashboardV2Badge>['tone'] {
  if (chip.tone === 'critical') {
    return 'critical';
  }

  if (chip.tone === 'warning') {
    return 'warning';
  }

  if (chip.tone === 'info') {
    return 'info';
  }

  return 'neutral';
}

function moveFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  direction: 'next' | 'prev',
): void {
  const current = event.currentTarget;
  const index = Number(current.dataset.rowIndex ?? '0');
  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  const list = current.closest<HTMLElement>('[data-triage-queue-list="true"]');
  const nextButton = list?.querySelector<HTMLButtonElement>(`button[data-row-index="${nextIndex}"]`);

  if (nextButton) {
    event.preventDefault();
    nextButton.focus();
  }
}

export function QueueList({
  rows,
  selectedKey,
  onSelect,
}: QueueListProps): JSX.Element {
  return (
    <ul className="triage-queue-list" data-triage-queue-list="true">
      {rows.map((row, index) => {
        const isSelected = row.key === selectedKey;
        const rowTone = row.priorityTone;
        const rowTestId = row.patientId.trim() || row.key;

        return (
          <li key={row.key} className="triage-queue-list__item">
            <button
              type="button"
              data-row-index={index}
              data-testid={`triage-queue-row-${rowTestId}`}
              className={cn(
                'triage-queue-row',
                `triage-queue-row--${rowTone}`,
                isSelected && 'triage-queue-row--selected',
              )}
              onClick={() => onSelect(row.key)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  moveFocus(event, 'next');
                  return;
                }

                if (event.key === 'ArrowUp') {
                  moveFocus(event, 'prev');
                }
              }}
              aria-current={isSelected ? 'true' : undefined}
              aria-describedby={`triage-queue-row-freshness-${row.key}`}
            >
              <div className="triage-queue-row__topline">
                <div className="triage-queue-row__identity">
                  <strong className="triage-queue-row__name">{row.patientName}</strong>
                  <DashboardV2Badge tone={mapStatusTone(row.statusTone)}>
                    {row.statusLabel}
                  </DashboardV2Badge>
                </div>
                <DashboardV2Badge tone={row.priorityTone}>
                  {row.priorityLabel}
                </DashboardV2Badge>
              </div>

              <div className="triage-queue-row__meta">
                {row.patientId.trim() ? <span>ID: {row.patientId.trim()}</span> : <span>ID: Unknown</span>}
                {row.rehabPhase ? <span>{row.rehabPhase}</span> : null}
              </div>

              <div className="triage-queue-row__reason">
                <DashboardV2Badge tone={getLeadSignalTone(row.leadSignal)}>
                  {row.leadSignal.label}
                </DashboardV2Badge>
                <DashboardV2Text as="span" tone="strong">
                  {row.whyNow}
                </DashboardV2Text>
              </div>

              <div className="triage-queue-row__support">
                {row.supportingChips.slice(0, 2).map((chip) => (
                  <DashboardV2Badge key={`${row.key}-${chip.label}`} tone={mapSignalChipTone(chip)}>
                    {chip.label}
                  </DashboardV2Badge>
                ))}
              </div>

              <p
                id={`triage-queue-row-freshness-${row.key}`}
                className="triage-queue-row__freshness"
                title={row.freshnessTitle}
              >
                {row.freshnessLine}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
