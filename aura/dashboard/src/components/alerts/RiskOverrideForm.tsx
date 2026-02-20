import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlertItem } from '../../types/models';
import {
  formatRiskLabel,
  getAutoRisk,
  hasRiskOverride,
  isOverrideReasonRequired,
  toRiskOptions,
} from '../../utils/risk';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface RiskOverrideFormProps {
  alert: AlertItem;
  saving?: boolean;
  backendReady?: boolean;
  onSave: (payload: { riskFinal: string; overrideReason?: string }) => void | Promise<void>;
  onClear: () => void | Promise<void>;
}

export function RiskOverrideForm({
  alert,
  saving = false,
  backendReady = false,
  onSave,
  onClear,
}: RiskOverrideFormProps): JSX.Element {
  const autoRisk = getAutoRisk(alert);
  const [finalRisk, setFinalRisk] = useState<string>(alert.riskFinal ?? autoRisk);
  const [overrideReason, setOverrideReason] = useState<string>(alert.overrideReason ?? '');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setFinalRisk(alert.riskFinal ?? autoRisk);
    setOverrideReason(alert.overrideReason ?? '');
  }, [alert.overrideReason, alert.riskFinal, autoRisk]);

  const reasonRequired = isOverrideReasonRequired(autoRisk, finalRisk);
  const reasonMissing = reasonRequired && overrideReason.trim().length === 0;
  const riskOptions = useMemo(() => toRiskOptions(autoRisk, alert.riskFinal), [alert.riskFinal, autoRisk]);
  const hasActiveOverride = hasRiskOverride(alert);
  const saveLabel = reasonRequired ? 'Save override' : 'Confirm auto risk';

  return (
    <>
      <section className="drawer-section" aria-label="Risk Override">
        <h3>Risk Override</h3>
        <p className="muted-text">Adjust final risk when clinician review differs from automated triage.</p>

        <div className="override-grid">
          <div className="form-field">
            <span>Auto risk</span>
            <Badge variant="default">{formatRiskLabel(autoRisk)}</Badge>
          </div>

          <label className="form-field" htmlFor="risk-final-select">
            <span>Final risk</span>
            <select
              id="risk-final-select"
              value={finalRisk}
              aria-label="Final risk"
              onChange={(event) => setFinalRisk(event.target.value)}
            >
              {riskOptions.map((option) => (
                <option key={option} value={option}>
                  {formatRiskLabel(option)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {alert.reasonsAuto?.length ? (
          <div className="form-field">
            <span>Auto reasons</span>
            <div className="override-reasons">
              {alert.reasonsAuto.map((reason) => (
                <Badge key={reason} variant="default">
                  {reason}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <label className="form-field" htmlFor="risk-override-reason">
          <span>Override reason {reasonRequired ? '(required)' : '(optional)'}</span>
          <textarea
            id="risk-override-reason"
            rows={3}
            value={overrideReason}
            aria-label="Override reason"
            onChange={(event) => setOverrideReason(event.target.value)}
          />
        </label>

        {reasonMissing ? (
          <p className="validation-text" role="alert" aria-live="assertive">
            Reason is required when final risk differs from auto risk.
          </p>
        ) : null}

        <div className="drawer-inline-actions">
          <Button
            variant="primary"
            disabled={reasonMissing || saving}
            onClick={() =>
              void onSave({
                riskFinal: finalRisk,
                overrideReason: overrideReason.trim() || undefined,
              })
            }
          >
            {saveLabel}
          </Button>
          {hasActiveOverride ? (
            <Button
              ref={clearButtonRef}
              variant="secondary"
              disabled={saving}
              onClick={() => setShowClearConfirm(true)}
            >
              Clear override
            </Button>
          ) : null}
          {!backendReady ? (
            <span className="muted-text">Saved locally. Endpoint pending: PATCH /clinician/alerts/:id/risk-override</span>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear override?"
        description="This will remove the clinician override and restore auto risk display."
        confirmLabel="Clear override"
        confirmVariant="danger"
        returnFocusRef={clearButtonRef}
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setShowClearConfirm(false);
          void onClear();
        }}
      />
    </>
  );
}
