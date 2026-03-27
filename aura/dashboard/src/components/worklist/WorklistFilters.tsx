import type { WorklistSortOption } from '../../types/models';
import type { WorklistFilters, WorklistStatusFilter } from '../../utils/worklist';
import { Button } from '../ui/Button';

interface WorklistFiltersProps {
  filters: WorklistFilters;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilter: (
    key: 'highRiskOnly' | 'hasOpenAlerts' | 'needsResponse' | 'missedCheckins' | 'needsPromReview' | 'assignedToMe',
  ) => void;
  onStatusChange: (value: WorklistStatusFilter) => void;
  onSortChange: (value: WorklistSortOption) => void;
  onReset: () => void;
}

const TOGGLE_FILTERS: Array<{
  key: 'highRiskOnly' | 'hasOpenAlerts' | 'needsResponse' | 'missedCheckins' | 'needsPromReview' | 'assignedToMe';
  label: string;
}> = [
  { key: 'highRiskOnly', label: 'High risk' },
  { key: 'hasOpenAlerts', label: 'Open alerts' },
  { key: 'needsResponse', label: 'Needs response' },
  { key: 'missedCheckins', label: 'Missed check-ins' },
  { key: 'needsPromReview', label: 'PROMs due' },
  { key: 'assignedToMe', label: 'Assigned to me' },
];

export function WorklistFilters({
  filters,
  disabled = false,
  onSearchChange,
  onToggleFilter,
  onStatusChange,
  onSortChange,
  onReset,
}: WorklistFiltersProps): JSX.Element {
  return (
    <section className="worklist-filters" aria-label="Worklist filters">
      <div className="worklist-filters__toolbar">
        <div className="worklist-filters__cluster worklist-filters__cluster--search">
          <div className="worklist-filters__cluster-heading">
            <span className="worklist-filters__cluster-label">Find patient</span>
            <p className="worklist-filters__cluster-support">
              Search the live queue by patient name or ID.
            </p>
          </div>
          <label className="worklist-filters__search form-field">
            <span className="worklist-filters__label">Search worklist</span>
            <input
              aria-label="Search worklist"
              type="search"
              value={filters.search}
              placeholder="Search by patient name or ID"
              onChange={(event) => onSearchChange(event.target.value)}
              disabled={disabled}
            />
          </label>
        </div>

        <div className="worklist-filters__cluster worklist-filters__cluster--selects">
          <div className="worklist-filters__cluster-heading">
            <span className="worklist-filters__cluster-label">Queue controls</span>
            <p className="worklist-filters__cluster-support">
              Adjust status and sort without leaving the active review surface.
            </p>
          </div>
          <div className="worklist-filters__select-row">
            <label className="worklist-filters__control form-field">
              <span className="worklist-filters__label">Status</span>
              <select
                aria-label="Filter worklist by status"
                value={filters.status}
                onChange={(event) => onStatusChange(event.target.value as WorklistStatusFilter)}
                disabled={disabled}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="discharged">Discharged</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label className="worklist-filters__control form-field">
              <span className="worklist-filters__label">Sort</span>
              <select
                aria-label="Sort worklist"
                value={filters.sort}
                onChange={(event) => onSortChange(event.target.value as WorklistSortOption)}
                disabled={disabled}
              >
                <option value="priority">Priority</option>
                <option value="updatedAt">Updated</option>
                <option value="lastCheckinAt">Last check-in</option>
                <option value="patientName">Patient name</option>
                <option value="nextAppointmentAt">Next appointment</option>
              </select>
            </label>

            <Button
              className="worklist-filters__reset"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={disabled}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="worklist-filters__cluster worklist-filters__cluster--toggles">
        <div className="worklist-filters__cluster-heading">
          <span className="worklist-filters__cluster-label">Quick filters</span>
          <p className="worklist-filters__cluster-support">
            Narrow the queue to the signals that need attention now.
          </p>
        </div>
        <div className="worklist-filters__toggles" role="group" aria-label="Worklist quick filters">
          {TOGGLE_FILTERS.map((filter) => (
            <Button
              key={filter.key}
              className="worklist-filters__toggle"
              variant={filters[filter.key] ? 'primary' : 'secondary'}
              size="sm"
              disabled={disabled}
              aria-pressed={filters[filter.key]}
              onClick={() => onToggleFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
