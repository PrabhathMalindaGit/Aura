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
  line: string;
}

function cueModelForTone(
  tone: DashboardSurfaceTone,
  intensity: number,
): CueModel {
  const normalizedIntensity = Math.min(4, Math.max(1, intensity));
  const severityRise = 15 - normalizedIntensity * 2;
  const warningRise = 13 - normalizedIntensity * 1.4;
  const steadyPlateau = 10 - normalizedIntensity * 0.35;

  if (tone === "critical") {
    return {
      icon: ArrowUpRight,
      label: "Rising pressure",
      line: `2,13 7,${12 - normalizedIntensity * 0.4} 12,${10 - normalizedIntensity * 0.7} 17,${severityRise} 22,${Math.max(2, severityRise - 2)}`,
    };
  }

  if (tone === "warning") {
    return {
      icon: ArrowUpRight,
      label: "Watch pressure",
      line: `2,12 7,${11.3 - normalizedIntensity * 0.35} 12,${10.5 - normalizedIntensity * 0.35} 17,${warningRise} 22,${Math.max(4, warningRise - 0.8)}`,
    };
  }

  if (tone === "success") {
    return {
      icon: ArrowDownRight,
      label: "Clear lane",
      line: `2,5 7,${6.4 + normalizedIntensity * 0.3} 12,${8.4 + normalizedIntensity * 0.35} 17,${10.6 + normalizedIntensity * 0.25} 22,13`,
    };
  }

  return {
    icon: ArrowRight,
    label: "Steady lane",
    line: `2,${steadyPlateau + 0.5} 7,${steadyPlateau + 0.15} 12,${steadyPlateau - 0.2} 17,${steadyPlateau - 0.35} 22,${steadyPlateau - 0.1}`,
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
      <svg
        className="v2-dashboard-directional-cue__spark"
        aria-hidden="true"
        viewBox="0 0 24 16"
      >
        <path
          className="v2-dashboard-directional-cue__baseline"
          d="M2 13.5H22"
        />
        <polyline
          className="v2-dashboard-directional-cue__line"
          points={cue.line}
        />
      </svg>
    </span>
  );
}
