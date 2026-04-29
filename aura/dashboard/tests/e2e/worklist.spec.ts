import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('worklist page loads operational rows and routes safely into alerts', async ({ page }) => {
  await installMockApi(page);

  await page.goto('/worklist');

  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByTestId('triage-queue-row-p1')).toContainText('High pain escalation');
  await expect(page.getByText('Missed daily check-ins')).toBeVisible();

  const prioritizedPatient = page.getByTestId('triage-queue-row-p1');
  await expect(prioritizedPatient).toBeVisible();

  await page.getByRole('button', { name: 'Open alerts' }).click();
  await expect(page).toHaveURL(/\/alerts(\?|$)/);
});
