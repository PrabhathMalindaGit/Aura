import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface FollowUpWorkbenchLayoutProps {
  lane?: ReactNode;
  workspace: ReactNode;
  rail?: ReactNode;
  className?: string;
}

export function FollowUpWorkbenchLayout({
  lane,
  workspace,
  rail,
  className,
}: FollowUpWorkbenchLayoutProps): JSX.Element {
  return (
    <section
      className={cn(
        'v2-follow-up-workbench',
        lane ? 'v2-follow-up-workbench--with-lane' : 'v2-follow-up-workbench--workspace-only',
        rail ? 'v2-follow-up-workbench--with-rail' : 'v2-follow-up-workbench--without-rail',
        className,
      )}
    >
      {lane ? <aside className="v2-follow-up-workbench__lane">{lane}</aside> : null}
      <div className="v2-follow-up-workbench__workspace">{workspace}</div>
      {rail ? <aside className="v2-follow-up-workbench__rail">{rail}</aside> : null}
    </section>
  );
}
