import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2InboxWorkbenchLayoutProps {
  queue?: ReactNode;
  workspace: ReactNode;
  rail?: ReactNode;
  className?: string;
}

export function DashboardV2InboxWorkbenchLayout({
  queue,
  workspace,
  rail,
  className,
}: DashboardV2InboxWorkbenchLayoutProps): JSX.Element {
  return (
    <section
      className={cn(
        'v2-inbox-workbench',
        queue ? 'v2-inbox-workbench--with-queue' : 'v2-inbox-workbench--workspace-only',
        rail ? 'v2-inbox-workbench--with-rail' : 'v2-inbox-workbench--without-rail',
        className,
      )}
    >
      {queue ? <aside className="v2-inbox-workbench__queue">{queue}</aside> : null}
      <div className="v2-inbox-workbench__workspace">{workspace}</div>
      {rail ? <aside className="v2-inbox-workbench__rail">{rail}</aside> : null}
    </section>
  );
}
