import { Button } from '../ui/Button';

interface RetryButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onRetry: () => void;
  label?: string;
}

export function RetryButton({
  loading = false,
  disabled = false,
  onRetry,
  label = 'Retry',
}: RetryButtonProps): JSX.Element {
  return (
    <Button
      variant="secondary"
      disabled={loading || disabled}
      onClick={onRetry}
      aria-label={label}
    >
      {loading ? 'Retrying...' : label}
    </Button>
  );
}
