// Smoke tests against the deployed Worker: BASE_URL=https://... npx playwright test
import { test, expect } from '@playwright/test';

test('production: memo is usable instantly and works signed out', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#boot-memo')).toBeFocused();
  await expect(page.locator('body')).toHaveClass(/ready/);
  await page.locator('#boot-memo').fill('本番テスト');
  await page.locator('#boot-memo').press('Enter');
  const card = page.getByTestId('task-card').filter({ hasText: '本番テスト' });
  await expect(card).toBeVisible();
  await page.waitForTimeout(600);
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2 + i * 16, box.y + box.height / 2);
  await page.mouse.up();
  await expect(card).toHaveAttribute('data-status', 'doing');
});

test('production: dev login is disabled', async ({ request }) => {
  const res = await request.get('/auth/dev-login', { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test('production: API requires a session', async ({ request }) => {
  expect((await request.get('/api/me')).status()).toBe(401);
  expect((await request.get('/api/tasks')).status()).toBe(401);
  expect((await request.post('/api/ai/split', { data: { text: 'x' } })).status()).toBe(401);
});

test('production: Google sign-in redirects to Google with PKCE', async ({ request, baseURL }) => {
  const res = await request.get('/auth/google', { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const loc = new URL(res.headers()['location']);
  expect(loc.origin).toBe('https://accounts.google.com');
  expect(loc.searchParams.get('redirect_uri')).toBe(`${baseURL}/auth/callback`);
  expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
  expect(loc.searchParams.get('client_id')).toBeTruthy();
});

test('production: OAuth callback rejects a forged state', async ({ request }) => {
  const res = await request.get('/auth/callback?code=x&state=forged', { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toContain('login=failed');
});
