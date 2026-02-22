import { expect, test } from '@playwright/test';
import { FIXTURE_DAY_DRILLDOWN_DATE } from './fixtures';
import { installMockApi } from './helpers/mockApi';

test('Trend review supports 14/30 toggle and day drilldown', async ({ page }) => {
  const tracker = await installMockApi(page, { scenario: 'default' });

  await page.goto('/patients/p1?days=14');
  await page.waitForLoadState('networkidle');

  await expect(page.getByTestId('days-toggle-14')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Latest trend values').getByText('Latest pain')).toBeVisible();

  await page.getByTestId('days-toggle-30').click();
  await expect(page.getByTestId('days-toggle-30')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => tracker.trendDaysCalls.filter((days) => days === 30).length).toBeGreaterThan(0);

  await page.getByTestId(`trend-view-${FIXTURE_DAY_DRILLDOWN_DATE}`).click();
  await expect(page.getByTestId('day-detail-panel')).toBeVisible();
  await expect(page.getByTestId('day-detail-panel').getByText('Check-in snapshot')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('day-detail-panel')).toHaveCount(0);
});
