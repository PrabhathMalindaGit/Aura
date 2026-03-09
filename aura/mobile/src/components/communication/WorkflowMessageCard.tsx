import { TipCard, type TipCardTone } from "@/src/components/TipCard";

type WorkflowMessageCardProps = {
  title: string;
  text: string;
  chips?: string[];
  tone?: TipCardTone;
  actionLabel: string;
  onAction: () => void;
  compact?: boolean;
  testID?: string;
};

export function WorkflowMessageCard({
  title,
  text,
  chips = [],
  tone = "info",
  actionLabel,
  onAction,
  compact = false,
  testID,
}: WorkflowMessageCardProps) {
  return (
    <TipCard
      testID={testID}
      compact={compact}
      tone={tone}
      leading={{ type: "icon", icon: "chat", tone: "accent" }}
      title={title}
      text={text}
      chips={chips}
      actions={[
        {
          label: actionLabel,
          kind: "primary",
          onPress: onAction,
        },
      ]}
    />
  );
}
