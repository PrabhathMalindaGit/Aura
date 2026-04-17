import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2PatientWorkspaceLayoutProps {
  main: ReactNode;
  rail?: ReactNode;
  className?: string;
}

export function DashboardV2PatientWorkspaceLayout({
  main,
  rail,
  className,
}: DashboardV2PatientWorkspaceLayoutProps): JSX.Element {
  return (
    <section
      className={cn(
        'v2-patient-layout',
        rail ? 'v2-patient-layout--with-rail' : 'v2-patient-layout--without-rail',
        className,
      )}
    >
      <div className="v2-patient-layout__main">{main}</div>
      {rail ? <aside className="v2-patient-layout__rail">{rail}</aside> : null}
    </section>
  );
}
