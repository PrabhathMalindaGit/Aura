import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SessionTimeoutModal } from '../components/auth/SessionTimeoutModal';
import { PageTransition } from '../components/motion/PageTransition';
import { MobileNavSheet } from '../components/nav/MobileNavSheet';
import { OfflineBanner } from '../components/system/OfflineBanner';
import { Sidebar } from '../components/nav/Sidebar';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Inset } from '../components/ui/Inset';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useSidebarMode } from '../hooks/useSidebarMode';
import { useConnectionStatus } from '../services/connection';
import { subscribeAuthRequired } from '../services/apiClient';
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
import { getClinicianName } from '../services/clinicianIdentity';
import { clearDashboardSessionData } from '../utils/storageKeys';
import { cn } from '../utils/cn';

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

function formatWorkspaceDateTime(nowMs: number): string {
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(nowMs);
}

function getInitials(name: string): string {
  const segments = name
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return 'AC';
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell(): JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sessionSettings, setSessionSettings] = useState<SessionSettings>(() => getSessionSettings());
  const [sessionWarning, setSessionWarning] = useState<SessionTimeoutWarning | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sessionManagerRef = useRef<SessionTimeoutManager | null>(null);
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const { mode: sidebarMode, toggleMode: toggleSidebarMode } = useSidebarMode({
    isMobile,
    isTablet,
    isDesktop,
  });
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

  const handleSignOut = useCallback(() => {
    clearDashboardSessionData();
    setMobileNavOpen(false);
    setSessionWarning(null);
    navigate('/login', {
      replace: true,
      state: { reason: 'signedOut' },
    });
  }, [navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const manager = createSessionTimeoutManager({
      config: getSessionSettings(),
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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    return subscribeAuthRequired((reason) => {
      setMobileNavOpen(false);
      setSessionWarning(null);
      navigate('/login', {
        replace: true,
        state: {
          reason,
          from: `${pathname}`,
        },
      });
    });
  }, [navigate, pathname]);

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/dashboard')) {
      return 'Dashboard';
    }

    if (pathname.startsWith('/worklist')) {
      return 'Worklist';
    }

    if (pathname.startsWith('/patients/')) {
      return 'Patient Detail';
    }

    if (pathname.startsWith('/insights')) {
      return 'Insights Queue';
    }

    if (pathname.startsWith('/appointments')) {
      return 'Appointments';
    }

    if (pathname.startsWith('/patients')) {
      return 'Patients';
    }

    if (pathname.startsWith('/settings')) {
      return 'Settings';
    }

    return 'Dashboard';
  }, [pathname]);

  const clinicianName = useMemo(() => getClinicianName(), []);
  const clinicianInitials = useMemo(() => getInitials(clinicianName), [clinicianName]);

  return (
    <div
      className={cn(
        'app-shell',
        !isMobile && 'app-shell--with-sidebar',
        !isMobile && sidebarMode === 'expanded' && 'app-shell--sidebar-expanded',
        !isMobile && sidebarMode === 'icon' && 'app-shell--sidebar-icon',
      )}
    >
      {!isMobile ? <Sidebar mode={sidebarMode} onToggleMode={toggleSidebarMode} /> : null}

      <div className="shell-main">
        <header className={cn('topbar', 'glass-card')}>
          <div className="topbar__left">
            {isMobile ? (
              <IconButton
                aria-label="Open navigation menu"
                aria-expanded={mobileNavOpen}
                className="mobile-only"
                onClick={() => setMobileNavOpen(true)}
              >
                ☰
              </IconButton>
            ) : null}
            <div className="topbar__title-group">
              <p className="topbar__eyebrow">Aura Clinician</p>
              <h1 className="topbar__title">{pageTitle}</h1>
              <p className="topbar__subtitle">Calm clinical workspace for today&apos;s follow-up.</p>
            </div>
          </div>

          <form
            className="topbar__search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <span className="topbar__search-icon" aria-hidden="true">
              ⌕
            </span>
            <label className="visually-hidden" htmlFor="dashboard-shell-search">
              Search patients, alerts, and IDs
            </label>
            <input
              id="dashboard-shell-search"
              type="search"
              className="topbar__search-input"
              placeholder="Search patient name, ID, alert"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
              }}
              autoComplete="off"
            />
          </form>

          <div className="topbar__status">
            <div className="topbar__utility">
              <span className="topbar__datetime">{formatWorkspaceDateTime(nowMs)}</span>
              <div className="topbar__status-cluster">
                <Badge variant={connection.online ? 'success' : 'danger'} icon>
                  {connection.online ? 'Connected' : 'Offline'}
                </Badge>
                <span className="topbar__updated" aria-live="polite">
                  Updated {formatLastUpdated(connection.lastSuccessAt)}
                </span>
              </div>
            </div>

            <div className="topbar__identity">
              <span className="topbar__avatar" aria-hidden="true">
                {clinicianInitials}
              </span>
              <div className="topbar__identity-copy">
                <strong className="topbar__identity-name">{clinicianName}</strong>
                <span className="topbar__identity-role">Clinician workspace</span>
              </div>
              <Button className="topbar__signout" variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <OfflineBanner />

        <main className="main-content" id="main-content" tabIndex={-1}>
          <Inset padding="page">
            <PageTransition transitionKey={pathname}>
              <Outlet />
            </PageTransition>
          </Inset>
        </main>
      </div>

      {isMobile ? <MobileNavSheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} /> : null}

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
