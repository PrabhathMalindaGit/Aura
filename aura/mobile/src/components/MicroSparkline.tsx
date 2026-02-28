import { useMemo } from "react";
import Svg, { Circle, Path, Polyline } from "react-native-svg";

import { useTokens } from "@/src/theme/tokens";

export type MicroSparklineTone =
  | "muted"
  | "primary"
  | "accent"
  | "success"
  | "warning";

export type MicroSparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  tone?: MicroSparklineTone;
  showEndDot?: boolean;
  showBaseline?: boolean;
  clamp?: boolean;
  testID?: string;
};

function resolveToneColor(
  tone: MicroSparklineTone,
  tokens: ReturnType<typeof useTokens>,
): string {
  if (tone === "primary") {
    return tokens.colors.primary;
  }
  if (tone === "accent") {
    return tokens.colors.accent;
  }
  if (tone === "success") {
    return tokens.colors.success;
  }
  if (tone === "warning") {
    return tokens.colors.warning;
  }
  return tokens.colors.textMuted;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function MicroSparkline({
  values,
  width = 72,
  height = 22,
  strokeWidth = 2,
  tone = "muted",
  showEndDot = true,
  showBaseline = false,
  clamp = true,
  testID,
}: MicroSparklineProps) {
  const tokens = useTokens();
  const color = resolveToneColor(tone, tokens);

  const { points, pointsString } = useMemo(() => {
    const padding = strokeWidth;
    const drawableWidth = Math.max(0, width - padding * 2);
    const drawableHeight = Math.max(0, height - padding * 2);

    if (values.length < 2) {
      const midY = padding + drawableHeight / 2;
      const fallbackPoints = [
        { x: padding, y: midY },
        { x: padding + drawableWidth, y: midY },
      ];
      return {
        points: fallbackPoints,
        pointsString: fallbackPoints.map((point) => `${point.x},${point.y}`).join(" "),
      };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const isFlat = min === max;
    const step = values.length > 1 ? drawableWidth / (values.length - 1) : 0;

    const plotted = values.map((value, index) => {
      const rawNormalized = isFlat ? 0.5 : (value - min) / (max - min);
      const normalized = clamp ? clamp01(rawNormalized) : rawNormalized;
      return {
        x: padding + step * index,
        y: padding + (1 - normalized) * drawableHeight,
      };
    });

    return {
      points: plotted,
      pointsString: plotted.map((point) => `${point.x},${point.y}`).join(" "),
    };
  }, [clamp, height, strokeWidth, values, width]);

  const lastPoint = points[points.length - 1];
  const baselineY = height / 2;

  return (
    <Svg
      testID={testID}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      accessibilityRole="image"
      accessible
      accessibilityLabel="Trend sparkline"
    >
      {showBaseline ? (
        <Path
          d={`M ${strokeWidth} ${baselineY} L ${Math.max(strokeWidth, width - strokeWidth)} ${baselineY}`}
          stroke={tokens.colors.border}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
      ) : null}
      <Polyline
        points={pointsString}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showEndDot && lastPoint ? (
        <Circle cx={lastPoint.x} cy={lastPoint.y} r={Math.max(1.5, strokeWidth)} fill={color} />
      ) : null}
    </Svg>
  );
}
