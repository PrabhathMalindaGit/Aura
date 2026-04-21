import { ArrowUpRight, RefreshCw, Search, ShieldAlert, UsersRound } from 'lucide-react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { formatDateTime, formatRelativeDate } from '../../../utils/date';
import {
  getPatientDisplayName,
  getPatientStatus,
  hasOpenAlerts,
  isMissedCheckin,
  PATIENT_TRIAGE_PRESETS,
} from '../../../utils/patientFilters';
import {
  buildPatientTriageSupportLine,
  formatAlertBurdenText,
  getAlertBurdenTone,
  getPainLevelMeta,
} from '../../../components/patients/patientRosterSignalUtils';
import type { PatientStatus, PatientSummary } from '../../../types/models';
import { DashboardV2ClinicianPatientAnchor } from '../../patterns/ClinicianPatientAnchor';
import { DashboardV2Badge } from '../../primitives/Badge';
import { DashboardV2Button } from '../../primitives/Button';
import { DashboardV2Field } from '../../primitives/Field';
import { DashboardV2Icon } from '../../primitives/Icon';
import { DashboardV2Surface } from '../../primitives/Surface';
import { DashboardV2Table, DashboardV2TableFrame } from '../../primitives/Table';
import { DashboardV2Heading, DashboardV2Text } from '../../primitives/Text';
import { usePatientsViewModel } from './usePatientsViewModel';
import './patients.css';

const CARD_LAYOUT_QUERY = '(max-width: 767px)';

function getStatusTone(status: PatientStatus): 'success' | 'warning' | 'neutral' | 'unknown' {
  if (status === 'active') {
    return 'success';
  }

  if (status === 'on_hold') {
    return 'warning';
  }

  if (status === 'discharged') {
    return 'neutral';
  }

  return 'unknown';
}

function getStatusLabel(status: PatientStatus): string {
  if (status === 'on_hold') {
    return 'On hold';
  }

  if (status === 'discharged') {
    return 'Discharged';
  }

  if (status === 'inactive') {
    return 'Inactive';
  }

  return 'Active';
}

function buildReviewCue(patient: PatientSummary): string {
  const status = getPatientStatus(patient);
  const openAlertCount = patient.openAlertCount ?? 0;

  if (openAlertCount > 0) {
    return `Alert burden ${openAlertCount}`;
  }

  if (isMissedCheckin(patient)) {
    return 'Missed recent check-in';
  }

  if (status === 'on_hold') {
    return 'Paused follow-up';
  }

  if (status === 'discharged') {
    return 'Discharged reference';
  }

  return 'Stable review';
}

function buildActionSupportLabel(patient: PatientSummary): string {
  const status = getPatientStatus(patient);

  if (hasOpenAlerts(patient) || isMissedCheckin(patient)) {
    return 'Open review now';
  }

  if (status === 'discharged') {
    return 'Open summary';
  }

  return 'Open patient context';
}

interface CompareToolbarProps {
  compareCount: number;
  previewPatients: PatientSummary[];
  onClear: () => void;
  onOpenCompare: () => void;
}

function CompareToolbar({
  compareCount,
  previewPatients,
  onClear,
  onOpenCompare,
}: CompareToolbarProps): JSX.Element {
  if (compareCount === 0) {
    return null;
  }

  return (
    <div className="v2-patients-route__compare-toolbar" aria-live="polite">
      <div className="v2-patients-route__compare-copy">
        <div className="v2-patients-route__compare-summary">
          <DashboardV2Text tone="label">Compare selection</DashboardV2Text>
          <DashboardV2Text tone="strong">{compareCount} selected</DashboardV2Text>
        </div>
        <DashboardV2Text tone="muted" className="v2-patients-route__compare-support">
          Keep compare explicit so the roster can stay focused on patient-open actions.
        </DashboardV2Text>
        <div className="v2-patients-route__compare-chips">
          {previewPatients.map((patient) => (
            <span key={patient.id} className="v2-patients-route__compare-chip">
              {getPatientDisplayName(patient)}
            </span>
          ))}
        </div>
      </div>
      <div className="v2-patients-route__compare-actions">
        <DashboardV2Button tone="ghost" size="sm" onPress={onClear}>
          Clear
        </DashboardV2Button>
        <DashboardV2Button
          tone="secondary"
          size="sm"
          leadingIcon={<ArrowUpRight size={15} />}
          onPress={onOpenCompare}
          isDisabled={compareCount < 2}
        >
          Compare selected ({compareCount})
        </DashboardV2Button>
      </div>
    </div>
  );
}

interface PatientTableProps {
  patients: PatientSummary[];
  comparePatientIds: string[];
  compareSelectionLimitReached: boolean;
  onToggleComparePatient: (patientId: string) => void;
  onOpenPatient: (patientId: string) => void;
}

function PatientTable({
  patients,
  comparePatientIds,
  compareSelectionLimitReached,
  onToggleComparePatient,
  onOpenPatient,
}: PatientTableProps): JSX.Element {
  return (
    <DashboardV2TableFrame
      className="v2-patients-table-frame"
      summary="Patient-open stays inside the V2 patient workspace, while compare remains an explicit route."
    >
      <DashboardV2Table aria-label="Patients roster results">
        <thead>
          <tr>
            <th scope="col">Compare</th>
            <th scope="col">Patient</th>
            <th scope="col">Recent activity</th>
            <th scope="col">Signals</th>
            <th scope="col">Next step</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const displayName = getPatientDisplayName(patient);
            const status = getPatientStatus(patient);
            const reviewCue = buildReviewCue(patient);
            const supportLine = buildPatientTriageSupportLine(patient);
            const openAlertCount = patient.openAlertCount ?? 0;
            const painMeta = getPainLevelMeta(patient.lastPain);
            const compareSelected = comparePatientIds.includes(patient.id);
            const compareDisabled = !compareSelected && compareSelectionLimitReached;
            const checkinTitle = patient.lastCheckinAt ? formatDateTime(patient.lastCheckinAt) : 'No recent activity';
            const checkinLabel = patient.lastCheckinAt ? formatRelativeDate(patient.lastCheckinAt) : 'No recent activity';

            return (
              <tr key={patient.id} className="v2-patients-table__row">
                <td className="v2-patients-table__compare-cell">
                  <label className="v2-patients-route__checkbox-label">
                    <input
                      type="checkbox"
                      checked={compareSelected}
                      disabled={compareDisabled}
                      aria-label={`Select ${displayName} for compare`}
                      onChange={() => onToggleComparePatient(patient.id)}
                    />
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="v2-patients-table__patient-button"
                    onClick={() => onOpenPatient(patient.id)}
                    data-testid={`v2-patients-open-patient-${patient.id}`}
                  >
                    <DashboardV2ClinicianPatientAnchor patientLabel={displayName} size="md" />
                    <span className="v2-patients-table__patient-copy">
                      <span className="v2-patients-table__patient-head">
                        <span className="v2-patients-table__patient-name">{displayName}</span>
                        <DashboardV2Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</DashboardV2Badge>
                      </span>
                      <span className="v2-patients-table__patient-meta">ID: {patient.id}</span>
                      <span className="v2-patients-table__patient-support">{supportLine}</span>
                    </span>
                  </button>
                </td>
                <td>
                  <div className="v2-patients-table__stack">
                    <DashboardV2Text tone="strong" as="span">
                      {checkinLabel}
                    </DashboardV2Text>
                    <DashboardV2Text tone="muted" as="span">
                      {checkinTitle}
                    </DashboardV2Text>
                  </div>
                </td>
                <td>
                  <div className="v2-patients-table__stack">
                    <DashboardV2Text tone="strong" as="span">
                      {formatAlertBurdenText(openAlertCount)}
                    </DashboardV2Text>
                    <DashboardV2Text tone="muted" as="span">
                      {painMeta.label} · {painMeta.valueText}
                    </DashboardV2Text>
                  </div>
                </td>
                <td>
                  <div className="v2-patients-table__actions">
                    <div className="v2-patients-table__stack">
                      <DashboardV2Text tone="strong" as="span">
                        {reviewCue}
                      </DashboardV2Text>
                      <DashboardV2Text tone="muted" as="span">
                        {buildActionSupportLabel(patient)}
                      </DashboardV2Text>
                    </div>
                    <DashboardV2Button
                      tone="row"
                      size="sm"
                      trailingIcon={<ArrowUpRight size={14} />}
                      onPress={() => onOpenPatient(patient.id)}
                    >
                      Open review
                    </DashboardV2Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DashboardV2Table>
    </DashboardV2TableFrame>
  );
}

type PatientCardListProps = PatientTableProps;

function PatientCardList({
  patients,
  comparePatientIds,
  compareSelectionLimitReached,
  onToggleComparePatient,
  onOpenPatient,
}: PatientCardListProps): JSX.Element {
  return (
    <div className="v2-patients-card-list">
      {patients.map((patient) => {
        const displayName = getPatientDisplayName(patient);
        const status = getPatientStatus(patient);
        const reviewCue = buildReviewCue(patient);
        const supportLine = buildPatientTriageSupportLine(patient);
        const openAlertCount = patient.openAlertCount ?? 0;
        const painMeta = getPainLevelMeta(patient.lastPain);
        const compareSelected = comparePatientIds.includes(patient.id);
        const compareDisabled = !compareSelected && compareSelectionLimitReached;
        const checkinTitle = patient.lastCheckinAt ? formatDateTime(patient.lastCheckinAt) : 'No recent activity';
        const checkinLabel = patient.lastCheckinAt ? formatRelativeDate(patient.lastCheckinAt) : 'No recent activity';

        return (
          <DashboardV2Surface
            key={patient.id}
            className="v2-patients-card"
            as="article"
            data-testid={`v2-patients-card-${patient.id}`}
          >
            <div className="v2-patients-card__topline">
              <label className="v2-patients-route__checkbox-label v2-patients-card__checkbox-label">
                <input
                  type="checkbox"
                  checked={compareSelected}
                  disabled={compareDisabled}
                  aria-label={`Select ${displayName} for compare`}
                  onChange={() => onToggleComparePatient(patient.id)}
                />
                <span>Compare</span>
              </label>
              <DashboardV2Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</DashboardV2Badge>
            </div>

            <div className="v2-patients-card__header">
              <div className="v2-patients-card__identity">
                <DashboardV2ClinicianPatientAnchor patientLabel={displayName} size="md" />
                <div className="v2-patients-card__identity-copy">
                  <DashboardV2Heading as="h3">{displayName}</DashboardV2Heading>
                  <DashboardV2Text tone="muted">ID: {patient.id}</DashboardV2Text>
                </div>
              </div>
              <DashboardV2Button
                tone="row"
                size="sm"
                onPress={() => onOpenPatient(patient.id)}
                data-testid={`v2-patients-open-patient-${patient.id}`}
              >
                Open review
              </DashboardV2Button>
            </div>

            <DashboardV2Text tone="muted" className="v2-patients-card__support">
              {supportLine}
            </DashboardV2Text>

            <dl className="v2-patients-card__facts">
              <div>
                <dt>Review cue</dt>
                <dd>{reviewCue}</dd>
              </div>
              <div>
                <dt>Recent activity</dt>
                <dd title={checkinTitle}>{checkinLabel}</dd>
              </div>
              <div>
                <dt>Alert burden</dt>
                <dd className={`v2-patients-card__alert v2-patients-card__alert--${getAlertBurdenTone(openAlertCount)}`}>
                  {formatAlertBurdenText(openAlertCount)}
                </dd>
              </div>
              <div>
                <dt>Pain level</dt>
                <dd>
                  {painMeta.label} · {painMeta.valueText}
                </dd>
              </div>
            </dl>

            <div className="v2-patients-card__actions">
              <DashboardV2Text tone="muted">
                {compareSelected ? 'Included in compare selection.' : buildActionSupportLabel(patient)}
              </DashboardV2Text>
            </div>
          </DashboardV2Surface>
        );
      })}
    </div>
  );
}

export function PatientsRoute(): JSX.Element {
  const isCardLayout = useMediaQuery(CARD_LAYOUT_QUERY);
  const viewModel = usePatientsViewModel();
  const totalPatients = viewModel.rosterSummary.total;
  const visibleCount = viewModel.visiblePatients.length;
  const compareCount = viewModel.comparePatients.length;

  return (
    <div className="v2-patients-route" data-testid="v2-patients-route">
      <DashboardV2Surface
        className="v2-patients-route__command"
        tone="muted"
        data-testid="v2-patients-status-bar"
      >
        <div className="v2-patients-route__command-header">
          <div className="v2-patients-route__status-copy">
            <DashboardV2Text tone="label">Care roster</DashboardV2Text>
            <DashboardV2Heading as="h1">Patients</DashboardV2Heading>
            <DashboardV2Text tone="muted">
              Search the roster, focus the right review cohort, and open the correct patient workspace without leaving the V2 shell.
            </DashboardV2Text>
          </div>

          <div className="v2-patients-route__command-utilities">
            <div className="v2-patients-route__utility-pill">
              <span>Updated</span>
              <strong>{viewModel.updatedAtLabel}</strong>
            </div>

            <div className="v2-patients-route__status-buttons">
              <DashboardV2Button
                tone="row"
                size="sm"
                leadingIcon={<RefreshCw size={15} />}
                onPress={viewModel.retryPatients}
              >
                {viewModel.patientsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
              </DashboardV2Button>
              <DashboardV2Button tone="quiet" size="sm" onPress={viewModel.clearSavedPatientsState}>
                Clear view
              </DashboardV2Button>
            </div>
          </div>
        </div>

        <div className="v2-patients-route__facts" aria-label="Roster status summary">
          <div className="v2-patients-route__fact">
            <span>Showing</span>
            <strong>{visibleCount === totalPatients ? totalPatients : `${visibleCount}/${totalPatients}`}</strong>
          </div>
          <div className="v2-patients-route__fact">
            <span>Closer review</span>
            <strong>{viewModel.visibleSummary.needsReview}</strong>
          </div>
          <div className="v2-patients-route__fact">
            <span>Active alerts</span>
            <strong>{viewModel.visibleSummary.openAlerts}</strong>
          </div>
          <div className="v2-patients-route__fact">
            <span>Roster scope</span>
            <strong>{viewModel.workspaceStatusLine}</strong>
          </div>
        </div>

        <div className="v2-patients-route__toolbar" data-testid="v2-patients-filters">
          <div className="v2-patients-route__toolbar-primary">
            <DashboardV2Field
              className="v2-patients-route__field v2-patients-route__field--search"
              label="Search patients"
              labelHidden
              control={
                <div className="v2-patients-route__search-shell">
                  <DashboardV2Icon icon={Search} size={16} className="v2-patients-route__search-icon" />
                  <input
                    aria-label="Search patients"
                    className="v2-input v2-patients-route__search-input"
                    type="search"
                    value={viewModel.filters.search}
                    placeholder="Search by name or patient ID"
                    onChange={(event) => viewModel.setSearch(event.target.value)}
                  />
                </div>
              }
            />

            <DashboardV2Field
              className="v2-patients-route__field"
              label="Sort patients"
              labelHidden
              control={
                <select
                  aria-label="Sort patients"
                  className="v2-patients-route__select"
                  value={viewModel.filters.sort}
                  onChange={(event) => viewModel.setSort(event.target.value as typeof viewModel.filters.sort)}
                >
                  <option value="alerts-desc">Sort by alert burden</option>
                  <option value="last-checkin-desc">Sort by recent check-ins</option>
                  <option value="name-asc">Sort by name A-Z</option>
                  <option value="status-active-first">Sort by active status</option>
                </select>
              }
            />

            <DashboardV2Field
              className="v2-patients-route__field"
              label="Filter patients by status"
              labelHidden
              control={
                <select
                  aria-label="Filter patients by status"
                  className="v2-patients-route__select"
                  value={viewModel.filters.status}
                  onChange={(event) => viewModel.setStatus(event.target.value as typeof viewModel.filters.status)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="discharged">Discharged</option>
                  <option value="inactive">Inactive</option>
                </select>
              }
            />

            <DashboardV2Field
              className="v2-patients-route__field"
              label="Filter by recently active"
              labelHidden
              control={
                <select
                  aria-label="Filter by recently active"
                  className="v2-patients-route__select"
                  value={viewModel.filters.recentlyActive}
                  onChange={(event) =>
                    viewModel.setRecentlyActive(event.target.value as typeof viewModel.filters.recentlyActive)
                  }
                >
                  <option value="all">Any recent activity</option>
                  <option value="24h">Active in 24h</option>
                  <option value="7d">Active in 7d</option>
                  <option value="30d">Active in 30d</option>
                </select>
              }
            />
          </div>

          <div className="v2-patients-route__toolbar-secondary">
            <div className="v2-patients-route__preset-group" role="group" aria-label="Quick triage views">
              <span className="v2-patients-route__group-label">Review focus</span>
              <div className="v2-patients-route__preset-buttons">
                {viewModel.activeTriagePreset ? (
                  <DashboardV2Badge tone="info" size="sm" icon={Search}>
                    {viewModel.activeTriagePreset.label}
                  </DashboardV2Badge>
                ) : null}
                {PATIENT_TRIAGE_PRESETS.map((preset) => {
                  const isActive = viewModel.activeTriagePreset?.id === preset.id;

                  return (
                    <DashboardV2Button
                      key={preset.id}
                      tone={isActive ? 'secondary' : 'quiet'}
                      size="sm"
                      onPress={() => viewModel.applyTriagePreset(preset.id)}
                    >
                      {preset.label}
                    </DashboardV2Button>
                  );
                })}
              </div>
            </div>

            <div className="v2-patients-route__toggle-group">
              <label className="v2-patients-route__toggle">
                <input
                  aria-label="Has open alerts"
                  type="checkbox"
                  checked={viewModel.filters.hasOpenAlertsOnly}
                  onChange={(event) => viewModel.setHasOpenAlertsOnly(event.target.checked)}
                />
                <span>Open alerts only</span>
              </label>
              <label className="v2-patients-route__toggle">
                <input
                  aria-label="Missed check-ins"
                  type="checkbox"
                  checked={viewModel.filters.missedCheckinsOnly}
                  onChange={(event) => viewModel.setMissedCheckinsOnly(event.target.checked)}
                />
                <span>Missed check-ins only</span>
              </label>
            </div>
          </div>
        </div>
      </DashboardV2Surface>

      {viewModel.staleErrorBannerVisible ? (
        <DashboardV2Surface className="v2-patients-route__banner" tone="critical">
          <DashboardV2Icon icon={ShieldAlert} size={16} />
          <div className="v2-patients-route__banner-copy">
            <DashboardV2Text tone="strong">Service temporarily unavailable.</DashboardV2Text>
            <DashboardV2Text tone="muted">
              Showing the last known roster snapshot from {viewModel.updatedAtLabel}.
            </DashboardV2Text>
          </div>
        </DashboardV2Surface>
      ) : null}

      <DashboardV2Surface className="v2-patients-route__results" data-testid="v2-patients-results">
        <div className="v2-patients-route__results-head">
          <div className="v2-patients-route__results-header">
            <div className="v2-patients-route__results-title">
              <DashboardV2Text tone="label">Roster results</DashboardV2Text>
              <DashboardV2Heading as="h2">Patient roster</DashboardV2Heading>
              <DashboardV2Text tone="muted">{viewModel.workspaceSupportLine}</DashboardV2Text>
            </div>
            <div className="v2-patients-route__results-meta">
              <DashboardV2Badge tone="clinician" size="sm" icon={UsersRound}>
                {viewModel.workspaceStatusLine}
              </DashboardV2Badge>
              <DashboardV2Badge tone="support" size="sm">
                {viewModel.reviewBurdenLabel}
              </DashboardV2Badge>
            </div>
          </div>

          <CompareToolbar
            compareCount={compareCount}
            previewPatients={viewModel.comparePreviewPatients}
            onClear={viewModel.clearComparePatients}
            onOpenCompare={viewModel.openCompareMode}
          />
        </div>

        {viewModel.showInitialLoading ? (
          <div className="v2-patients-route__placeholder" aria-label="Patients loading placeholder">
            <div className="v2-patients-route__skeleton" />
            <div className="v2-patients-route__skeleton" />
            <div className="v2-patients-route__skeleton" />
          </div>
        ) : viewModel.endpointMissing ? (
          <div className="v2-patients-route__empty" role="status">
            <DashboardV2Heading as="h3">Patients list not available yet</DashboardV2Heading>
            <DashboardV2Text tone="muted">
              The backend endpoint /clinician/patients is not implemented.
            </DashboardV2Text>
            <div className="v2-patients-route__empty-actions">
              <DashboardV2Button tone="secondary" onPress={viewModel.retryPatients}>
                Retry
              </DashboardV2Button>
            </div>
            <details className="v2-patients-route__hint">
              <summary>Show developer hint</summary>
              <DashboardV2Text tone="muted">{viewModel.endpointHint}</DashboardV2Text>
            </details>
          </div>
        ) : viewModel.genericError && !viewModel.staleErrorBannerVisible && viewModel.errorView ? (
          <div className="v2-patients-route__empty" role="status">
            <DashboardV2Heading as="h3">Unable to load patients</DashboardV2Heading>
            <DashboardV2Text tone="muted">{viewModel.errorView.description}</DashboardV2Text>
            <div className="v2-patients-route__empty-actions">
              <DashboardV2Button tone="secondary" onPress={viewModel.retryPatients}>
                Retry
              </DashboardV2Button>
            </div>
          </div>
        ) : viewModel.blockingOfflineVisible ? (
          <div className="v2-patients-route__empty" role="status">
            <DashboardV2Heading as="h3">Offline</DashboardV2Heading>
            <DashboardV2Text tone="muted">
              No cached patient list is available yet. Reconnect and retry.
            </DashboardV2Text>
            <div className="v2-patients-route__empty-actions">
              <DashboardV2Button tone="secondary" onPress={viewModel.retryPatients}>
                Retry
              </DashboardV2Button>
            </div>
          </div>
        ) : totalPatients === 0 ? (
          <div className="v2-patients-route__empty" role="status">
            <DashboardV2Heading as="h3">No patient records yet</DashboardV2Heading>
            <DashboardV2Text tone="muted">
              No patient records are available yet. This roster will populate as patient check-ins, alerts, and care activity begin to appear.
            </DashboardV2Text>
            <DashboardV2Text tone="muted">Last updated {viewModel.updatedAtLabel}</DashboardV2Text>
          </div>
        ) : visibleCount === 0 ? (
          <div className="v2-patients-route__empty" role="status">
            <DashboardV2Heading as="h3">No patients match this view</DashboardV2Heading>
            <DashboardV2Text tone="muted">{viewModel.filteredEmptyDescription}</DashboardV2Text>
            <div className="v2-patients-route__empty-actions">
              <DashboardV2Button tone="secondary" onPress={viewModel.clearSavedPatientsState}>
                Reset filters
              </DashboardV2Button>
            </div>
          </div>
        ) : isCardLayout ? (
          <PatientCardList
            patients={viewModel.visiblePatients}
            comparePatientIds={viewModel.comparePatientIds}
            compareSelectionLimitReached={viewModel.compareSelectionLimitReached}
            onToggleComparePatient={viewModel.toggleComparePatient}
            onOpenPatient={viewModel.openPatientFromRoster}
          />
        ) : (
          <PatientTable
            patients={viewModel.visiblePatients}
            comparePatientIds={viewModel.comparePatientIds}
            compareSelectionLimitReached={viewModel.compareSelectionLimitReached}
            onToggleComparePatient={viewModel.toggleComparePatient}
            onOpenPatient={viewModel.openPatientFromRoster}
          />
        )}

        <div className="v2-patients-route__results-footer">
          <DashboardV2Text tone="muted" className="v2-patients-route__results-footnote">
            Alert burden shows current open-alert count only.
          </DashboardV2Text>
          <DashboardV2Text tone="muted" className="v2-patients-route__results-footnote">
            {viewModel.workspaceStatusLine}
          </DashboardV2Text>
        </div>
      </DashboardV2Surface>
    </div>
  );
}
