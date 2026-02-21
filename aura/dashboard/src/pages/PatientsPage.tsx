import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientCardList } from '../components/patients/PatientCardList';
import { PatientsFiltersBar } from '../components/patients/PatientsFiltersBar';
import { PatientsTable } from '../components/patients/PatientsTable';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePatients } from '../services/clinicianApi';
import { MEDIA_QUERIES } from '../styles/breakpoints';
import { asAppError, toUserMessage } from '../utils/errors';
import { applyPatientFilters, defaultPatientFilters, type PatientFilters } from '../utils/patientFilters';

const PATIENTS_ENDPOINT_HINT =
  'Add GET /clinician/patients returning { ok: true, patients: [...] }';

function isEndpointMissing(error: unknown): boolean {
  const appError = asAppError(error);
  return appError.kind === 'HTTP' && appError.status === 404;
}

export function PatientsPage(): JSX.Element {
  const navigate = useNavigate();
  const patientsQuery = usePatients();
  const isMobileLayout = useMediaQuery(MEDIA_QUERIES.mdDown);

  const [filters, setFilters] = useState<PatientFilters>(defaultPatientFilters());

  const allPatients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const visiblePatients = useMemo(() => applyPatientFilters(allPatients, filters), [allPatients, filters]);

  const showInitialLoading = patientsQuery.isLoading && allPatients.length === 0;
  const endpointMissing = Boolean(patientsQuery.error) && isEndpointMissing(patientsQuery.error);
  const genericError = patientsQuery.error && !endpointMissing ? asAppError(patientsQuery.error) : null;

  return (
    <div className="page-stack">
      <section className="patients-page-header">
        <h2>Patients</h2>
        <p className="muted-text">Sort and filter by risk, last check-in, and status.</p>
      </section>

      {genericError ? (
        <AlertBanner variant="error" title="Unable to load patients">
          {toUserMessage(genericError)}
        </AlertBanner>
      ) : null}

      <Card title="Patients">
        <PatientsFiltersBar
          filters={filters}
          onSearchChange={(search) => setFilters((current) => ({ ...current, search }))}
          onStatusChange={(status) => setFilters((current) => ({ ...current, status }))}
          onHasOpenAlertsOnlyChange={(hasOpenAlertsOnly) =>
            setFilters((current) => ({ ...current, hasOpenAlertsOnly }))
          }
          onMissedCheckinsOnlyChange={(missedCheckinsOnly) =>
            setFilters((current) => ({ ...current, missedCheckinsOnly }))
          }
          onRecentlyActiveChange={(recentlyActive) =>
            setFilters((current) => ({ ...current, recentlyActive }))
          }
          onSortChange={(sort) => setFilters((current) => ({ ...current, sort }))}
          onReset={() => setFilters(defaultPatientFilters())}
        />

        {showInitialLoading ? (
          <div className="patients-skeleton" aria-label="Patients loading placeholder">
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : endpointMissing ? (
          <EmptyState
            title="Patients endpoint not ready"
            description="The dashboard could not load /clinician/patients yet."
            action={<p className="muted-text">{PATIENTS_ENDPOINT_HINT}</p>}
          />
        ) : allPatients.length === 0 ? (
          <EmptyState
            title="No patients available"
            description="Patients will appear here once the clinician patients list returns records."
          />
        ) : visiblePatients.length === 0 ? (
          <EmptyState
            title="No patients match this view"
            description="Adjust search, filters, or sorting to broaden your results."
          />
        ) : isMobileLayout ? (
          <PatientCardList
            patients={visiblePatients}
            onOpenPatient={(patientId) => navigate(`/patients/${patientId}`)}
          />
        ) : (
          <PatientsTable
            patients={visiblePatients}
            onOpenPatient={(patientId) => navigate(`/patients/${patientId}`)}
          />
        )}
      </Card>
    </div>
  );
}
