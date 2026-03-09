import { View } from "react-native";

import { MediaCard } from "@/src/components/MediaCard";
import type { ReminderItem } from "@/src/types/reminder";

type ReminderCardProps = {
  reminder: ReminderItem;
  compact?: boolean;
  onPressPrimary: () => void;
  onPressSecondary?: () => void;
  secondaryLabel?: string;
  secondaryBusy?: boolean;
  testID?: string;
};

function toneToStatusTone(
  status: ReminderItem["status"],
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "overdue") {
    return "danger";
  }
  if (status === "due") {
    return "warning";
  }
  if (status === "completed") {
    return "success";
  }
  if (status === "unread") {
    return "info";
  }
  return "neutral";
}

export function ReminderCard({
  reminder,
  compact = false,
  onPressPrimary,
  onPressSecondary,
  secondaryLabel,
  secondaryBusy = false,
  testID,
}: ReminderCardProps) {
  return (
    <View testID={testID}>
      <MediaCard
        variant={compact ? "compact" : "default"}
        leading={{ type: "icon", icon: reminder.primaryActionIcon, tone: "accent" }}
        title={reminder.title}
        subtitle={reminder.message}
        statusPill={{
          text: reminder.statusLabel,
          tone: toneToStatusTone(reminder.status),
        }}
        chips={[
          ...(reminder.unread ? [{ text: "New", tone: "info" as const }] : []),
          ...(reminder.timingLabel ? [{ text: reminder.timingLabel, tone: "muted" as const }] : []),
          ...reminder.chips.map((chip) => ({ text: chip, tone: "muted" as const })),
        ]}
        maxChips={4}
        actions={[
          {
            label: reminder.primaryActionLabel,
            kind: "primary",
            onPress: onPressPrimary,
          },
          ...(secondaryLabel && onPressSecondary
            ? [
                {
                  label: secondaryBusy ? `${secondaryLabel}…` : secondaryLabel,
                  kind: "secondary" as const,
                  disabled: secondaryBusy,
                  onPress: onPressSecondary,
                },
              ]
            : []),
        ]}
        showChevron={false}
      />
    </View>
  );
}
