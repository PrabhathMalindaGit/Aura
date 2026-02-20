import {
  type PatientFilters,
  type PatientSortOption,
  type PatientStatusFilter,
  type RecentlyActiveFilter,
} from '../../utils/patientFilters';
import { Button } from '../ui/Button';

interface PatientsFiltersBarProps {
  filters: PatientFilters;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: PatientStatusFilter) => void;
  onHasOpenAlertsOnlyChange: (value: boolean) => void;
  onMissedCheckinsOnlyChange: (value: boolean) => void;
  onRecentlyActiveChange: (value: RecentlyActiveFilter) => void;
  onSortChange: (value: PatientSortOption) => void;
  onReset: () => void;
}

export function PatientsFiltersBar({
  filters,
  disabled = false,
  onSearchChange,
  onStatusChange,
  onHasOpenAlertsOnlyChange,
  onMissedCheckinsOnlyChange,
  onRecentlyActiveChange,
  onSortChange,
  onReset,
}: PatientsFiltersBarProps): JSX.Element {
  return (
    <section className="patients-filters" aria-label="Patient filters">
      <label className="patients-filters__search">
        <span className="patients-filters__label">Search</span>
        <input
          aria-label="Search patients"
          type="search"
          value={filters.search}
          placeholder="Search by patient ID or name"
          onChange={(event) => onSearchChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="patients-filters__control">
        <span className="patients-filters__label">Status</span>
        <select
          aria-label="Filter patients by status"
          value={filters.status}
          onChange={(event) => onStatusChange(event.target.value as PatientStatusFilter)}
          disabled={disabled}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="discharged">Discharged</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <label className="patients-filters__control">
        <span className="patients-filters__label">Recently active</span>
        <select
          aria-label="Filter by recently active"
          value={filters.recentlyActive}
          onChange={(event) => onRecentlyActiveChange(event.target.value as RecentlyActiveFilter)}
          disabled={disabled}
        >
          <option value="all">All</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </label>

      <label className="patients-filters__control">
        <span className="patients-filters__label">Sort</span>
        <select
          aria-label="Sort patients"
          value={filters.sort}
          onChange={(event) => onSortChange(event.target.value as PatientSortOption)}
          disabled={disabled}
        >
          <option value="alerts-desc">Open alerts (desc)</option>
          <option value="last-checkin-desc">Last check-in (most recent)</option>
          <option value="name-asc">Name A-Z</option>
          <option value="status-active-first">Status (Active first)</option>
        </select>
      </label>

      <label className="patients-filters__toggle">
        <input
          aria-label="Has open alerts"
          type="checkbox"
          checked={filters.hasOpenAlertsOnly}
          onChange={(event) => onHasOpenAlertsOnlyChange(event.target.checked)}
          disabled={disabled}
        />
        <span>Has open alerts</span>
      </label>

      <label className="patients-filters__toggle">
        <input
          aria-label="Missed check-ins"
          type="checkbox"
          checked={filters.missedCheckinsOnly}
          onChange={(event) => onMissedCheckinsOnlyChange(event.target.checked)}
          disabled={disabled}
        />
        <span>Missed check-ins</span>
      </label>

      <Button variant="ghost" onClick={onReset} disabled={disabled}>
        Reset filters
      </Button>
    </section>
  );
}
