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

  await page.getByTestId('v2-alert-row-a1').click();
  await expect(page.getByTestId('v2-alert-review-workspace')).toBeVisible();

  const drawerResults = await new AxeBuilder({ page }).include('[data-testid="v2-alert-review-workspace"]').analyze();
  const drawerViolations = seriousOrCriticalViolations(drawerResults.violations);
  expect(drawerViolations, JSON.stringify(drawerViolations, null, 2)).toEqual([]);
});
