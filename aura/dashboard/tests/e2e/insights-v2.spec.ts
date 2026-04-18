import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('gated insights v2 preserves review continuity across lifecycle, patient routing, and responsive support behavior', async ({ page }) => {
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
          worklist: false,
          communication: false,
          'patient-workspace': false,
          alerts: false,
          insights: true,
          appointments: false,
          settings: false,
        },
      }),
    );
  });

  await page.goto('/insights');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.getByTestId('v2-insights-route')).toBeVisible();
  const workspace = page.getByTestId('v2-insights-review-workspace');
  await expect(workspace).toContainText('Patient P1');

  await workspace.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(workspace).toContainText('Patient P1');

  await page.getByLabel('Select Routine recovery summary follow-up').check();
  await page.getByRole('button', { name: 'Approve selected' }).click();
  await expect(page.getByText('Batch approved')).toBeVisible();

  await page.setViewportSize({ width: 1180, height: 900 });
  await workspace.getByRole('button', { name: 'Open support' }).click();
  await expect(page.getByRole('heading', { name: 'Insight support context' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 900, height: 900 });
  await page.reload();
  await expect(page.getByTestId('v2-insights-route')).toBeVisible();
  await expect(page.getByTestId('v2-insights-queue-pane')).toBeVisible();
  await expect(page.getByTestId('v2-insights-review-workspace')).toHaveCount(0);
  await page.getByTestId('v2-insight-row-insight-1').click();
  await expect(page.getByTestId('v2-insights-review-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to lane' })).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page.getByTestId('v2-insights-route')).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
