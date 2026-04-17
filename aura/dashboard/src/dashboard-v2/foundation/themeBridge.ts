const DASHBOARD_V2_THEME_ATTRIBUTE = 'data-theme';

export type DashboardV2ResolvedTheme = 'light' | 'dark';

export function resolveDashboardV2Theme(root: HTMLElement): DashboardV2ResolvedTheme {
  return root.classList.contains('dark') ? 'dark' : 'light';
}

export function applyDashboardV2ThemeAttribute(
  root: HTMLElement = document.documentElement,
): DashboardV2ResolvedTheme {
  const resolvedTheme = resolveDashboardV2Theme(root);
  root.setAttribute(DASHBOARD_V2_THEME_ATTRIBUTE, resolvedTheme);
  return resolvedTheme;
}

export function initDashboardV2ThemeBridge(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  const root = document.documentElement;
  applyDashboardV2ThemeAttribute(root);

  const observer = new MutationObserver(() => {
    applyDashboardV2ThemeAttribute(root);
  });

  observer.observe(root, {
    attributes: true,
    attributeFilter: ['class'],
  });

  return () => observer.disconnect();
}
