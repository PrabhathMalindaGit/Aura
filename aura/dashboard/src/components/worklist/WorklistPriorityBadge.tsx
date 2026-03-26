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
  return (
    <Badge className={cn('worklist-priority-badge', className)} variant={worklistPriorityTone(item)}>
      {worklistPriorityLabel(item)}
    </Badge>
  );
}
