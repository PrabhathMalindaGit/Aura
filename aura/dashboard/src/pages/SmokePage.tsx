import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { getApiBaseUrl } from '../services/apiClient';
import { useConnectionStatus } from '../services/connection';
import { runSmokeChecks } from '../services/smokeChecks';
import type { SmokeCheckResult, SmokeCheckKey, SmokeStatus } from '../types/smoke';

interface CheckDefinition {
  key: SmokeCheckKey;
  name: string;
}

const CHECK_ORDER: CheckDefinition[] = [
  { key: 'health', name: 'Health' },
  { key: 'alerts', name: 'Open alerts' },
  { key: 'context', name: 'Alert context' },
  { key: 'patients', name: 'Patients list' },
  { key: 'trends', name: 'Patient trends (14d)' },
];

function statusBadgeVariant(status: SmokeStatus): 'success' | 'danger' | 'default' | 'neutral' {
  if (status === 'PASS') {
    return 'success';
  }

  if (status === 'FAIL') {
    return 'danger';
  }

  if (status === 'NOT_READY') {
    return 'neutral';
  }

  return 'default';
}

function formatLatency(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return `${value} ms`;
}

function formatLastSuccess(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function isFatalFailure(results: SmokeCheckResult[]): boolean {
  return results.some((result) => result.key === 'health' && result.status === 'FAIL');
}

function sortedResults(results: SmokeCheckResult[]): SmokeCheckResult[] {
  const map = new Map(results.map((result) => [result.key, result]));
  return CHECK_ORDER.map((check) => map.get(check.key)).filter(Boolean) as SmokeCheckResult[];
}

export function SmokePage(): JSX.Element {
  const apiBaseUrl = getApiBaseUrl();
  const connection = useConnectionStatus();
  const [results, setResults] = useState<SmokeCheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setRunError(null);

    try {
      const nextResults = await runSmokeChecks(apiBaseUrl);
      setResults(nextResults);
    } catch {
      setRunError('Unable to run smoke checks. Verify API base URL and backend availability.');
    } finally {
      setRunning(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const orderedResults = useMemo(() => sortedResults(results), [results]);
  const showFatalBanner = isFatalFailure(orderedResults);

  return (
    <div className="page-stack smoke-page">
      <Card
        title="Live Integration Smoke"
        action={
          <div className="smoke-actions">
            <Button variant="secondary" data-testid="smoke-run" onClick={() => void runChecks()} disabled={running}>
              {running ? 'Running...' : 'Run checks'}
            </Button>
            <Button variant="ghost" onClick={() => void runChecks()} disabled={running}>
              Retry all
            </Button>
          </div>
        }
      >
        <div className="smoke-meta">
          <p>
            API base URL:{' '}
            <code data-testid="smoke-api-base" className="smoke-inline-code">
              {apiBaseUrl}
            </code>
          </p>
          <p className="muted-text">
            Connection: {connection.online ? 'Online' : 'Offline'} | Last success:{' '}
            {formatLastSuccess(connection.lastSuccessAt)}
          </p>
        </div>

        {runError ? (
          <AlertBanner variant="error" title="Smoke check failed">
            {runError}
          </AlertBanner>
        ) : null}

        {showFatalBanner ? (
          <AlertBanner variant="warning" title="Unable to reach service">
            Health check failed. Verify backend status and API base URL, then retry.
          </AlertBanner>
        ) : null}

        {running && orderedResults.length === 0 ? (
          <div className="smoke-skeleton-grid" aria-label="Smoke checks loading">
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </div>
        ) : (
          <div className="table-wrap" role="region" aria-label="Smoke checks table">
            <table className="table smoke-table">
              <thead>
                <tr>
                  <th className="table__head">Check</th>
                  <th className="table__head">Endpoint</th>
                  <th className="table__head">Status</th>
                  <th className="table__head">HTTP</th>
                  <th className="table__head">Latency</th>
                  <th className="table__head">Message</th>
                </tr>
              </thead>
              <tbody>
                {orderedResults.map((result) => (
                  <tr key={result.key} className="table__row" data-testid={`smoke-row-${result.key}`}>
                    <td className="table__cell">{result.name}</td>
                    <td className="table__cell">
                      <code className="smoke-inline-code">{result.endpoint}</code>
                    </td>
                    <td className="table__cell">
                      <Badge
                        variant={statusBadgeVariant(result.status)}
                        data-testid={`smoke-status-${result.key}`}
                      >
                        {result.status}
                      </Badge>
                    </td>
                    <td className="table__cell">{result.httpCode ?? '--'}</td>
                    <td className="table__cell">{formatLatency(result.latencyMs)}</td>
                    <td className="table__cell">
                      <p>{result.message}</p>
                      {result.developerHint ? <p className="muted-text">{result.developerHint}</p> : null}
                      <code className="smoke-curl">{result.curlCommand}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Common fixes">
        <ul className="smoke-fix-list">
          <li>Backend not running: start the backend service and verify `GET /health` responds.</li>
          <li>Wrong `VITE_API_BASE_URL`: point dashboard to the backend origin.</li>
          <li>CORS blocked: ensure backend sends `Access-Control-Allow-Origin` for dashboard origin.</li>
          <li>Endpoint missing: implement the exact path shown as `ENDPOINT NOT READY`.</li>
        </ul>
      </Card>
    </div>
  );
}
