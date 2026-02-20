import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SessionTimeoutModal } from '../components/auth/SessionTimeoutModal';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { useConnectionStatus } from '../services/connection';
import {
  createSessionTimeoutManager,
  type SessionTimeoutManager,
  type SessionTimeoutReason,
  type SessionTimeoutWarning,
} from '../services/sessionTimeout';
import {
  getSessionSettings,
  subscribeSessionSettings,
  type SessionSettings,
} from '../services/sessionSettings';
import { clearDashboardSessionData } from '../utils/storageKeys';
import { cn } from '../utils/cn';

interface NavItem {
  label: string;
  to: string;
}

const navItems: NavItem[] = [
  { label: 'Alerts', to: '/alerts' },
  { label: 'Patients', to: '/patients' },
  { label: 'Settings', to: '/settings' },
];

function formatLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AppShell(): JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sessionSettings, setSessionSettings] = useState<SessionSettings>(() => getSessionSettings());
  const [sessionWarning, setSessionWarning] = useState<SessionTimeoutWarning | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sessionManagerRef = useRef<SessionTimeoutManager | null>(null);
  const connection = useConnectionStatus();

  const handleSessionLogout = useCallback(
    (reason: SessionTimeoutReason) => {
      clearDashboardSessionData();
      setMobileNavOpen(false);
      setSessionWarning(null);
      navigate('/session-ended', {
        replace: true,
        state: { reason },
      });
    },
    [navigate],
  );

  useEffect(() => {
    const manager = createSessionTimeoutManager({
      config: sessionSettings,
      onWarningChange: setSessionWarning,
      onLogout: handleSessionLogout,
    });

    sessionManagerRef.current = manager;
    manager.start();

    return () => {
      manager.stop();
      sessionManagerRef.current = null;
    };
  }, [handleSessionLogout]);

  useEffect(() => {
    sessionManagerRef.current?.updateConfig(sessionSettings);
  }, [sessionSettings]);

  useEffect(() => {
    setSessionSettings(getSessionSettings());
    return subscribeSessionSettings((next) => {
      setSessionSettings(next);
    });
  }, []);

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/patients/')) {
      return 'Patient Detail';
    }

    if (pathname.startsWith('/patients')) {
      return 'Patients';
    }

    if (pathname.startsWith('/settings')) {
      return 'Settings';
    }

    return 'Alerts';
  }, [pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar__brand">Aura Clinician</div>
        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn('sidebar__link', isActive && 'sidebar__link--active')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar__left">
            <IconButton
              aria-label="Open navigation menu"
              className="mobile-only"
              onClick={() => setMobileNavOpen(true)}
            >
              ☰
            </IconButton>
            <div>
              <h1 className="topbar__title">Aura Clinician Dashboard</h1>
              <p className="topbar__subtitle">{pageTitle}</p>
            </div>
          </div>
          <div className="topbar__status">
            <Badge variant={connection.online ? 'success' : 'danger'} icon>
              {connection.online ? 'Online' : 'Offline'}
            </Badge>
            <span className="topbar__updated" aria-live="polite">
              Last updated: {formatLastUpdated(connection.lastSuccessAt)}
            </span>
          </div>
        </header>

        <main className="main-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <div className={cn('mobile-nav', mobileNavOpen && 'mobile-nav--open')}>
        <button
          type="button"
          className="mobile-nav__overlay"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
        <aside className="mobile-nav__panel" aria-label="Mobile navigation menu">
          <div className="mobile-nav__header">
            <span>Menu</span>
            <IconButton aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)}>
              ✕
            </IconButton>
          </div>
          <nav className="mobile-nav__list">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn('sidebar__link', isActive && 'sidebar__link--active')}
                onClick={() => setMobileNavOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
      </div>

      <SessionTimeoutModal
        open={Boolean(sessionWarning)}
        warning={sessionWarning}
        onContinueSession={() => {
          sessionManagerRef.current?.continueSession();
        }}
        onLogoutNow={() => {
          sessionManagerRef.current?.logout('manual');
        }}
      />
    </div>
  );
}
