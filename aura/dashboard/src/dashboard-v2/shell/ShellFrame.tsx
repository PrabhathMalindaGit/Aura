import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { DASHBOARD_V2_MAIN_ID, DASHBOARD_V2_RAIL_ID } from '../foundation/a11y';
import { DashboardV2SkipLinks } from './SkipLinks';

interface DashboardV2ShellFrameProps {
  navigation: ReactNode;
  bannerMeta?: ReactNode;
  search?: ReactNode;
  contextualRail?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DashboardV2ShellFrame({
  navigation,
  bannerMeta,
  search,
  contextualRail,
  footer,
  children,
}: DashboardV2ShellFrameProps): JSX.Element {
  return (
    <div className="dashboard-v2-shell">
      <DashboardV2SkipLinks />
      <div className="dashboard-v2-shell__layout">
        <aside className="dashboard-v2-shell__nav-shell">{navigation}</aside>
        <div className="dashboard-v2-shell__content-shell">
          <header className="dashboard-v2-shell__banner" role="banner">
            <div className="dashboard-v2-shell__banner-main">{bannerMeta}</div>
            {search ? (
              <div className="dashboard-v2-shell__search-shell" role="search" aria-label="Quick open workspace search">
                {search}
              </div>
            ) : null}
          </header>
          <div
            className={cn(
              'dashboard-v2-shell__workspace',
              contextualRail && 'dashboard-v2-shell__workspace--with-rail',
            )}
          >
            <main className="dashboard-v2-shell__main" id={DASHBOARD_V2_MAIN_ID} tabIndex={-1}>
              {children}
            </main>
            {contextualRail ? (
              <aside
                className="dashboard-v2-shell__rail"
                id={DASHBOARD_V2_RAIL_ID}
                role="complementary"
                aria-label="Contextual governance rail"
              >
                {contextualRail}
              </aside>
            ) : null}
          </div>
          <footer className="dashboard-v2-shell__footer" role="contentinfo">
            {footer}
          </footer>
        </div>
      </div>
    </div>
  );
}
