import {
  formatAlertBurdenText,
  getAlertBurdenTone,
  getPainLevelMeta,
} from './patientRosterSignalUtils';

interface PatientAlertBurdenSignalProps {
  count: number;
}

export function PatientAlertBurdenSignal({
  count,
}: PatientAlertBurdenSignalProps): JSX.Element {
  const tone = getAlertBurdenTone(count);
  const filledSteps = Math.min(Math.max(count, 0), 4);
  const countLabel = count === 0 ? 'Clear' : `${count} open`;

  return (
    <div className={`patient-alert-burden patient-alert-burden--${tone}`}>
      <div className="patient-alert-burden__summary">
        <span className="patient-alert-burden__count">{countLabel}</span>
        <span className="patient-alert-burden__text">{formatAlertBurdenText(count)}</span>
      </div>
      <div
        className="patient-alert-burden__steps"
        role="img"
        aria-label={`Alert burden: ${formatAlertBurdenText(count)}`}
      >
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            className={`patient-alert-burden__step${
              index < filledSteps ? ' patient-alert-burden__step--filled' : ''
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

interface PatientPainLevelSignalProps {
  value: number | undefined;
}

export function PatientPainLevelSignal({
  value,
}: PatientPainLevelSignalProps): JSX.Element {
  const meta = getPainLevelMeta(value);

  return (
    <div className={`patient-pain-level patient-pain-level--${meta.tone}`}>
      <div className="patient-pain-level__summary">
        <span className="patient-pain-level__value">{meta.valueText}</span>
        <span className="patient-pain-level__label">{meta.label}</span>
      </div>
      <span className="patient-pain-level__text">{meta.support}</span>
    </div>
  );
}
