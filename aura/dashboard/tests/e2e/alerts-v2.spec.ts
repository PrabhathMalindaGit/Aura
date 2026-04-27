import { expect, test, type Route } from '@playwright/test';
import type { AlertItem } from '../../src/types/models';
import { installMockApi } from './helpers/mockApi';

const HOUR_MS = 60 * 60 * 1000;

function recentIso(hoursAgo: number, minutesAgo = 0): string {
  return new Date(Date.now() - hoursAgo * HOUR_MS - minutesAgo * 60 * 1000).toISOString();
}

const PRIMARY_ALERT: AlertItem = {
  _id: 'alert-primary',
  patientId: 'p1',
  risk: 'high',
  riskAuto: 'high',
  reason: ['PAIN_GE_THRESHOLD'],
  reasonsAuto: ['Pain threshold reached'],
  source: {
    type: 'checkin',
    sourceId: 'checkin-1',
  },
  status: 'open',
  createdAt: recentIso(2, 15),
  updatedAt: recentIso(2, 15),
  assignedTo: 'clinician-2',
  assignedToName: 'Dr Other Clinician',
  assignedAt: recentIso(2, 14),
  assignmentSource: 'manual',
  notificationChannel: 'telegram',
  notificationStatus: 'failed',
  notificationFailedAt: recentIso(2, 13),
  notificationError: 'Delivery failed.',
};

const SECONDARY_ALERT: AlertItem = {
  _id: 'alert-secondary',
  patientId: 'p2',
  risk: 'medium',
  riskAuto: 'medium',
  reason: 'MISSED_CHECKIN_THRESHOLD',
  source: {
    type: 'chat',
    sourceId: 'message-2',
  },
  status: 'open',
  createdAt: recentIso(3),
  updatedAt: recentIso(3),
};

test('alerts v2 preserves queue context while supporting alert governance actions by default', async ({ page }) => {
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

  await installMockApi(page, {
    alertsByStatus: {
      open: [PRIMARY_ALERT, SECONDARY_ALERT],
      acknowledged: [],
      resolved: [],
    },
  });

  await page.goto('/alerts');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.getByTestId('v2-alerts-route')).toBeVisible();
  const workspace = page.getByTestId('v2-alert-review-workspace');
  const expectNoHorizontalOverflow = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      )
      .toBe(true);
  };
  const expectReadableHeading = async (name: string) => {
    const heading = workspace.getByRole('heading', { name });

    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeInViewport();
    const headingBox = await heading.boundingBox();
    expect(headingBox).not.toBeNull();
    if (headingBox) {
      const coveredByReviewHeader = await page.evaluate(
        ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.v2-alert-review-header')),
        {
          x: headingBox.x + Math.min(8, headingBox.width / 2),
          y: headingBox.y + headingBox.height / 2,
        },
      );
      expect(coveredByReviewHeader).toBe(false);
    }
  };

  await expect(workspace).toContainText('Patient P1');
  await expect(page.getByTestId('v2-alert-governance-rail')).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: 'Context' })).toBeVisible();
  const reviewHeader = workspace.locator('.v2-alert-review-header');
  await expect(reviewHeader).toHaveCSS('position', 'static');
  await expect(workspace.getByText('Why this alert needs review')).toBeVisible();
  await expectReadableHeading('What changed');
  await expectReadableHeading('Notification review');

  await workspace.getByRole('heading', { name: 'Confirm final risk' }).scrollIntoViewIfNeeded();
  const headerBoxAfterRiskScroll = await reviewHeader.boundingBox();
  if (headerBoxAfterRiskScroll) {
    expect(headerBoxAfterRiskScroll.y + headerBoxAfterRiskScroll.height).toBeLessThanOrEqual(0);
  }
  await expectReadableHeading('Confirm final risk');
  await expectReadableHeading('Latest governance trail');
  await expectNoHorizontalOverflow();

  const searchInput = page.getByPlaceholder('Search patient, alert id, or reason');
  await searchInput.fill('p1');
  await expect(workspace).toContainText('Patient P1');

  await searchInput.fill('p2');
  await expect(workspace).toContainText('Patient p2');
  await expect(workspace).not.toContainText('Patient P1');

  await searchInput.fill('no matching alert');
  await expect(page.getByRole('heading', { name: 'No alerts match this filtered view.' })).toBeVisible();
  await expect(page.getByText('Reset filters to return to the full governance queue.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Select an alert to begin review' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Acknowledge' })).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: 'Resolve' })).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: 'Take over' })).toHaveCount(0);

  await page.getByTestId('v2-alerts-queue-pane').getByRole('button', { name: 'Reset filters' }).click();
  await expect(workspace).toContainText('Patient P1');

  for (const width of [1180, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('v2-alerts-route')).toBeVisible();
    await expectNoHorizontalOverflow();
  }
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(workspace).toContainText('Patient P1');
  await expectReadableHeading('Confirm final risk');
  await expectNoHorizontalOverflow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));

  await workspace.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(workspace).toContainText('Patient P1');

  await workspace.getByRole('button', { name: 'Take over' }).click();
  await page.getByRole('button', { name: 'Take over' }).last().click();
  await expect(page.getByText('Took over alert for p1.')).toBeVisible();

  await workspace.getByRole('button', { name: 'Retry notification' }).click();
  await expect(page.getByText('Notification retry queued.')).toBeVisible();

  await workspace.getByLabel('Final risk').selectOption('low');
  await workspace
    .getByRole('textbox', { name: 'Override reason' })
    .fill('Pain improved after manual review.');
  await workspace.getByRole('button', { name: 'Save override' }).click();
  await expect(page.getByText('Updated override state for p1.')).toBeVisible();

  await workspace.getByRole('button', { name: 'Clear override' }).click();
  await page.getByRole('button', { name: 'Clear override' }).last().click();
  await expect(page.getByText('Cleared override for p1.')).toBeVisible();

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(workspace.getByRole('button', { name: 'Context' })).toBeVisible();
  await workspace.getByRole('button', { name: 'Context' }).click();
  await expect(page.getByRole('heading', { name: 'Alert governance context' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Alert governance context' })).toBeHidden();

  const offlineAlertsHandler = async (route: Route) => {
    await route.abort('internetdisconnected');
  };
  await page.route(/\/clinician\/alerts(\?.*)?$/, offlineAlertsHandler);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Service temporarily unavailable')).toBeVisible();
  await page.unroute(/\/clinician\/alerts(\?.*)?$/, offlineAlertsHandler);

  await workspace.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(workspace).toContainText('Patient p2');

  await workspace.getByRole('button', { name: 'Resolve' }).click();
  await page.getByRole('button', { name: 'Resolve alert' }).click();
  await expect(page.getByText('Select an alert to begin review')).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page.getByTestId('v2-alerts-route')).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
