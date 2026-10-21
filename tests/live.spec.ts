import { test, expect, type Page, type Browser } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
// tasks with no event live on the 「その他」 page
const memo = (page: Page) => page.getByTestId('nx-add');
const card = (page: Page, text: string) => page.getByTestId('nx-card').filter({ hasText: text });

async function signedIn(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await page.goto(`/auth/dev-login?name=${name}`);
  await page.goto('/events/other');
  await expect(page.getByTestId('nx-prep')).toBeVisible();
  await expect(page.getByTestId('sync-dot')).toHaveAttribute('data-live', 'on'); // live socket connected
  return { ctx, page };
}

/** move a card one status to the right (未着手 → 進行中) with the keyboard */
async function flickRight(page: Page, text: string) {
  await card(page, text).focus();
  await page.keyboard.press('ArrowRight');
}

test('changes on one device show up on another without reloading @local', async ({ browser }) => {
  const name = `live-${uid()}`;
  const a = await signedIn(browser, name);
  const b = await signedIn(browser, name);

  await memo(a.page).fill('リアルタイム確認');
  await memo(a.page).press('Enter');
  await expect(card(b.page, 'リアルタイム確認')).toBeVisible({ timeout: 4000 });

  await flickRight(a.page, 'リアルタイム確認');
  await expect(card(b.page, 'リアルタイム確認')).toHaveAttribute('aria-label', /進行中/, { timeout: 4000 });

  // and the other way round, including a delete
  if (await b.page.getByTestId('nx-col-pick-doing').isVisible()) await b.page.getByTestId('nx-col-pick-doing').click(); // phones: one column at a time
  await card(b.page, 'リアルタイム確認').click();
  await b.page.getByTestId('nx-panel-delete').click();
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

test('the live endpoint requires a session', async ({ page }) => {
  // a real browser WebSocket while signed out must never open (the server answers 401, not 101)
  await page.goto('/');
  const outcome = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live?cid=probe`);
        ws.onopen = () => (resolve('open'), ws.close());
        ws.onerror = () => resolve('rejected');
        setTimeout(() => resolve('timeout'), 5000);
      }),
  );
  expect(outcome).toBe('rejected');
});
