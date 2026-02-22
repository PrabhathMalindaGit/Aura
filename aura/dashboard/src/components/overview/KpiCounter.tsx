import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

interface KpiCounterProps {
  value: number;
  reserveDigits?: number;
  durationMs?: number;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function KpiCounter({
  value,
  reserveDigits = 3,
  durationMs = 520,
}: KpiCounterProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const from = previousValueRef.current;
    const to = value;
    previousValueRef.current = value;

    if (prefersReducedMotion || from === to) {
      setDisplayValue(to);
      return;
    }

    const start = performance.now();
    let frameId = 0;

    const tick = (timestamp: number): void => {
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);
      const nextValue = Math.round(from + (to - from) * eased);
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [durationMs, prefersReducedMotion, value]);

  return (
    <span className="kpi-counter" style={{ minWidth: `${reserveDigits}ch` }}>
      {displayValue.toLocaleString()}
    </span>
  );
}
