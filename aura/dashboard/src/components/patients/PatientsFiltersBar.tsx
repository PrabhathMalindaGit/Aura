import { useEffect, useState } from 'react';
import {
  defaultPatientFilters,
  type PatientFilters,
  type PatientSortOption,
  type PatientStatusFilter,
  type RecentlyActiveFilter,
} from '../../utils/patientFilters';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../styles/breakpoints';

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
  const isCompact = useMediaQuery(MEDIA_QUERIES.mdDown);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PatientFilters>(filters);

  useEffect(() => {
    if (!filtersDrawerOpen) {
      setDraftFilters(filters);
    }
  }, [filters, filtersDrawerOpen]);

  function applyDraftFilters(nextFilters: PatientFilters): void {
    onStatusChange(nextFilters.status);
    onHasOpenAlertsOnlyChange(nextFilters.hasOpenAlertsOnly);
    onMissedCheckinsOnlyChange(nextFilters.missedCheckinsOnly);
    onRecentlyActiveChange(nextFilters.recentlyActive);
    onSortChange(nextFilters.sort);
  }

  if (isCompact) {
    return (
      <>
        <section className="patients-filters patients-filters--compact" aria-label="Patient filters">
          <div className="patients-filters__clusters">
            <div className="patients-filters__cluster patients-filters__cluster--search-source">
              <span className="patients-filters__cluster-label">Search roster</span>
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
            </div>

            <div className="patients-filters__compact-actions">
              <Button
                variant="secondary"
                onClick={() => setFiltersDrawerOpen(true)}
                disabled={disabled}
                aria-label="Open patient filters"
              >
                Filters
              </Button>
              <Button variant="ghost" onClick={onReset} disabled={disabled}>
                Reset filters
              </Button>
            </div>
          </div>
        </section>

        <Drawer
          open={filtersDrawerOpen}
          title="Patient filters"
          mobileFullscreen
          onClose={() => setFiltersDrawerOpen(false)}
          footer={
            <div className="drawer-footer-actions">
              <Button variant="secondary" onClick={() => setFiltersDrawerOpen(false)}>
                Close
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const reset = defaultPatientFilters();
                  setDraftFilters(reset);
                  onReset();
                  setFiltersDrawerOpen(false);
                }}
              >
                Reset
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  applyDraftFilters(draftFilters);
                  setFiltersDrawerOpen(false);
                }}
              >
                Apply filters
              </Button>
            </div>
          }
        >
          <section className="patients-filters__sheet" aria-label="Patient filters sheet">
            <label className="patients-filters__control">
              <span className="patients-filters__label">Status</span>
              <select
                aria-label="Filter patients by status"
                value={draftFilters.status}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    status: event.target.value as PatientStatusFilter,
                  }))
                }
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
                value={draftFilters.recentlyActive}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    recentlyActive: event.target.value as RecentlyActiveFilter,
                  }))
                }
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
                value={draftFilters.sort}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    sort: event.target.value as PatientSortOption,
                  }))
                }
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
                checked={draftFilters.hasOpenAlertsOnly}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    hasOpenAlertsOnly: event.target.checked,
                  }))
                }
                disabled={disabled}
              />
              <span>Has open alerts</span>
            </label>

            <label className="patients-filters__toggle">
              <input
                aria-label="Missed check-ins"
                type="checkbox"
                checked={draftFilters.missedCheckinsOnly}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    missedCheckinsOnly: event.target.checked,
                  }))
                }
                disabled={disabled}
              />
              <span>Missed check-ins</span>
            </label>
          </section>
        </Drawer>
      </>
    );
  }

  return (
    <section className="patients-filters" aria-label="Patient filters">
      <div className="patients-filters__clusters">
        <div className="patients-filters__cluster patients-filters__cluster--search-source">
          <span className="patients-filters__cluster-label">Search</span>
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
        </div>

        <div className="patients-filters__cluster patients-filters__cluster--workflow">
          <span className="patients-filters__cluster-label">Workflow filters</span>
          <div className="patients-filters__cluster-body patients-filters__cluster-body--workflow">
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

            <div className="patients-filters__toggle-group" role="group" aria-label="Patient workflow toggles">
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
            </div>
          </div>
        </div>

        <div className="patients-filters__cluster patients-filters__cluster--view">
          <span className="patients-filters__cluster-label">View controls</span>
          <div className="patients-filters__cluster-body patients-filters__cluster-body--view">
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

            <Button variant="ghost" onClick={onReset} disabled={disabled}>
              Reset filters
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
