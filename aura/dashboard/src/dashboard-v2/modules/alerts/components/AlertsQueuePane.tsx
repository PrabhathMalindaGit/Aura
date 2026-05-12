import type { KeyboardEvent } from 'react';
import { AlertTriangle, MessageSquareMore, RefreshCcw, Search } from 'lucide-react';
import type { AlertStatus } from '../../../../types/models';
import type {
  AlertQueueRowVm,
  AlertsSortOrder,
  AlertsSourceFilter,
  AlertsTimeRangeFilter,
} from '../../../adapters/alerts';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Input } from '../../../primitives/Input';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { AlertQueueRow } from './AlertQueueRow';

interface AlertsQueuePaneProps {
  status: AlertStatus;
  searchValue: string;
  sourceFilter: AlertsSourceFilter;
  timeRange: AlertsTimeRangeFilter;
  sortOrder: AlertsSortOrder;
  unseenOnly: boolean;
  assignedToMeOnly: boolean;
  unassignedOnly: boolean;
  overriddenOnly: boolean;
  disabled?: boolean;
  loading: boolean;
  chatOriginNote: string | null;
  rows: AlertQueueRowVm[];
  selectedAlertId: string | null;
  filterCount: number;
  statusTitle?: string;
  statusDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (value: AlertsSourceFilter) => void;
  onTimeRangeChange: (value: AlertsTimeRangeFilter) => void;
  onSortOrderChange: (value: AlertsSortOrder) => void;
  onUnseenOnlyChange: (value: boolean) => void;
  onAssignedToMeOnlyChange: (value: boolean) => void;
  onUnassignedOnlyChange: (value: boolean) => void;
  onOverriddenOnlyChange: (value: boolean) => void;
  onReset: () => void;
  onSelect: (alertId: string) => void;
  queueRef?: React.RefObject<HTMLDivElement | null>;
  onQueueScroll?: (scrollTop: number) => void;
}

const SOURCE_OPTIONS = [
  { id: 'all', label: 'All sources' },
  { id: 'checkin', label: 'Check-ins' },
  { id: 'chat', label: 'Chat alerts' },
] as const;

const TIME_OPTIONS = [
  { id: '24h', label: 'Past 24h' },
  { id: '7d', label: 'Past 7d' },
  { id: '30d', label: 'Past 30d' },
] as const;

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'patient-asc', label: 'Patient A-Z' },
] as const;

interface QueueFilterSelectProps<TValue extends string> {
  label: string;
  value: TValue;
  options: ReadonlyArray<{ id: TValue; label: string }>;
  disabled: boolean;
  onChange: (value: TValue) => void;
}

function QueueFilterSelect<TValue extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: QueueFilterSelectProps<TValue>): JSX.Element {
  return (
    <label className="v2-alerts-queue-pane__native-select">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value as TValue)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function moveAlertQueueFocus(event: KeyboardEvent<HTMLButtonElement>): void {
  const list = event.currentTarget.closest<HTMLElement>('[data-alert-queue-list="true"]');
  const rows = Array.from(list?.querySelectorAll<HTMLButtonElement>('button[data-row-index]') ?? []);
  const currentIndex = rows.indexOf(event.currentTarget);

  if (currentIndex < 0 || rows.length === 0) {
    return;
  }

  let nextIndex = currentIndex;

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = Math.min(currentIndex + 1, rows.length - 1);
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = Math.max(currentIndex - 1, 0);
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = rows.length - 1;
  } else {
    return;
  }

  if (nextIndex !== currentIndex) {
    event.preventDefault();
    rows[nextIndex]?.focus();
  }
}

export function AlertsQueuePane({
  status,
  searchValue,
  sourceFilter,
  timeRange,
  sortOrder,
  unseenOnly,
  assignedToMeOnly,
  unassignedOnly,
  overriddenOnly,
  disabled = false,
  loading,
  chatOriginNote,
  rows,
  selectedAlertId,
  filterCount,
  statusTitle,
  statusDescription,
  emptyTitle,
  emptyDescription,
  onRetry,
  onSearchChange,
  onSourceFilterChange,
  onTimeRangeChange,
  onSortOrderChange,
  onUnseenOnlyChange,
  onAssignedToMeOnlyChange,
  onUnassignedOnlyChange,
  onOverriddenOnlyChange,
  onReset,
  onSelect,
  queueRef,
  onQueueScroll,
}: AlertsQueuePaneProps): JSX.Element {
  const openStatusView = status === 'open';

  return (
    <DashboardV2Surface className="v2-alerts-queue-pane" tone="base">
      <div className="v2-alerts-queue-pane__header">
        <div>
          <DashboardV2Text tone="label">Alert queue</DashboardV2Text>
          <DashboardV2Heading as="h2">Alert queue</DashboardV2Heading>
        </div>
      </div>

      {chatOriginNote ? (
        <DashboardV2Surface className="v2-alerts-queue-pane__note" tone="muted">
          <MessageSquareMore size={16} />
          <DashboardV2Text tone="muted">{chatOriginNote}</DashboardV2Text>
        </DashboardV2Surface>
      ) : null}

      <div className="v2-alerts-queue-pane__filters">
        <div className="v2-alerts-queue-pane__search">
          <Search size={16} aria-hidden="true" />
          <DashboardV2Input
            label="Search alerts"
            labelHidden
            value={searchValue}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder="Search patient, alert id, reason, or source"
            isDisabled={disabled}
          />
        </div>

        <div className="v2-alerts-queue-pane__selects">
          <QueueFilterSelect
            label="Source"
            value={sourceFilter}
            options={SOURCE_OPTIONS}
            disabled={disabled}
            onChange={onSourceFilterChange}
          />
          <QueueFilterSelect
            label="Time range"
            value={timeRange}
            options={TIME_OPTIONS}
            disabled={disabled}
            onChange={onTimeRangeChange}
          />
          <QueueFilterSelect
            label="Sort"
            value={sortOrder}
            options={SORT_OPTIONS}
            disabled={disabled}
            onChange={onSortOrderChange}
          />
        </div>

        {openStatusView ? (
          <div className="v2-alerts-queue-pane__toggles" aria-label="Open alert filters">
            <DashboardV2Button
              tone={unseenOnly ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => onUnseenOnlyChange(!unseenOnly)}
              isDisabled={disabled}
              aria-pressed={unseenOnly}
            >
              Unseen only
            </DashboardV2Button>
            <DashboardV2Button
              tone={assignedToMeOnly ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => onAssignedToMeOnlyChange(!assignedToMeOnly)}
              isDisabled={disabled}
              aria-pressed={assignedToMeOnly}
            >
              Assigned to me
            </DashboardV2Button>
            <DashboardV2Button
              tone={unassignedOnly ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => onUnassignedOnlyChange(!unassignedOnly)}
              isDisabled={disabled}
              aria-pressed={unassignedOnly}
            >
              Unassigned
            </DashboardV2Button>
            <DashboardV2Button
              tone={overriddenOnly ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => onOverriddenOnlyChange(!overriddenOnly)}
              isDisabled={disabled}
              aria-pressed={overriddenOnly}
            >
              Override active
            </DashboardV2Button>
          </div>
        ) : null}

        {filterCount > 0 ? (
          <DashboardV2Button tone="ghost" size="sm" onPress={onReset}>
            Reset filters
          </DashboardV2Button>
        ) : null}
      </div>

      <div
        ref={queueRef}
        className="v2-alerts-queue-pane__body"
        onScroll={(event) => onQueueScroll?.(event.currentTarget.scrollTop)}
        data-testid="v2-alerts-queue-pane"
      >
        {loading ? (
          <div className="v2-alerts-queue-pane__skeleton" aria-label="Alert queue loading">
            <div className="v2-alerts-skeleton v2-alerts-skeleton--row" />
            <div className="v2-alerts-skeleton v2-alerts-skeleton--row" />
            <div className="v2-alerts-skeleton v2-alerts-skeleton--row" />
          </div>
        ) : statusTitle ? (
          <DashboardV2Surface className="v2-alerts-queue-pane__empty" tone="muted">
            <AlertTriangle size={18} />
            <DashboardV2Heading as="h3">{statusTitle}</DashboardV2Heading>
            {statusDescription ? <DashboardV2Text tone="muted">{statusDescription}</DashboardV2Text> : null}
            {onRetry ? (
              <DashboardV2Button
                tone="secondary"
                size="sm"
                onPress={onRetry}
                leadingIcon={<RefreshCcw size={16} />}
              >
                Retry
              </DashboardV2Button>
            ) : null}
          </DashboardV2Surface>
        ) : rows.length === 0 ? (
          <DashboardV2Surface className="v2-alerts-queue-pane__empty" tone="muted">
            <DashboardV2Heading as="h3">{emptyTitle ?? 'No alerts match this view'}</DashboardV2Heading>
            {emptyDescription ? <DashboardV2Text tone="muted">{emptyDescription}</DashboardV2Text> : null}
            <DashboardV2Button tone="secondary" size="sm" onPress={onReset}>
              Reset filters
            </DashboardV2Button>
          </DashboardV2Surface>
        ) : (
          <ul className="v2-alerts-queue-pane__list" data-alert-queue-list="true" aria-label="Alert queue">
            {rows.map((row, index) => (
              <li key={row.key} className="v2-alerts-queue-pane__item">
                <AlertQueueRow
                  row={row}
                  selected={row.alertId === selectedAlertId}
                  rowIndex={index}
                  onKeyDown={moveAlertQueueFocus}
                  onSelect={() => onSelect(row.alertId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardV2Surface>
  );
}
