import { test, expect, type Page, type Browser } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
const memo = (page: Page) => page.locator('#boot-memo');
const card = (page: Page, text: string) => page.getByTestId('task-card').filter({ hasText: text });

async function signedIn(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await page.goto(`/auth/dev-login?name=${name}`);
  await expect(page.locator('body')).toHaveClass(/ready/);
  await expect(page.getByTestId('sync-dot')).toHaveAttribute('data-live', 'on'); // live socket connected
  return { ctx, page };
}

async function flickRight(page: Page, text: string) {
  const c = card(page, text);
  await page.waitForTimeout(450);
  const box = (await c.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i * 16, y);
  await page.mouse.up();
}

test('changes on one device show up on another without reloading @local', async ({ browser }) => {
  const name = `live-${uid()}`;
  const a = await signedIn(browser, name);
  const b = await signedIn(browser, name);

  await memo(a.page).fill('リアルタイム確認');
  await memo(a.page).press('Enter');
  await expect(card(b.page, 'リアルタイム確認')).toBeVisible({ timeout: 4000 });

  await flickRight(a.page, 'リアルタイム確認');
  await expect(card(b.page, 'リアルタイム確認')).toHaveAttribute('data-status', 'doing', { timeout: 4000 });

  // and the other way round, including a delete
  const c = card(b.page, 'リアルタイム確認');
  await c.focus();
  await b.page.keyboard.press('Delete');
  await expect(card(a.page, 'リアルタイム確認')).toHaveCount(0, { timeout: 4000 });

  await a.ctx.close();
  await b.ctx.close();
});

test('a device that was offline catches up when it reconnects @local', async ({ browser }) => {
  const name = `live-off-${uid()}`;
  const a = await signedIn(browser, name);
  const b = await signedIn(browser, name);

  await b.ctx.setOffline(true);
  await memo(a.page).fill('オフライン中の追加');
  await memo(a.page).press('Enter');
  await b.page.waitForTimeout(1500);
  await expect(card(b.page, 'オフライン中の追加')).toHaveCount(0);

  await b.ctx.setOffline(false);
  await b.page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(card(b.page, 'オフライン中の追加')).toBeVisible({ timeout: 8000 });

  await a.ctx.close();
  await b.ctx.close();
});

test('the live endpoint requires a session', async ({ request }) => {
  // a complete handshake; Cloudflare's edge answers 400 to a partial one before the app sees it
  const res = await request.get('/api/live', {
    headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
  });
  expect(res.status()).toBe(401);
});
