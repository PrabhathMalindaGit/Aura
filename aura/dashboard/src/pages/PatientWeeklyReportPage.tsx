import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
import { getWeeklyReport } from '../services/clinicianApi';
import type { WeeklyReportPayload } from '../types/models';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';

function toDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function parseDateOnly(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split('-');
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function mondayWeekStartForCurrentTimezone(): string {
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const shiftedNow = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const day = shiftedNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  const monday = new Date(
    Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate() - daysSinceMonday,
    ),
  );

  return toDateOnly(monday);
}

function addDays(weekStart: string, deltaDays: number): string {
  const parsed = parseDateOnly(weekStart) ?? parseDateOnly(mondayWeekStartForCurrentTimezone());
  const next = new Date((parsed ?? new Date()).getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return toDateOnly(next);
}

function numberOrDash(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatPct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString();
}

export function PatientWeeklyReportPage(): JSX.Element {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const weekStart = useMemo(() => {
    const requested = searchParams.get('weekStart');
    const parsed = parseDateOnly(requested);
    return parsed ? toDateOnly(parsed) : mondayWeekStartForCurrentTimezone();
  }, [searchParams]);

  const lastWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);

  const reportQuery = useQuery<WeeklyReportPayload>({
    queryKey: ['patient-weekly-report', patientId, weekStart, tzOffsetMinutes],
    enabled: Boolean(patientId),
    queryFn: () =>
      getWeeklyReport(patientId ?? '', {
        weekStart,
        tzOffsetMinutes,
      }),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
  });

  if (!patientId) {
    return (
      <EmptyState
        title="Patient not found"
        description="No patient identifier was provided in the route."
      />
    );
  }

  return (
    <div className="page-stack">
      <Section
        title="Weekly report"
        subtitle={
          <>
            <Link to={`/patients/${patientId}`}>Back to patient</Link>
            {' · '}Week start: <strong>{weekStart}</strong>
          </>
        }
      />

      <Card
        title="Week selector"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void reportQuery.refetch();
            }}
            disabled={reportQuery.isFetching}
          >
            {reportQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >
        <div className="patient-detail-actions">
          <Button
            variant={weekStart === mondayWeekStartForCurrentTimezone() ? 'primary' : 'secondary'}
            onClick={() => {
              setSearchParams({ weekStart: mondayWeekStartForCurrentTimezone() });
            }}
          >
            View this week
          </Button>
          <Button
            variant={weekStart === lastWeekStart ? 'primary' : 'secondary'}
            onClick={() => {
              setSearchParams({ weekStart: lastWeekStart });
            }}
          >
            View last week
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSearchParams({ weekStart: addDays(weekStart, -7) });
            }}
          >
            Previous week
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              navigate(`/patients/${patientId}`);
            }}
          >
            Back to detail
          </Button>
        </div>
      </Card>

      {reportQuery.error ? (
        <div className="patient-detail-error-state">
          <AlertBanner variant="error" title="Could not load weekly report">
            {toUserMessage(reportQuery.error)}
          </AlertBanner>
          <Button
            variant="secondary"
            onClick={() => {
              void reportQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {reportQuery.isLoading ? (
        <Card title="Weekly report">
          <p className="muted-text">Loading weekly report...</p>
        </Card>
      ) : null}

      {!reportQuery.isLoading && reportQuery.data ? (
        <>
          <Card title="Summary">
            <div className="stack stack--2">
              <p>{reportQuery.data.summary.headline}</p>
              <div>
                <strong>Highlights</strong>
                <ul>
                  {reportQuery.data.summary.highlights.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Next steps</strong>
                <ul>
                  {reportQuery.data.summary.nextSteps.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <Card title="Check-ins">
            <div className="stack stack--1">
              <p className="muted-text">Count: {reportQuery.data.checkins.count}</p>
              <p className="muted-text">Average pain: {numberOrDash(reportQuery.data.checkins.avgPain)}</p>
              <p className="muted-text">Average mood: {numberOrDash(reportQuery.data.checkins.avgMood)}</p>
              <p className="muted-text">Exercise adherence: {formatPct(reportQuery.data.checkins.avgExercisesPct)}</p>
              <p className="muted-text">Medication yes: {formatPct(reportQuery.data.checkins.medicationYesPct)}</p>
              <p className="muted-text">Notes logged: {reportQuery.data.checkins.notesCount}</p>
            </div>
          </Card>

          <Card title="Top pain areas">
            <div className="stack stack--1">
              {reportQuery.data.bodyMap.topRegions.length === 0 ? (
                <p className="muted-text">No localized pain areas recorded this week.</p>
              ) : (
                reportQuery.data.bodyMap.topRegions.map((entry) => (
                  <p key={`${entry.region}-${entry.count}`} className="muted-text">
                    {entry.label}: {entry.count} {entry.count === 1 ? 'entry' : 'entries'}
                    {entry.avgIntensity === null
                      ? ''
                      : ` · avg intensity ${entry.avgIntensity}/10`}
                  </p>
                ))
              )}
            </div>
          </Card>

          <Card title="Sleep">
            <div className="stack stack--1">
              <p className="muted-text">Tracked nights: {reportQuery.data.sleep.trackedNights}</p>
              <p className="muted-text">Average hours: {numberOrDash(reportQuery.data.sleep.avgHours)}</p>
              <p className="muted-text">Average quality: {numberOrDash(reportQuery.data.sleep.avgQuality)}</p>
            </div>
          </Card>

          <Card title="Symptom photos">
            <div className="stack stack--1">
              <p className="muted-text">
                Uploaded this week: {reportQuery.data.photos.uploadedThisWeek}
              </p>
              <p className="muted-text">
                Swelling: {reportQuery.data.photos.kinds.swelling} · Wound:{' '}
                {reportQuery.data.photos.kinds.wound} · Rash:{' '}
                {reportQuery.data.photos.kinds.rash} · Other:{' '}
                {reportQuery.data.photos.kinds.other}
              </p>
            </div>
          </Card>

          <Card title="Hydration">
            <div className="stack stack--1">
              <p className="muted-text">Tracked days: {reportQuery.data.hydration.trackedDays}</p>
              <p className="muted-text">Average daily: {numberOrDash(reportQuery.data.hydration.avgDailyMl)} ml</p>
              <p className="muted-text">Total: {reportQuery.data.hydration.totalMl} ml</p>
              <p className="muted-text">
                Goal days: {reportQuery.data.hydration.daysMeetingTarget}/{reportQuery.data.hydration.trackedDays || 0} (target {reportQuery.data.hydration.targetMl} ml)
              </p>
            </div>
          </Card>

          <Card title="Nutrition">
            <div className="stack stack--1">
              <p className="muted-text">Tracked days: {reportQuery.data.nutrition.trackedDays}</p>
              <p className="muted-text">
                Avg fruit/veg servings: {numberOrDash(reportQuery.data.nutrition.avgFruitVegServings)}
              </p>
              <p className="muted-text">
                Protein OK/high days: {reportQuery.data.nutrition.proteinOkHighDays}
              </p>
              <p className="muted-text">
                Anti-inflammatory days: {reportQuery.data.nutrition.antiInflammatoryDays}
              </p>
              <p className="muted-text">
                Regular meals days: {reportQuery.data.nutrition.regularMealsDays}
              </p>
            </div>
          </Card>

          <Card title="Wearables">
            <div className="stack stack--1">
              <p className="muted-text">Tracked days: {reportQuery.data.wearables.trackedDays}</p>
              <p className="muted-text">
                Avg steps: {numberOrDash(reportQuery.data.wearables.avgSteps)}
              </p>
              <p className="muted-text">
                Avg active minutes: {numberOrDash(reportQuery.data.wearables.avgActiveMinutes)}
              </p>
              <p className="muted-text">Source: {reportQuery.data.wearables.source}</p>
            </div>
          </Card>

          <Card title="Medications">
            <div className="stack stack--1">
              <p className="muted-text">
                Scheduled doses: {reportQuery.data.medications.scheduledDoses}
              </p>
              <p className="muted-text">Taken doses: {reportQuery.data.medications.takenDoses}</p>
              <p className="muted-text">
                Skipped doses: {reportQuery.data.medications.skippedDoses}
              </p>
              <p className="muted-text">
                Adherence: {formatPct(reportQuery.data.medications.adherencePct)}
              </p>
            </div>
          </Card>

          <Card title="Exercise sessions">
            <div className="stack stack--1">
              <p className="muted-text">Sessions: {reportQuery.data.exercises.sessionCount}</p>
              <p className="muted-text">Total duration: {reportQuery.data.exercises.totalDurationMinutes} minutes</p>
              <p className="muted-text">
                Completion: {reportQuery.data.exercises.completedExercises}/{reportQuery.data.exercises.totalExercises}
              </p>
              <p className="muted-text">Average pain during: {numberOrDash(reportQuery.data.exercises.avgPainDuring)}</p>
              <p className="muted-text">
                Difficulty mix: easy {reportQuery.data.exercises.difficulty.easy}, ok {reportQuery.data.exercises.difficulty.ok}, hard {reportQuery.data.exercises.difficulty.hard}
              </p>
            </div>
          </Card>

          <Card title="Questionnaires (PROMs)">
            <div className="stack stack--1">
              <p className="muted-text">Due now: {reportQuery.data.proms.dueNowCount}</p>
              <p className="muted-text">Completed this week: {reportQuery.data.proms.completedThisWeekCount}</p>
              <p className="muted-text">
                Latest: {reportQuery.data.proms.latestCompleted
                  ? `${reportQuery.data.proms.latestCompleted.normalized} (${reportQuery.data.proms.latestCompleted.bandLabel}) · ${formatDateTime(reportQuery.data.proms.latestCompleted.completedAt)}`
                  : '—'}
              </p>
            </div>
          </Card>

          <Card title="Safety">
            <div className="stack stack--1">
              <p className="muted-text">Alerts created this week: {reportQuery.data.safety.alertsCreatedThisWeek}</p>
              <p className="muted-text">High-risk alerts this week: {reportQuery.data.safety.highRiskAlertsThisWeek}</p>
              <p className="muted-text">
                Period: {reportQuery.data.period.weekStart} to {reportQuery.data.period.weekEnd}
              </p>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
