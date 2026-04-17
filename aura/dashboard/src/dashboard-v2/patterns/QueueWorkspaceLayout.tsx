import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2QueueWorkspaceLayoutProps {
  header?: ReactNode;
  main: ReactNode;
  rail?: ReactNode;
  className?: string;
}

export function DashboardV2QueueWorkspaceLayout({
  header,
  main,
  rail,
  className,
}: DashboardV2QueueWorkspaceLayoutProps): JSX.Element {
  return (
    <section className={cn('v2-workspace-layout', className)}>
      {header ? <div className="v2-workspace-layout__header">{header}</div> : null}
      <div className="v2-workspace-layout__body">
        <div className="v2-workspace-layout__main">{main}</div>
        {rail ? <aside className="v2-workspace-layout__rail">{rail}</aside> : null}
      </div>
    </section>
  );
}
