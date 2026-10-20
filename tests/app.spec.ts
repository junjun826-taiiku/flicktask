import { test, expect, type Page, type Locator } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

test.beforeEach(async ({ page }) => {
  // skip the one-time peek hint so it doesn't fight with the swipe gestures under test
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
});

const memo = (page: Page) => page.locator('#boot-memo');
const card = (page: Page, text: string) => page.getByTestId('task-card').filter({ hasText: text });

async function ready(page: Page) {
  await expect(page.locator('body')).toHaveClass(/ready/);
}

async function add(page: Page, text: string) {
  await memo(page).fill(text);
  await memo(page).press('Enter');
  await expect(card(page, text)).toBeVisible();
}

/** Drag a card horizontally with a pointer, like a finger flick. */
async function flick(page: Page, target: Locator, dir: 1 | -1, distance = 190) {
  await page.waitForTimeout(450); // let list FLIP animations settle, as a finger would
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dir * distance * i) / 12, y + i * 0.5);
  await page.mouse.up();
}

async function login(page: Page, name = `user-${uid()}`) {
  await page.goto(`/auth/dev-login?name=${name}`);
  await ready(page);
  await expect(page.getByTestId('avatar')).toBeVisible();
  return name;
}

test('memo field is focused on first paint behind a full-screen skeleton', async ({ page }) => {
  // Hold back the app bundle so we can observe the skeleton state.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/src\/main\.ts|\/assets\/index-.*\.js/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await memo(page).waitFor();
  const skeleton = page.getByTestId('boot-skeleton');
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator('.sk').first()).toBeVisible();
  await expect(memo(page)).toBeFocused();
  release();
  await ready(page);
  await expect(skeleton).toHaveCSS('opacity', '0');
  await expect(skeleton).toHaveCSS('pointer-events', 'none');
  await expect(memo(page)).toBeFocused();
});

test('memos typed before the app loads are kept', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/src\/main\.ts|\/assets\/index-.*\.js/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await memo(page).waitFor();
  await page.keyboard.type('早打ちメモ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('書きかけ');
  release();
  await ready(page);
  await expect(card(page, '早打ちメモ')).toBeVisible();
  await expect(memo(page)).toHaveValue('書きかけ');
  await expect(memo(page)).toBeFocused();
});

test('add tasks with Enter, multi-line memo becomes multiple tasks, persists on reload', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, '牛乳を買う');
  await expect(memo(page)).toHaveValue('');
  await expect(memo(page)).toBeFocused();

  await memo(page).fill('');
  await page.keyboard.type('一行目');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('二行目');
  await page.getByTestId('add-button').click();
  await expect(card(page, '一行目')).toBeVisible();
  await expect(card(page, '二行目')).toBeVisible();
  await expect(page.getByTestId('count-all')).toHaveText('3');

  await page.reload();
  await ready(page);
  await expect(card(page, '牛乳を買う')).toBeVisible();
  await expect(page.getByTestId('count-all')).toHaveText('3');
});

test('IME composition Enter does not submit', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await memo(page).fill('へんかんちゅう');
  await memo(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(page.getByTestId('task-card')).toHaveCount(0);
  await expect(memo(page)).toHaveValue('へんかんちゅう');
});

test('flick right advances status, flick left reverts', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, 'フリック');
  const c = card(page, 'フリック');
  await expect(c).toHaveAttribute('data-status', 'todo');

  await flick(page, c, 1);
  await expect(c).toHaveAttribute('data-status', 'doing');
  await expect(c.locator('.badge')).toHaveText('進行中');

  await flick(page, c, 1);
  await expect(c).toHaveAttribute('data-status', 'done');

  // nothing beyond done: rubber-bands back
  await flick(page, c, 1);
  await expect(c).toHaveAttribute('data-status', 'done');

  await flick(page, c, -1);
  await expect(c).toHaveAttribute('data-status', 'doing');
  await flick(page, c, -1);
  await expect(c).toHaveAttribute('data-status', 'todo');
});

test('a short drag snaps back without changing status', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, 'ちょっとだけ');
  const c = card(page, 'ちょっとだけ');
  await flick(page, c, 1, 50);
  await page.waitForTimeout(700);
  await expect(c).toHaveAttribute('data-status', 'todo');
  await expect(c).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, 0\)|none/);
});

test('flick left on a todo deletes it, and undo restores it', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, '消すタスク');
  await flick(page, card(page, '消すタスク'), -1);
  await expect(card(page, '消すタスク')).toHaveCount(0);
  const toast = page.getByTestId('toast').filter({ hasText: '削除しました' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: '元に戻す' }).click();
  await expect(card(page, '消すタスク')).toBeVisible();
});

test('status tabs filter the list and counts update', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, 'A案件');
  await add(page, 'B案件');
  await flick(page, card(page, 'A案件'), 1);
  await expect(page.getByTestId('count-doing')).toHaveText('1');
  await expect(page.getByTestId('count-todo')).toHaveText('1');

  await page.getByTestId('tab-doing').click();
  await expect(page.getByTestId('tab-doing')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'A案件')).toBeVisible();
  await expect(card(page, 'B案件')).toHaveCount(0);

  // flicking inside a filtered view moves the card out of it
  await flick(page, card(page, 'A案件'), 1);
  await expect(card(page, 'A案件')).toHaveCount(0);
  await expect(page.getByTestId('empty')).toBeVisible();
  await page.getByTestId('tab-done').click();
  await expect(card(page, 'A案件')).toBeVisible();
});

test('tap a card to open the detail sheet and rename it', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, '旧タイトル');
  await card(page, '旧タイトル').getByTestId('task-title').click();
  const sheet = page.getByTestId('sheet');
  await expect(sheet).toBeVisible();
  await page.getByTestId('sheet-title').fill('新タイトル');
  await page.getByTestId('sheet-done').click();
  await expect(sheet).toHaveCount(0);
  await expect(card(page, '新タイトル')).toBeVisible();
  await expect(card(page, '旧タイトル')).toHaveCount(0);
});

test('status dot and keyboard arrows also change status', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, 'キーボード');
  const c = card(page, 'キーボード');
  await c.getByTestId('status-dot').click();
  await expect(c).toHaveAttribute('data-status', 'doing');
  await c.focus();
  await page.keyboard.press('ArrowRight');
  await expect(c).toHaveAttribute('data-status', 'done');
  await c.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(c).toHaveAttribute('data-status', 'doing');
});

test('touch flick works on a touchscreen', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'mobile' || browserName !== 'chromium');
  await page.goto('/');
  await ready(page);
  await add(page, 'タッチ');
  const box = (await card(page, 'タッチ').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const x = box.x + 40;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 22, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(card(page, 'タッチ')).toHaveAttribute('data-status', 'doing');
});

test('AI button asks to log in when signed out', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.getByTestId('login')).toHaveAttribute('href', '/auth/google');
  await memo(page).fill('明日の準備');
  await page.getByTestId('ai-button').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'ログイン' })).toBeVisible();
});

test('API rejects unauthenticated requests', async ({ request }) => {
  expect((await request.get('/api/tasks')).status()).toBe(401);
  expect((await request.post('/api/ai/split', { data: { text: 'x' } })).status()).toBe(401);
});

test('signed-in tasks sync to the server, local memos are uploaded at login', async ({ page, browser }) => {
  await page.goto('/');
  await ready(page);
  await add(page, 'ログイン前メモ');

  const name = await login(page);
  await expect(card(page, 'ログイン前メモ')).toBeVisible();
  await add(page, 'クラウド保存');
  await flick(page, card(page, 'クラウド保存'), 1);
  await expect(page.getByTestId('sync-dot')).toHaveAttribute('aria-label', '同期済み');
  // wait until this device has pushed everything (no pending changes), not a fixed time
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('ft.dirty.v1') ?? '[]') + (localStorage.getItem('ft.dirtyEvents.v1') ?? '[]')), { timeout: 10_000 }).toBe('[][]');

  // a brand-new browser profile, same account
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await login(p2, name);
  await expect(card(p2, 'ログイン前メモ')).toBeVisible();
  await expect(card(p2, 'クラウド保存')).toHaveAttribute('data-status', 'doing');

  // a delete on one device propagates
  await flick(p2, card(p2, 'ログイン前メモ'), -1);
  await expect(card(p2, 'ログイン前メモ')).toHaveCount(0);
  // wait until device 2 has actually pushed the delete (no pending changes), not a fixed time
  await expect.poll(() => p2.evaluate(() => localStorage.getItem('ft.dirty.v1')), { timeout: 10_000 }).toBe('[]');
  await page.reload();
  await ready(page);
  await expect(card(page, 'ログイン前メモ')).toHaveCount(0);
  await other.close();
});

test('tasks are private to each account', async ({ page, browser }) => {
  await login(page);
  await add(page, '秘密のタスク');
  // wait until this device has pushed everything (no pending changes), not a fixed time
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('ft.dirty.v1') ?? '[]') + (localStorage.getItem('ft.dirtyEvents.v1') ?? '[]')), { timeout: 10_000 }).toBe('[][]');
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await login(p2);
  await expect(p2.getByTestId('empty')).toBeVisible();
  await expect(card(p2, '秘密のタスク')).toHaveCount(0);
  await other.close();
});

test('logout clears local data and shows login again', async ({ page }) => {
  await login(page);
  await add(page, 'ログアウト前');
  await page.getByTestId('avatar').click();
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login')).toBeVisible();
  await expect(card(page, 'ログアウト前')).toHaveCount(0);
  expect((await page.request.get('/api/me')).status()).toBe(401);
});

test('Workers AI splits a memo into tasks', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await memo(page).fill('週末に引っ越しするので、段ボールを買って、ガスの停止を連絡して、住所変更もしないと');
  await page.getByTestId('ai-button').click();
  await expect(page.getByTestId('composer')).toHaveClass(/thinking/);
  const panel = page.getByTestId('ai-suggestions');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  const chips = panel.locator('button.chip');
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  const n = await chips.count();
  await chips.first().click(); // deselect one
  await expect(page.getByTestId('ai-accept')).toHaveText(`${n - 1}件を追加`);
  await page.getByTestId('ai-accept').click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('task-card')).toHaveCount(n - 1);
  await expect(memo(page)).toHaveValue('');
});

test('privacy policy and terms pages are served', async ({ page }) => {
  for (const [path, heading] of [['/privacy', 'プライバシーポリシー'], ['/terms', '利用規約']]) {
    const res = await page.goto(path);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
  await page.goto('/');
  await expect(page.getByTestId('legal-links').getByRole('link', { name: 'プライバシーポリシー' })).toBeVisible();
});
