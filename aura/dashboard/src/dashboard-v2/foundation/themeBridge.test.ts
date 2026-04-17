import { describe, expect, it } from 'vitest';
import { applyDashboardV2ThemeAttribute } from './themeBridge';

describe('dashboard v2 theme bridge', () => {
  it('maps the legacy dark class to the v2 data-theme attribute', () => {
    document.documentElement.classList.add('dark');

    expect(applyDashboardV2ThemeAttribute()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    document.documentElement.classList.remove('dark');

    expect(applyDashboardV2ThemeAttribute()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
