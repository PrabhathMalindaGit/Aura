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

export function AppShell(): JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

    return 'Alerts';
  }, [pathname]);

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
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
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
