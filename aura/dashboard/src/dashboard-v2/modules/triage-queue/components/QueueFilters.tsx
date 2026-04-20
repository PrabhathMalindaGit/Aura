import { Filter } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Disclosure } from '../../../primitives/Disclosure';
import { DashboardV2Input } from '../../../primitives/Input';
import { DashboardV2Select } from '../../../primitives/Select';
import { DashboardV2Text } from '../../../primitives/Text';
import type { WorklistFilters as WorklistFiltersState } from '../../../../utils/worklist';

interface QueueFiltersProps {
  filters: WorklistFiltersState;
  activeFilterCount: number;
  disabled?: boolean;
  isCompactLayout: boolean;
  isVeryNarrow: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilter: (
    key:
      | 'highRiskOnly'
      | 'hasOpenAlerts'
      | 'needsResponse'
      | 'missedCheckins'
      | 'needsPromReview'
      | 'assignedToMe',
  ) => void;
  onStatusChange: (value: WorklistFiltersState['status']) => void;
  onSortChange: (value: WorklistFiltersState['sort']) => void;
  onReset: () => void;
}

const STATUS_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'discharged', label: 'Discharged' },
  { id: 'inactive', label: 'Inactive' },
];

const SORT_OPTIONS = [
  { id: 'priority', label: 'Priority' },
  { id: 'updatedAt', label: 'Updated' },
  { id: 'lastCheckinAt', label: 'Last check-in' },
  { id: 'patientName', label: 'Patient name' },
  { id: 'nextAppointmentAt', label: 'Next appointment' },
];

const PRIMARY_TOGGLES: Array<{
  key: 'highRiskOnly' | 'needsResponse' | 'hasOpenAlerts';
  label: string;
}> = [
  { key: 'highRiskOnly', label: 'High risk' },
  { key: 'needsResponse', label: 'Needs response' },
  { key: 'hasOpenAlerts', label: 'Open alerts' },
];

const SECONDARY_TOGGLES: Array<{
  key: 'missedCheckins' | 'needsPromReview' | 'assignedToMe';
  label: string;
}> = [
  { key: 'missedCheckins', label: 'Missed check-ins' },
  { key: 'needsPromReview', label: 'PROMs due' },
  { key: 'assignedToMe', label: 'Assigned to me' },
];

function renderToggleGroup({
  filters,
  disabled,
  onToggleFilter,
}: Pick<QueueFiltersProps, 'filters' | 'disabled' | 'onToggleFilter'>): JSX.Element {
  return (
    <>
      <div className="triage-queue-filters__toggle-group" role="group" aria-label="Priority focus filters">
        {PRIMARY_TOGGLES.map((filter) => (
          <DashboardV2Button
            key={filter.key}
            tone={filters[filter.key] ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => onToggleFilter(filter.key)}
            aria-pressed={filters[filter.key]}
            isDisabled={disabled}
          >
            {filter.label}
          </DashboardV2Button>
        ))}
      </div>

      <div className="triage-queue-filters__toggle-group" role="group" aria-label="Additional queue filters">
        {SECONDARY_TOGGLES.map((filter) => (
          <DashboardV2Button
            key={filter.key}
            tone={filters[filter.key] ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => onToggleFilter(filter.key)}
            aria-pressed={filters[filter.key]}
            isDisabled={disabled}
          >
            {filter.label}
          </DashboardV2Button>
        ))}
      </div>
    </>
  );
}

export function QueueFilters({
  filters,
  activeFilterCount,
  disabled = false,
  isCompactLayout,
  isVeryNarrow,
  onSearchChange,
  onToggleFilter,
  onStatusChange,
  onSortChange,
  onReset,
}: QueueFiltersProps): JSX.Element {
  const advancedFilters = (
    <div className="triage-queue-filters__advanced">
      <div className="triage-queue-filters__controls">
        <DashboardV2Select
          label="Status"
          options={STATUS_OPTIONS}
          selectedKey={filters.status}
          onSelectionChange={(value) => onStatusChange(value as WorklistFiltersState['status'])}
          isDisabled={disabled}
        />
      </div>
      {renderToggleGroup({ filters, disabled, onToggleFilter })}
      <div className="triage-queue-filters__footer">
        <DashboardV2Button tone="ghost" size="sm" onPress={onReset} isDisabled={disabled}>
          Reset filters
        </DashboardV2Button>
      </div>
    </div>
  );

  return (
    <div className="triage-queue-filters">
      <div className="triage-queue-filters__primary">
        <DashboardV2Input
          label="Search worklist"
          name="triage-queue-search"
          type="search"
          value={filters.search}
          placeholder="Search patient name or ID"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          isDisabled={disabled}
        />
        <DashboardV2Select
          className="triage-queue-filters__sort-inline"
          label="Sort"
          options={SORT_OPTIONS}
          selectedKey={filters.sort}
          onSelectionChange={(value) => onSortChange(value as WorklistFiltersState['sort'])}
          isDisabled={disabled}
        />
      </div>

      {isCompactLayout || isVeryNarrow ? (
        <DashboardV2Disclosure
          className="triage-queue-filters__disclosure"
          title="Filters"
          summary={activeFilterCount > 0 ? `${activeFilterCount} active` : 'No additional filters'}
          defaultExpanded={activeFilterCount > 0}
        >
          {advancedFilters}
        </DashboardV2Disclosure>
      ) : (
        <div className="triage-queue-filters__expanded">
          <div className="triage-queue-filters__toolbar">
            <DashboardV2Text tone="label">Filter the queue</DashboardV2Text>
            <span className="triage-queue-filters__count">
              <Filter size={14} />
              {activeFilterCount > 0 ? `${activeFilterCount} active` : 'No additional filters'}
            </span>
          </div>
          {advancedFilters}
        </div>
      )}
    </div>
  );
}
