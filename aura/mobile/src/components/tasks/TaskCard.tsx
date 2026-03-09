import { useMemo } from "react";
import { View } from "react-native";

import type { PatientTaskItem } from "@/src/types/task";
import {
  buildTaskChips,
  derivePatientTaskAction,
  formatTaskStatusLabel,
  formatTaskSupportText,
  getTaskIcon,
  taskStatusVariant,
} from "@/src/utils/tasks";
import { MediaCard } from "@/src/components/MediaCard";

type TaskCardProps = {
  task: PatientTaskItem;
  onPressAction: () => void;
  onPressComplete?: () => void;
  completing?: boolean;
  compact?: boolean;
  testID?: string;
};

export function TaskCard({
  task,
  onPressAction,
  onPressComplete,
  completing = false,
  compact = false,
  testID,
}: TaskCardProps) {
  const action = useMemo(() => derivePatientTaskAction(task), [task]);
  const chips = useMemo(() => buildTaskChips(task), [task]);
  const actions = [
    {
      label: action.label,
      kind: "primary" as const,
      onPress: onPressAction,
    },
    ...(task.patientCompletable && task.status !== "completed" && onPressComplete
      ? [
          {
            label: completing ? "Marking done…" : "Mark done",
            kind: "secondary" as const,
            disabled: completing,
            onPress: onPressComplete,
          },
        ]
      : []),
  ];

  return (
    <View testID={testID}>
      <MediaCard
        variant={compact ? "compact" : "default"}
        leading={{ type: "icon", icon: getTaskIcon(task), tone: "accent" }}
        title={task.title}
        subtitle={formatTaskSupportText(task)}
        statusPill={{
          text: formatTaskStatusLabel(task),
          tone: taskStatusVariant(task),
        }}
        chips={chips}
        actions={actions}
        showChevron={false}
        maxChips={4}
      />
    </View>
  );
}
