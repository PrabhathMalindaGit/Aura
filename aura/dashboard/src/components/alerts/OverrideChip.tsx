import type { AlertItem } from '../../types/models';
import { formatRiskLabel, getAutoRisk, hasRiskOverride } from '../../utils/risk';
import { Badge } from '../ui/Badge';

interface OverrideChipProps {
  alert: AlertItem;
}

export function OverrideChip({ alert }: OverrideChipProps): JSX.Element | null {
  if (!hasRiskOverride(alert)) {
    return null;
  }

  return (
    <Badge
      variant="warning"
      title={`Auto ${formatRiskLabel(getAutoRisk(alert))} → Final ${formatRiskLabel(alert.riskFinal)}`}
    >
      Overridden
    </Badge>
  );
}
