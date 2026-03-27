import { cn } from '../../utils/cn';
import { Badge } from '../ui/Badge';
import type { WorklistRecord } from '../../types/models';
import { worklistPriorityLabel, worklistPriorityTone } from '../../utils/worklist';

interface WorklistPriorityBadgeProps {
  item: WorklistRecord;
  className?: string;
}

export function WorklistPriorityBadge({
  item,
  className,
}: WorklistPriorityBadgeProps): JSX.Element {
  const tone = worklistPriorityTone(item);

  return (
    <Badge
      className={cn('worklist-priority-badge', `worklist-priority-badge--${tone}`, className)}
      variant={tone}
    >
      {worklistPriorityLabel(item)}
    </Badge>
  );
}
