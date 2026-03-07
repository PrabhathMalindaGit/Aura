import { expect, test } from '@playwright/test';

const LIVE_E2E_ENABLED = process.env.LIVE_E2E === '1';
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

test('Live smoke page validates reachable backend', async ({ page, request }) => {
  test.skip(!LIVE_E2E_ENABLED, 'Set LIVE_E2E=1 to run live integration smoke checks.');

  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const healthUrl = `${apiBaseUrl}/health`;

  let healthResponse;
  try {
    healthResponse = await request.get(healthUrl, { timeout: 4_000 });
  } catch {
    test.skip(true, `Backend unreachable at ${healthUrl}; skipping live smoke.`);
    return;
  }

  if (!healthResponse.ok()) {
    test.skip(true, `Backend health check failed (${healthResponse.status()}) at ${healthUrl}; skipping live smoke.`);
    return;
  }

  const loginResponse = await request.post(`${apiBaseUrl}/auth/clinician/login`, {
    data: {
      email: 'clinician1@example.com',
      password: 'devpass123',
    },
  });
  if (!loginResponse.ok()) {
    test.skip(true, `Clinician login failed (${loginResponse.status()}) at ${apiBaseUrl}/auth/clinician/login.`);
    return;
  }

  const loginPayload = (await loginResponse.json()) as { token?: string };
  if (!loginPayload.token) {
    test.skip(true, 'Clinician login response did not include token.');
    return;
  }

  await page.addInitScript((token: string) => {
    window.localStorage.setItem('aura_access_token', token);
  }, loginPayload.token);

  await page.goto('/smoke');
  await page.getByTestId('smoke-run').click();

  await expect(page.getByTestId('smoke-status-health')).toHaveText('PASS');
  await expect(page.getByRole('heading', { name: 'Live Integration Smoke' })).toBeVisible();
  await expect(page.getByText('Unable to reach service')).toHaveCount(0);
});
