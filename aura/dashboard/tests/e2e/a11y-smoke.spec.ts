import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installMockApi } from './helpers/mockApi';

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
}

test('A11y smoke: Alerts page and drawer open have no serious/critical issues', async ({ page }) => {
  await installMockApi(page, { scenario: 'default' });

  await page.goto('/alerts');
  await page.waitForLoadState('networkidle');

  const mainResults = await new AxeBuilder({ page }).include('main').analyze();
  const mainViolations = seriousOrCriticalViolations(mainResults.violations);
  expect(mainViolations, JSON.stringify(mainViolations, null, 2)).toEqual([]);

  await page.getByTestId('alert-row-a1').click();
  await expect(page.getByTestId('alert-drawer')).toBeVisible();

  const drawerResults = await new AxeBuilder({ page }).include('[data-testid="alert-drawer"]').analyze();
  const drawerViolations = seriousOrCriticalViolations(drawerResults.violations);
  expect(drawerViolations, JSON.stringify(drawerViolations, null, 2)).toEqual([]);
});
