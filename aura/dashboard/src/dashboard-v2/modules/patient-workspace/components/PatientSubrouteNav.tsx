import { NavLink } from 'react-router-dom';
import type { PatientWorkspaceNavLinkVm, PatientWorkspaceTabId } from '../../../adapters/patientWorkspace';
import { cn } from '../../../../utils/cn';

interface PatientSubrouteNavProps {
  items: PatientWorkspaceNavLinkVm[];
  activeTab: PatientWorkspaceTabId;
}

export function PatientSubrouteNav({
  items,
  activeTab,
}: PatientSubrouteNavProps): JSX.Element {
  return (
    <nav
      className="v2-patient-subroute-nav"
      aria-label="Patient workspace sections"
      data-testid="v2-patient-subroute-nav"
    >
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.to}
          className={cn(
            'v2-patient-subroute-nav__link',
            activeTab === item.id && 'v2-patient-subroute-nav__link--active',
          )}
          data-testid={`v2-patient-nav-${item.id}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
