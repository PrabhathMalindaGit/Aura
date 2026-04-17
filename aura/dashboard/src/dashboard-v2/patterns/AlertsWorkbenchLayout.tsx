import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2AlertsWorkbenchLayoutProps {
  queue?: ReactNode;
  workspace: ReactNode;
  rail?: ReactNode;
  className?: string;
}

export function DashboardV2AlertsWorkbenchLayout({
  queue,
  workspace,
  rail,
  className,
}: DashboardV2AlertsWorkbenchLayoutProps): JSX.Element {
  return (
    <section
      className={cn(
        'v2-alerts-workbench',
        queue ? 'v2-alerts-workbench--with-queue' : 'v2-alerts-workbench--workspace-only',
        rail ? 'v2-alerts-workbench--with-rail' : 'v2-alerts-workbench--without-rail',
        className,
      )}
    >
      {queue ? <aside className="v2-alerts-workbench__queue">{queue}</aside> : null}
      <div className="v2-alerts-workbench__workspace">{workspace}</div>
      {rail ? <aside className="v2-alerts-workbench__rail">{rail}</aside> : null}
    </section>
  );
}
