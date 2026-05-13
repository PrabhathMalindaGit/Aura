import { useMemo } from "react";
import { View } from "react-native";

import type { PatientTaskItem } from "@/src/types/task";
import {
  buildTaskChips,
  derivePatientTaskAction,
  formatTaskStatusLabel,
  formatTaskSupportText,
  formatTaskTitle,
  getTaskIcon,
  taskStatusVariant,
} from "@/src/utils/tasks";
import { MediaCard } from "@/src/components/MediaCard";

function leadingToneForTask(task: PatientTaskItem): "muted" | "accent" | "success" | "warning" | "danger" {
  const statusTone = taskStatusVariant(task);
  if (statusTone === "success") {
    return "success";
  }
  if (statusTone === "warning") {
    return "warning";
  }
  if (statusTone === "danger") {
    return "danger";
  }
  if (statusTone === "info") {
    return "accent";
  }
  return "muted";
}

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
        leading={{ type: "icon", icon: getTaskIcon(task), tone: leadingToneForTask(task) }}
        title={formatTaskTitle(task)}
        subtitle={formatTaskSupportText(task)}
        statusPill={{
          text: formatTaskStatusLabel(task),
          tone: taskStatusVariant(task),
        }}
        density="calm"
        chips={chips}
        actions={actions}
        showChevron={false}
        maxChips={4}
      />
    </View>
  );
}
