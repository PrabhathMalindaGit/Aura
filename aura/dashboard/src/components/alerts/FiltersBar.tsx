import type { AlertStatus } from '../../types/models';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

export type SourceFilter = 'all' | 'checkin' | 'chat';
export type TimeRangeFilter = '24h' | '7d' | '30d';
export type SortOrder = 'newest' | 'oldest' | 'patient-asc';

interface FiltersBarProps {
  status: AlertStatus;
  searchValue: string;
  sourceFilter: SourceFilter;
  timeRange: TimeRangeFilter;
  sortOrder: SortOrder;
  unseenOnly: boolean;
  unseenCount: number;
  assignedToMeOnly: boolean;
  unassignedOnly: boolean;
  overriddenOnly: boolean;
  refreshing: boolean;
  onSearchValueChange: (value: string) => void;
  onSourceFilterChange: (value: SourceFilter) => void;
  onTimeRangeChange: (value: TimeRangeFilter) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onUnseenOnlyChange: (value: boolean) => void;
  onAssignedToMeOnlyChange: (value: boolean) => void;
  onUnassignedOnlyChange: (value: boolean) => void;
  onOverriddenOnlyChange: (value: boolean) => void;
  onRefresh: () => void;
}

const sourceFilters: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'chat', label: 'Chat' },
];

export function FiltersBar({
  status,
  searchValue,
  sourceFilter,
  timeRange,
  sortOrder,
  unseenOnly,
  unseenCount,
  assignedToMeOnly,
  unassignedOnly,
  overriddenOnly,
  refreshing,
  onSearchValueChange,
  onSourceFilterChange,
  onTimeRangeChange,
  onSortOrderChange,
  onUnseenOnlyChange,
  onAssignedToMeOnlyChange,
  onUnassignedOnlyChange,
  onOverriddenOnlyChange,
  onRefresh,
}: FiltersBarProps): JSX.Element {
  return (
    <section className="alerts-filters" aria-label="Alert filters">
      <div className="alerts-filters__clusters">
        <div
          className="alerts-filters__cluster alerts-filters__cluster--search-source"
          role="group"
          aria-label="Search and source controls"
        >
          <span className="alerts-filters__cluster-label">Search alerts</span>
          <div className="alerts-filters__cluster-body">
            <label className="alerts-filters__search form-field">
              <span className="alerts-filters__label">Search</span>
              <input
                type="search"
                value={searchValue}
                onChange={(event) => onSearchValueChange(event.target.value)}
                placeholder="Search patient ID, alert ID, reason, or source"
                aria-label="Search alerts"
              />
            </label>

            <div className="alerts-filters__group" role="group" aria-label="Source filter">
              {sourceFilters.map((item) => {
                const isSelected = sourceFilter === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      'alerts-filters__chip',
                      isSelected && 'alerts-filters__chip--selected',
                    )}
                    onClick={() => onSourceFilterChange(item.value)}
                    aria-pressed={isSelected}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {status === 'open' ? (
          <div
            className="alerts-filters__cluster alerts-filters__cluster--workflow"
            role="group"
            aria-label="Workflow filters"
          >
            <span className="alerts-filters__cluster-label">Open review</span>
            <div className="alerts-filters__cluster-body alerts-filters__cluster-body--workflow">
              <div className="alerts-filters__toggle-wrap">
                <div className="alerts-filters__toggle-group" role="group" aria-label="Open alert visibility filters">
                  <label className="alerts-filters__toggle" htmlFor="unseen-only-toggle">
                    <input
                      id="unseen-only-toggle"
                      type="checkbox"
                      checked={unseenOnly}
                      onChange={(event) => onUnseenOnlyChange(event.target.checked)}
                    />
                    <span>Unseen only</span>
                  </label>
                  <label className="alerts-filters__toggle" htmlFor="assigned-to-me-toggle">
                    <input
                      id="assigned-to-me-toggle"
                      type="checkbox"
                      checked={assignedToMeOnly}
                      onChange={(event) => onAssignedToMeOnlyChange(event.target.checked)}
                    />
                    <span>Assigned to me</span>
                  </label>
                  <label className="alerts-filters__toggle" htmlFor="unassigned-only-toggle">
                    <input
                      id="unassigned-only-toggle"
                      type="checkbox"
                      checked={unassignedOnly}
                      onChange={(event) => onUnassignedOnlyChange(event.target.checked)}
                    />
                    <span>Unassigned only</span>
                  </label>
                  <label className="alerts-filters__toggle" htmlFor="overridden-only-toggle">
                    <input
                      id="overridden-only-toggle"
                      type="checkbox"
                      checked={overriddenOnly}
                      onChange={(event) => onOverriddenOnlyChange(event.target.checked)}
                    />
                    <span>Overridden only</span>
                  </label>
                </div>
              </div>
              <span
                className="alerts-filters__count"
                aria-live="polite"
                aria-label={`Unseen alerts count ${unseenCount}`}
              >
                First review: {unseenCount}
              </span>
            </div>
          </div>
        ) : null}

        <div
          className="alerts-filters__cluster alerts-filters__cluster--view"
          role="group"
          aria-label="View controls"
        >
          <span className="alerts-filters__cluster-label">Queue view</span>
          <div className="alerts-filters__cluster-body alerts-filters__cluster-body--view">
            <label className="alerts-filters__control form-field">
              <span className="alerts-filters__label">Time range</span>
              <select value={timeRange} onChange={(event) => onTimeRangeChange(event.target.value as TimeRangeFilter)}>
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7d</option>
                <option value="30d">Last 30d</option>
              </select>
            </label>

            <label className="alerts-filters__control form-field">
              <span className="alerts-filters__label">Sort</span>
              <select value={sortOrder} onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="patient-asc">Patient A-Z</option>
              </select>
            </label>

            <div className="alerts-filters__refresh">
              <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
