import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import type { DashboardSurfaceTone } from "../../../adapters/dashboard";

interface DashboardDirectionalCueProps {
  tone: DashboardSurfaceTone;
  intensity?: number;
  label?: string;
  className?: string;
}

interface CueModel {
  icon: LucideIcon;
  label: string;
  activeBars: number;
}

function cueModelForTone(
  tone: DashboardSurfaceTone,
  intensity: number,
): CueModel {
  const normalizedIntensity = Math.min(4, Math.max(1, intensity));

  if (tone === "critical") {
    return {
      icon: ArrowUpRight,
      label: "Rising pressure",
      activeBars: Math.max(3, normalizedIntensity),
    };
  }

  if (tone === "warning") {
    return {
      icon: ArrowUpRight,
      label: "Watch pressure",
      activeBars: Math.max(2, normalizedIntensity),
    };
  }

  if (tone === "success") {
    return {
      icon: ArrowDownRight,
      label: "Clear lane",
      activeBars: 1,
    };
  }

  return {
    icon: ArrowRight,
    label: "Steady lane",
    activeBars: Math.max(2, normalizedIntensity),
  };
}

export function DashboardDirectionalCue({
  tone,
  intensity = 2,
  label,
  className,
}: DashboardDirectionalCueProps): JSX.Element {
  const cue = cueModelForTone(tone, intensity);
  const Icon = cue.icon;

  return (
    <span
      className={[
        "v2-dashboard-directional-cue",
        `v2-dashboard-directional-cue--${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label ?? cue.label}
      title={label ?? cue.label}
    >
      <Icon size={12} aria-hidden="true" />
      <span className="v2-dashboard-directional-cue__spark" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            className={[
              "v2-dashboard-directional-cue__bar",
              index < cue.activeBars
                ? "v2-dashboard-directional-cue__bar--active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </span>
    </span>
  );
}
