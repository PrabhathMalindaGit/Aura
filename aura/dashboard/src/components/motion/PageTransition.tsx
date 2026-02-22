import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../utils/cn';

interface PageTransitionProps {
  transitionKey: string;
  children: ReactNode;
  className?: string;
}

function scheduleAfterPaint(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  if (typeof window.requestAnimationFrame === 'function') {
    const frameId = window.requestAnimationFrame(() => callback());
    return () => window.cancelAnimationFrame(frameId);
  }

  const timeoutId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timeoutId);
}

export function PageTransition({
  transitionKey,
  children,
  className,
}: PageTransitionProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isEntering, setIsEntering] = useState(() => !prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsEntering(false);
      return;
    }

    setIsEntering(true);
    return scheduleAfterPaint(() => {
      setIsEntering(false);
    });
  }, [prefersReducedMotion, transitionKey]);

  return (
    <div
      data-testid="page-transition"
      className={cn(
        'page-transition',
        !prefersReducedMotion && 'page-transition--motion',
        isEntering && 'page-transition--entering',
        className,
      )}
    >
      {children}
    </div>
  );
}
