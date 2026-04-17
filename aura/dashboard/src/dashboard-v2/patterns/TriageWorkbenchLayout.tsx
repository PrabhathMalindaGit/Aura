import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2TriageWorkbenchLayoutProps {
  queue?: ReactNode;
  workspace: ReactNode;
  rail?: ReactNode;
  className?: string;
}

export function DashboardV2TriageWorkbenchLayout({
  queue,
  workspace,
  rail,
  className,
}: DashboardV2TriageWorkbenchLayoutProps): JSX.Element {
  return (
    <section
      className={cn(
        'v2-triage-workbench',
        queue ? 'v2-triage-workbench--with-queue' : 'v2-triage-workbench--workspace-only',
        rail ? 'v2-triage-workbench--with-rail' : 'v2-triage-workbench--without-rail',
        className,
      )}
    >
      {queue ? <aside className="v2-triage-workbench__queue">{queue}</aside> : null}
      <div className="v2-triage-workbench__workspace">{workspace}</div>
      {rail ? <aside className="v2-triage-workbench__rail">{rail}</aside> : null}
    </section>
  );
}
