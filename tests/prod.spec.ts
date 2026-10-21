// Smoke tests against the deployed Worker: BASE_URL=https://... npx playwright test
import { test, expect } from '@playwright/test';

test('production: a skeleton paints first, then the app works signed out', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByTestId('boot-skeleton')).toBeAttached();
  await expect(page.getByTestId('nx-timeline')).toBeVisible();
  await expect(page.getByTestId('boot-skeleton')).toHaveCount(0);
  await page.goto('/events/other');
  await page.getByTestId('nx-add').fill('本番テスト');
  await page.getByTestId('nx-add').press('Enter');
  const card = page.getByTestId('nx-card').filter({ hasText: '本番テスト' });
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press('ArrowRight');
  await expect(card).toHaveAttribute('aria-label', /進行中/);
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

test('production: privacy policy and terms are public and linked from home', async ({ page }) => {
  await page.goto('/');
  const links = page.getByTestId('legal-links');
  await expect(links.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy');
  await expect(links.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms');
  for (const [path, heading] of [['/privacy', 'プライバシーポリシー'], ['/terms', '利用規約']]) {
    const res = await page.goto(path);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
});

test('app icons are served for browsers and home screens', async ({ request, page }) => {
  for (const p of ['/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png']) expect((await request.get(p)).status(), p).toBe(200);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.icons.map((i: { src: string }) => i.src)).toContain('/icon-512.png');
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icon-180.png');
  expect(manifest.name).toBe('Task本部');
  await expect(page).toHaveTitle('Task本部');
});
