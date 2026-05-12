import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Disclosure } from '../../../primitives/Disclosure';
import { DashboardV2Input } from '../../../primitives/Input';
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
  { id: 'all', label: 'Any status' },
  { id: 'active', label: 'Active' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'discharged', label: 'Discharged' },
  { id: 'inactive', label: 'Inactive' },
];

const SORT_OPTIONS = [
  { id: 'priority', label: 'Highest priority' },
  { id: 'updatedAt', label: 'Most recent update' },
  { id: 'lastCheckinAt', label: 'Longest delayed response' },
  { id: 'patientName', label: 'Name A-Z' },
];

const QUICK_FILTERS: Array<{
  key: 'highRiskOnly' | 'needsResponse' | 'hasOpenAlerts';
  label: string;
}> = [
  { key: 'highRiskOnly', label: 'High risk' },
  { key: 'needsResponse', label: 'Needs response' },
  { key: 'hasOpenAlerts', label: 'Open alerts' },
];

const SUPPORT_FILTERS: Array<{
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
    <div className="triage-queue-filters__quick-row">
      <div className="triage-queue-filters__toggle-group" role="group" aria-label="Queue quick filters">
        {[...QUICK_FILTERS, ...SUPPORT_FILTERS].map((filter) => (
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
    </div>
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
        <label className="v2-field triage-queue-filters__native-field">
          <span className="v2-field__label">Status</span>
          <select
            className="triage-queue-filters__native-select"
            value={filters.status}
            onChange={(event) => onStatusChange(event.currentTarget.value as WorklistFiltersState['status'])}
            disabled={disabled}
            aria-label="Filter patients in review by status"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
          label="Search patients"
          name="triage-queue-search"
          type="search"
          value={filters.search}
          placeholder="Name, ID, reason, or signal"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          isDisabled={disabled}
        />
        <label className="v2-field triage-queue-filters__native-field triage-queue-filters__sort-inline">
          <span className="v2-field__label">Sort</span>
          <select
            className="triage-queue-filters__native-select"
            value={filters.sort}
            onChange={(event) => onSortChange(event.currentTarget.value as WorklistFiltersState['sort'])}
            disabled={disabled}
            aria-label="Sort patients in review"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
          {advancedFilters}
        </div>
      )}
    </div>
  );
}
