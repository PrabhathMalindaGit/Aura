import { DASHBOARD_V2_MAIN_ID, DASHBOARD_V2_RAIL_ID } from '../foundation/a11y';

export function DashboardV2SkipLinks(): JSX.Element {
  return (
    <div className="dashboard-v2-shell__skip-links">
      <a className="dashboard-v2-shell__skip-link" href={`#${DASHBOARD_V2_MAIN_ID}`}>
        Skip to main content
      </a>
      <a className="dashboard-v2-shell__skip-link" href={`#${DASHBOARD_V2_RAIL_ID}`}>
        Skip to context rail
      </a>
    </div>
  );
}
