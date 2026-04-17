import { useLocation } from 'react-router-dom';
import { AppShell } from '../../app/AppShell';
import { DashboardV2Shell } from '../shell/DashboardV2Shell';
import { shouldUseDashboardV2Shell } from './migrationGates';

export function AppShellFacade(): JSX.Element {
  const { pathname } = useLocation();

  return shouldUseDashboardV2Shell(pathname) ? <DashboardV2Shell /> : <AppShell />;
}
