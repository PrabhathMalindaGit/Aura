import { Database } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';

interface LoadPresentationDataButtonProps {
  loaded: boolean;
  onLoad: () => void;
}

export function LoadPresentationDataButton({
  loaded,
  onLoad,
}: LoadPresentationDataButtonProps): JSX.Element {
  return (
    <DashboardV2Button
      className="v2-load-presentation-data-button"
      tone={loaded ? 'secondary' : 'quiet'}
      size="sm"
      onPress={onLoad}
      leadingIcon={<Database size={14} />}
    >
      {loaded ? 'Presentation data loaded' : 'Load presentation data'}
    </DashboardV2Button>
  );
}
