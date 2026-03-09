import { StatusPill } from "@/src/components/StatusPill";

type UnreadBadgeProps = {
  count: number;
  compactLabel?: boolean;
};

export function UnreadBadge({ count, compactLabel = false }: UnreadBadgeProps) {
  if (count <= 0) {
    return <StatusPill label={compactLabel ? "All read" : "All caught up"} variant="neutral" />;
  }

  return (
    <StatusPill
      label={compactLabel ? `${count} new` : `${count} unread`}
      variant={count > 0 ? "info" : "neutral"}
    />
  );
}
