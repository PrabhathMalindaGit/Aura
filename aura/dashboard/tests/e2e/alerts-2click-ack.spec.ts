import { expect, test } from '@playwright/test';
import { createClickCounter } from './helpers/clickCounter';
import { installMockApi } from './helpers/mockApi';

test('A clinician can acknowledge a new open alert in exactly 2 clicks', async ({ page }) => {
  const tracker = await installMockApi(page, { scenario: 'ackSuccess' });
  const clicks = createClickCounter(page);

  await page.goto('/alerts');
  await page.waitForLoadState('networkidle');

  await expect(page.getByTestId('v2-alert-row-a1')).toBeVisible();

  await clicks.clickByTestId('v2-alert-row-a1');
  await expect(page.getByTestId('v2-alert-review-workspace')).toBeVisible();

  await clicks.clickLocator(
    page.getByTestId('v2-alert-review-workspace').getByRole('button', { name: 'Acknowledge' }),
  );

  await expect.poll(() => tracker.patchStatusCalls.length).toBe(1);
  await expect(page.getByTestId('v2-alert-row-a1')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No open alerts need review' })).toBeVisible();

  expect(clicks.getCount()).toBe(2);
  expect(tracker.patchStatusCalls).toEqual([{ id: 'a1', status: 'acknowledged' }]);
});
