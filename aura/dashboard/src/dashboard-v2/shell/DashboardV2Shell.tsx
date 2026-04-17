import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, PanelRightOpen } from 'lucide-react';
import { SessionTimeoutModal } from '../../components/auth/SessionTimeoutModal';
import { PageTransition } from '../../components/motion/PageTransition';
import { OfflineBanner } from '../../components/system/OfflineBanner';
import { ClinicianAvatar } from '../../components/ui/ClinicianAvatar';
import { useClinicianIdentity } from '../../hooks/useClinicianIdentity';
import { useClinicianWorkspacePreferences } from '../../hooks/useClinicianWorkspacePreferences';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { subscribeAuthRequired } from '../../services/apiClient';
import { useConnectionStatus } from '../../services/connection';
import {
  createSessionTimeoutManager,
  type SessionTimeoutManager,
  type SessionTimeoutReason,
  type SessionTimeoutWarning,
} from '../../services/sessionTimeout';
import {
  getSessionSettings,
  subscribeSessionSettings,
  type SessionSettings,
} from '../../services/sessionSettings';
import { clearDashboardSessionData } from '../../utils/storageKeys';
import { DashboardV2Drawer } from '../primitives/Drawer';
import { DashboardV2Input } from '../primitives/Input';
import { DashboardV2Button } from '../primitives/Button';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';
import { DashboardV2ContextRailPanel } from '../patterns/ContextRailPanel';
import { DashboardV2ExplanationDrawer } from '../patterns/ExplanationDrawer';
import { DashboardV2GovernancePanel } from '../patterns/GovernancePanel';
import { useDashboardV2UiStore } from '../state/useDashboardV2UiStore';
import { resolveDashboardV2RouteId } from '../config/migrationGates';
import {
  getDashboardV2RouteDescription,
  getDashboardV2RouteTitle,
} from './navConfig';
import { DashboardV2ShellFrame } from './ShellFrame';
import { DashboardV2ShellNav } from './ShellNav';

const NARROW_VIEWPORT_QUERY = '(max-width: 1023px)';
const RAIL_DRAWER_QUERY = '(max-width: 1279px)';

const QUICK_OPEN_ROUTES: Record<string, string> = {
  analytics: '/dashboard',
  dashboard: '/dashboard',
  queue: '/worklist',
  worklist: '/worklist',
  inbox: '/communication',
  communication: '/communication',
  governance: '/alerts',
  alerts: '/alerts',
  followup: '/insights',
  'follow-up': '/insights',
  insights: '/insights',
  appointments: '/appointments',
  schedule: '/appointments',
  patients: '/patients',
  settings: '/settings',
};

function formatLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
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

export function DashboardV2Shell(): JSX.Element {
  const [searchValue, setSearchValue] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sessionSettings, setSessionSettings] = useState<SessionSettings>(() => getSessionSettings());
  const [sessionWarning, setSessionWarning] = useState<SessionTimeoutWarning | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sessionManagerRef = useRef<SessionTimeoutManager | null>(null);
  const isNarrowViewport = useMediaQuery(NARROW_VIEWPORT_QUERY);
  const useRailDrawer = useMediaQuery(RAIL_DRAWER_QUERY);
  const navCollapsed = useDashboardV2UiStore((state) => state.navCollapsed);
  const navDrawerOpen = useDashboardV2UiStore((state) => state.navDrawerOpen);
  const contextRailOpen = useDashboardV2UiStore((state) => state.contextRailOpen);
  const toggleNavCollapsed = useDashboardV2UiStore((state) => state.toggleNavCollapsed);
  const setNavDrawerOpen = useDashboardV2UiStore((state) => state.setNavDrawerOpen);
  const setContextRailOpen = useDashboardV2UiStore((state) => state.setContextRailOpen);
  const setLayoutMode = useDashboardV2UiStore((state) => state.setLayoutMode);
  const connection = useConnectionStatus();
  const clinicianIdentity = useClinicianIdentity();
  const workspacePreferences = useClinicianWorkspacePreferences();
  const routeId = resolveDashboardV2RouteId(pathname);
  const routeOwnsContextRail = routeId === 'worklist' || routeId === 'communication';
  const routeTitle = getDashboardV2RouteTitle(routeId);
  const routeDescription = getDashboardV2RouteDescription(routeId);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSessionLogout = useCallback(
    (reason: SessionTimeoutReason) => {
      clearDashboardSessionData();
      setNavDrawerOpen(false);
      setContextRailOpen(false);
      setSessionWarning(null);
      navigate('/session-ended', {
        replace: true,
        state: { reason },
      });
    },
    [navigate, setContextRailOpen, setNavDrawerOpen],
  );

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
    return subscribeSessionSettings((next) => setSessionSettings(next));
  }, []);

  useEffect(() => {
    return subscribeAuthRequired((reason) => {
      setNavDrawerOpen(false);
      setContextRailOpen(false);
      setSessionWarning(null);
      navigate('/login', {
        replace: true,
        state: {
          reason,
          from: `${pathname}`,
        },
      });
    });
  }, [navigate, pathname, setContextRailOpen, setNavDrawerOpen]);

  useEffect(() => {
    setNavDrawerOpen(false);
    setContextRailOpen(false);
  }, [pathname, setContextRailOpen, setNavDrawerOpen]);

  useEffect(() => {
    if (!isNarrowViewport) {
      setNavDrawerOpen(false);
    }
  }, [isNarrowViewport, setNavDrawerOpen]);

  useEffect(() => {
    if (!useRailDrawer) {
      setContextRailOpen(false);
    }
  }, [setContextRailOpen, useRailDrawer]);

  useEffect(() => {
    setLayoutMode(isNarrowViewport ? 'focus' : 'workspace');
  }, [isNarrowViewport, setLayoutMode]);

  const handleSignOut = useCallback(() => {
    clearDashboardSessionData();
    setNavDrawerOpen(false);
    setContextRailOpen(false);
    setSessionWarning(null);
    navigate('/login', {
      replace: true,
      state: { reason: 'signedOut' },
    });
  }, [navigate, setContextRailOpen, setNavDrawerOpen]);

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

  const bannerMeta = useMemo(
    () => (
      <div className="dashboard-v2-shell__banner-copy">
        <div className="dashboard-v2-shell__headline">
          {isNarrowViewport ? (
            <DashboardV2Button
              tone="ghost"
              size="sm"
              onPress={() => setNavDrawerOpen(true)}
              leadingIcon={<Menu size={16} />}
            >
              Menu
            </DashboardV2Button>
          ) : null}
          <div className="dashboard-v2-shell__title-group">
            <DashboardV2Text tone="label">Aura dashboard v2 foundation</DashboardV2Text>
            <DashboardV2Heading as="h1">{routeTitle}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{routeDescription}</DashboardV2Text>
          </div>
        </div>

        <div className="dashboard-v2-shell__status-cluster">
          <span className="dashboard-v2-shell__datetime">
            {formatWorkspaceDateTime(nowMs, workspacePreferences.resolvedTimezone)}
          </span>
          <span className="dashboard-v2-shell__status">
            {connection.online ? 'Connected' : 'Offline'}
          </span>
          <span className="dashboard-v2-shell__timestamp">
            Updated {formatLastUpdated(connection.lastSuccessAt)}
          </span>
          {useRailDrawer && !routeOwnsContextRail ? (
            <DashboardV2Button
              tone="secondary"
              size="sm"
              onPress={() => setContextRailOpen(true)}
              leadingIcon={<PanelRightOpen size={16} />}
            >
              Context
            </DashboardV2Button>
          ) : null}
        </div>

        <div className="dashboard-v2-shell__identity">
          <Link className="dashboard-v2-shell__identity-link" to="/settings">
            <ClinicianAvatar identity={clinicianIdentity} decorative size="md" />
            <div className="dashboard-v2-shell__identity-copy">
              <strong>{clinicianIdentity.displayName}</strong>
              <DashboardV2Text as="span" tone="muted">
                {clinicianIdentity.secondaryLine || workspacePreferences.availabilityLabel}
              </DashboardV2Text>
            </div>
          </Link>
          <DashboardV2Button tone="ghost" size="sm" onPress={handleSignOut}>
            Sign out
          </DashboardV2Button>
        </div>
      </div>
    ),
    [
      clinicianIdentity,
      connection.lastSuccessAt,
      connection.online,
      handleSignOut,
      isNarrowViewport,
      nowMs,
      routeDescription,
      routeOwnsContextRail,
      routeTitle,
      setContextRailOpen,
      setNavDrawerOpen,
      useRailDrawer,
      workspacePreferences.availabilityLabel,
      workspacePreferences.resolvedTimezone,
    ],
  );

  const search = (
    <form className="dashboard-v2-shell__search-form" onSubmit={handleQuickOpenSubmit}>
      <DashboardV2Input
        label="Quick open"
        labelHidden
        name="dashboard-v2-search"
        onChange={(event) => setSearchValue(event.currentTarget.value)}
        placeholder="Quick open patient, alert, or workspace"
        type="search"
        value={searchValue}
      />
    </form>
  );

  const contextRail = routeOwnsContextRail
    ? null
    : (
        <DashboardV2ContextRailPanel
          title="Context rail foundation"
          description="Right-side governance, provenance, and explanation surfaces are staged here for later route migrations."
        >
          <DashboardV2GovernancePanel onOpenExplanation={() => setExplanationOpen(true)} />
        </DashboardV2ContextRailPanel>
      );

  const footer = (
    <DashboardV2Text tone="muted">
      Phase 1 preserves the current backend truth, auth/session flow, route semantics, and CTA destinations while the v2 shell and primitive system are staged.
    </DashboardV2Text>
  );

  return (
    <>
      <DashboardV2ShellFrame
        bannerMeta={bannerMeta}
        contextualRail={useRailDrawer ? null : contextRail}
        footer={footer}
        navigation={
          <DashboardV2ShellNav
            collapsed={navCollapsed}
            onToggleCollapse={toggleNavCollapsed}
          />
        }
        search={search}
      >
        <OfflineBanner />
        <PageTransition transitionKey={pathname}>
          <Outlet />
        </PageTransition>
      </DashboardV2ShellFrame>

      <DashboardV2Drawer
        open={navDrawerOpen}
        onOpenChange={setNavDrawerOpen}
        title="Navigation"
        description="Primary dashboard-v2 navigation"
        placement="bottom"
      >
        <DashboardV2ShellNav
          collapsed={false}
          compact
          onNavigate={() => setNavDrawerOpen(false)}
        />
      </DashboardV2Drawer>

      {contextRail ? (
        <DashboardV2Drawer
          open={contextRailOpen}
          onOpenChange={setContextRailOpen}
          title="Context rail"
          description="Governance, provenance, and explanation scaffolding"
          placement="bottom"
        >
          {contextRail}
        </DashboardV2Drawer>
      ) : null}

      {contextRail ? (
        <DashboardV2ExplanationDrawer
          open={explanationOpen}
          onOpenChange={setExplanationOpen}
        />
      ) : null}

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
    </>
  );
}
