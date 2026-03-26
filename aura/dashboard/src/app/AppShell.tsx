import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SessionTimeoutModal } from '../components/auth/SessionTimeoutModal';
import { PageTransition } from '../components/motion/PageTransition';
import { MobileNavSheet } from '../components/nav/MobileNavSheet';
import { OfflineBanner } from '../components/system/OfflineBanner';
import { Sidebar } from '../components/nav/Sidebar';
import { ClinicianAvatar } from '../components/ui/ClinicianAvatar';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Inset } from '../components/ui/Inset';
import { useClinicianIdentity } from '../hooks/useClinicianIdentity';
import { useClinicianWorkspacePreferences } from '../hooks/useClinicianWorkspacePreferences';
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

interface ShellPageConfig {
  title: string;
  subtitle: string;
}

const SHELL_PAGE_CONFIGS: Array<{
  matches: (pathname: string) => boolean;
  config: ShellPageConfig;
}> = [
  {
    matches: (pathname) => pathname.startsWith('/patients/'),
    config: {
      title: 'Patient Detail',
      subtitle: 'Longitudinal patient review with alerts, communication, tasks, and trends.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/worklist'),
    config: {
      title: 'Worklist',
      subtitle:
        'Active review queue across safety, adherence, communication, tasks, and appointments.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/communication'),
    config: {
      title: 'Communication',
      subtitle: 'Patient-linked communication review with response-needed and safety-aware follow-through.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/alerts'),
    config: {
      title: 'Alerts',
      subtitle: 'Triage safety alerts with assignment, acknowledgment, and follow-up context.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/insights'),
    config: {
      title: 'Insights',
      subtitle: 'Review pending guidance before clinician approval.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/appointments'),
    config: {
      title: 'Appointments',
      subtitle: 'Scheduling and capacity coordination for patient follow-up.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/patients'),
    config: {
      title: 'Patients',
      subtitle: 'Broad care roster before deeper patient review.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/settings'),
    config: {
      title: 'Settings',
      subtitle: 'Local browser-only workspace preferences and session protection.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard'),
    config: {
      title: 'Dashboard',
      subtitle: "Command center for today's safety, follow-up, and coordination.",
    },
  },
];

const QUICK_OPEN_ROUTES: Record<string, string> = {
  dashboard: '/dashboard',
  worklist: '/worklist',
  alerts: '/alerts',
  patients: '/patients',
  appointments: '/appointments',
  insights: '/insights',
  settings: '/settings',
};

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

function formatWorkspaceDateTime(nowMs: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(nowMs);
  } catch {
    return new Intl.DateTimeFormat([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(nowMs);
  }
}

function formatWorkspaceDateTimeTitle(nowMs: number, timeZone?: string): string {
  const resolvedTimeZone = timeZone ?? 'local browser time';

  try {
    return `${new Intl.DateTimeFormat([], {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(nowMs)} · ${resolvedTimeZone}`;
  } catch {
    return `${new Intl.DateTimeFormat([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(nowMs)} · ${resolvedTimeZone}`;
  }
}

function MenuIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7.25A1.25 1.25 0 0 1 5.25 6h13.5a1.25 1.25 0 1 1 0 2.5H5.25A1.25 1.25 0 0 1 4 7.25Zm0 4.75a1.25 1.25 0 0 1 1.25-1.25h13.5a1.25 1.25 0 1 1 0 2.5H5.25A1.25 1.25 0 0 1 4 12Zm0 4.75a1.25 1.25 0 0 1 1.25-1.25h9.5a1.25 1.25 0 1 1 0 2.5h-9.5A1.25 1.25 0 0 1 4 16.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.5 4a6.5 6.5 0 1 0 3.96 11.65l3.94 3.94a1 1 0 0 0 1.41-1.42l-3.93-3.93A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
        fill="currentColor"
      />
    </svg>
  );
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
  const clinicianIdentity = useClinicianIdentity();
  const workspacePreferences = useClinicianWorkspacePreferences();

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

  const pageConfig = useMemo<ShellPageConfig>(() => {
    const match = SHELL_PAGE_CONFIGS.find((entry) => entry.matches(pathname));
    return match?.config ?? SHELL_PAGE_CONFIGS[SHELL_PAGE_CONFIGS.length - 1].config;
  }, [pathname]);
  const identityTitle = [
    clinicianIdentity.displayName,
    clinicianIdentity.secondaryLine,
    `Local availability: ${workspacePreferences.availabilityLabel}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const identityEntryLabel = `Open clinician profile settings for ${clinicianIdentity.displayName}. Local availability: ${workspacePreferences.availabilityLabel}.`;

  const handleQuickOpenSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedValue = searchValue.trim();
      if (!trimmedValue) {
        return;
      }

      const normalizedValue = trimmedValue.toLowerCase();
      const directRoute = QUICK_OPEN_ROUTES[normalizedValue];

      if (directRoute) {
        navigate(directRoute);
        setSearchValue('');
        return;
      }

      if (normalizedValue.startsWith('alt-') || normalizedValue.includes('alert')) {
        navigate(`/alerts?search=${encodeURIComponent(trimmedValue)}`);
        setSearchValue('');
        return;
      }

      navigate(`/patients?search=${encodeURIComponent(trimmedValue)}`);
      setSearchValue('');
    },
    [navigate, searchValue],
  );

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
                <MenuIcon />
              </IconButton>
            ) : null}
            <div className="topbar__title-group">
              <p className="topbar__eyebrow">Clinician workspace</p>
              <h1 className="topbar__title">{pageConfig.title}</h1>
              <p className="topbar__subtitle">{pageConfig.subtitle}</p>
            </div>
          </div>

          <form className="topbar__search" role="search" onSubmit={handleQuickOpenSubmit}>
            <span className="topbar__search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <label className="visually-hidden" htmlFor="dashboard-shell-search">
              Quick open: page, patient ID, or alert ID
            </label>
            <input
              id="dashboard-shell-search"
              type="search"
              className="topbar__search-input"
              placeholder="Quick open: page, patient ID, or alert ID"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
              }}
              autoComplete="off"
            />
          </form>

          <div className="topbar__status">
            <div className="topbar__utility">
              <span
                className="topbar__datetime"
                title={formatWorkspaceDateTimeTitle(nowMs, workspacePreferences.resolvedTimezone)}
                aria-label={`Workspace time in ${workspacePreferences.resolvedTimezone}`}
              >
                {formatWorkspaceDateTime(nowMs, workspacePreferences.resolvedTimezone)}
              </span>
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
              <Link
                to="/settings"
                className="topbar__identity-entry"
                aria-label={identityEntryLabel}
                title={identityTitle}
              >
                <ClinicianAvatar identity={clinicianIdentity} decorative size="md" />
                <div className="topbar__identity-copy">
                  <div className="topbar__identity-heading">
                    <strong className="topbar__identity-name">{clinicianIdentity.displayName}</strong>
                    <span
                      className={`topbar__availability-dot topbar__availability-dot--${workspacePreferences.availabilityTone}`}
                      title={`Local availability: ${workspacePreferences.availabilityLabel}`}
                      aria-hidden="true"
                    />
                  </div>
                  {clinicianIdentity.secondaryLine ? (
                    <span className="topbar__identity-role">{clinicianIdentity.secondaryLine}</span>
                  ) : null}
                </div>
              </Link>
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
