import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('route-level rollback can force dashboard back to legacy without disabling other completed v2 routes', async ({
  page,
}) => {
  const runtimeIssues: string[] = [];

  page.on('pageerror', (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error' &&
      !text.includes('Failed to load resource') &&
      !text.includes('Failed to fetch') &&
      !text.includes('ERR_INTERNET_DISCONNECTED')
    ) {
      runtimeIssues.push(`console:${message.type()}: ${text}`);
    }
  });

  await installMockApi(page);

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'aura_dashboard_v2_gates',
      JSON.stringify({
        shell: false,
        routes: {
          dashboard: false,
          worklist: true,
          communication: true,
          'patient-workspace': true,
          alerts: true,
          insights: true,
          appointments: true,
          settings: true,
        },
      }),
    );
  });

  await page.goto('/dashboard');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open next' })).toBeVisible();
  await expect(page.getByTestId('v2-dashboard-route')).toHaveCount(0);

  await page.goto('/worklist');
  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByTestId('triage-queue-route')).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
