import { expect, test } from '@playwright/test';
import { createClickCounter } from './helpers/clickCounter';
import { installMockApi } from './helpers/mockApi';

test('A clinician can acknowledge a new open alert in exactly 2 clicks', async ({ page }) => {
  const tracker = await installMockApi(page, { scenario: 'ackSuccess' });
  const clicks = createClickCounter(page);

  await page.goto('/alerts');
  await page.waitForLoadState('networkidle');

  await expect(page.getByTestId('alert-open-a1')).toBeVisible();

  await clicks.clickByTestId('alert-open-a1');
  await expect(page.getByTestId('alert-drawer')).toBeVisible();

  await clicks.clickByTestId('alert-acknowledge');

  await expect.poll(() => tracker.patchStatusCalls.length).toBe(1);
  await expect(page.getByTestId('alert-open-a1')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'All clear' })).toBeVisible();

  expect(clicks.getCount()).toBe(2);
  expect(tracker.patchStatusCalls).toEqual([{ id: 'a1', status: 'acknowledged' }]);
});
