import { test, expect, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const uid = () => Math.random().toString(36).slice(2, 8);

test.beforeEach(async ({ page }) => {
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
async function openSheet(page: Page, text: string) {
  await card(page, text).getByTestId('task-title').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
}
async function saveSheet(page: Page) {
  await page.getByTestId('sheet-done').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
}
/** Give a task a memo, a deadline and a scheduled block through the sheet. */
async function detail(page: Page, text: string, o: { note?: string; due?: [string, string?]; plan?: [string, string, string] }) {
  await openSheet(page, text);
  if (o.note) await page.getByTestId('sheet-note').fill(o.note);
  if (o.due) {
    await page.getByTestId('sheet-due-toggle').click();
    await page.getByTestId('sheet-due-date').fill(o.due[0]);
    if (o.due[1]) await page.getByTestId('sheet-due-time').fill(o.due[1]);
  }
  if (o.plan) {
    await page.getByTestId('sheet-plan-toggle').click();
    await page.getByTestId('sheet-plan-date').fill(o.plan[0]);
    await page.getByTestId('sheet-plan-start').fill(o.plan[1]);
    await page.getByTestId('sheet-plan-end').fill(o.plan[2]);
  }
  await saveSheet(page);
}

test('memo, deadline and scheduled time are saved and shown as different chips', async ({ page }) => {
  const today = plusDays(0);
  await page.goto('/');
  await ready(page);
  await add(page, '資料を作る');
  await detail(page, '資料を作る', { note: '図を3枚', due: [today, '18:00'], plan: [today, '09:00', '10:30'] });

  const c = card(page, '資料を作る');
  await expect(c.getByTestId('chip-plan')).toContainText('9:00–10:30');
  await expect(c.getByTestId('chip-due')).toContainText('今日 18:00');
  await expect(c.getByTestId('chip-note')).toBeVisible();
  // scheduled = filled, deadline = dashed outline
  await expect(c.getByTestId('chip-plan')).not.toHaveCSS('background-image', 'none');
  await expect(c.getByTestId('chip-due')).toHaveCSS('border-top-style', 'dashed');

  await page.reload();
  await ready(page);
  await openSheet(page, '資料を作る');
  await expect(page.getByTestId('sheet-note')).toHaveValue('図を3枚');
  await expect(page.getByTestId('sheet-due-date')).toHaveValue(today);
  await expect(page.getByTestId('sheet-due-time')).toHaveValue('18:00');
  await expect(page.getByTestId('sheet-plan-start')).toHaveValue('09:00');
  await expect(page.getByTestId('sheet-plan-end')).toHaveValue('10:30');
});

test('moving the start time keeps the block length; turning a field off clears it', async ({ page }) => {
  const today = plusDays(0);
  await page.goto('/');
  await ready(page);
  await add(page, '長さ維持');
  await detail(page, '長さ維持', { plan: [today, '10:00', '11:30'] });
  await openSheet(page, '長さ維持');
  await page.getByTestId('sheet-plan-start').fill('13:00');
  await expect(page.getByTestId('sheet-plan-end')).toHaveValue('14:30');
  await page.getByTestId('sheet-plan-toggle').click();
  await saveSheet(page);
  await expect(card(page, '長さ維持').getByTestId('chip-plan')).toHaveCount(0);
});

test('status and delete from the sheet', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await add(page, 'シートで操作');
  await openSheet(page, 'シートで操作');
  await page.getByTestId('sheet-status-doing').click();
  await saveSheet(page);
  await expect(card(page, 'シートで操作')).toHaveAttribute('data-status', 'doing');
  await openSheet(page, 'シートで操作');
  await page.getByTestId('sheet-delete').click();
  await expect(card(page, 'シートで操作')).toHaveCount(0);
  await page.getByTestId('toast').filter({ hasText: '削除しました' }).getByRole('button', { name: '元に戻す' }).click();
  await expect(card(page, 'シートで操作')).toBeVisible();
});

test('calendar: month shows blocks filled and deadlines outlined, day view draws block vs line', async ({ page }) => {
  const today = plusDays(0);
  await page.goto('/');
  await ready(page);
  await add(page, 'ゼミ準備');
  await add(page, '原稿提出');
  await add(page, '経費精算');
  await detail(page, 'ゼミ準備', { plan: [today, '13:00', '15:00'] });
  await detail(page, '原稿提出', { due: [today, '14:30'] });
  await detail(page, '経費精算', { due: [today] });

  await page.getByTestId('open-calendar').click();
  await expect(page).toHaveURL(/\/calendar\?m=/);
  const cell = page.locator(`[data-date="${today}"]`);
  await expect(cell.getByTestId('m-plan').first()).toBeVisible();
  await expect(cell.getByTestId('m-due').first()).toHaveCSS('border-top-style', 'dashed');
  await expect(cell.getByTestId('m-plan').first()).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await cell.click();
  await expect(page).toHaveURL(new RegExp(`/calendar/${today}$`));
  const block = page.getByTestId('block').filter({ hasText: 'ゼミ準備' });
  await expect(block).toBeVisible();
  await expect(block).toContainText('13:00–15:00');
  const line = page.getByTestId('deadline').filter({ hasText: '原稿提出' });
  await expect(line).toHaveCSS('border-top-style', 'dashed');
  expect((await line.boundingBox())!.height).toBeLessThanOrEqual(3); // a line, not a block
  await expect(page.getByTestId('allday').getByTestId('allday-due')).toContainText('経費精算');

  // vertical position follows the time: 14:30 deadline sits inside the 13:00–15:00 block's span
  const b = (await block.boundingBox())!;
  const l = (await line.boundingBox())!;
  expect(l.y).toBeGreaterThan(b.y);
  expect(l.y).toBeLessThan(b.y + b.height);

  // tap a block → sheet for that task
  await block.click();
  await expect(page.getByTestId('sheet-title')).toHaveValue('ゼミ準備');
});

test('tap an empty slot in the day view to create a scheduled task', async ({ page }) => {
  const day = plusDays(2);
  await page.goto(`/calendar/${day}`);
  await ready(page);
  const lanes = page.getByTestId('lanes');
  await expect(page.getByTestId('day-title')).toBeVisible();
  await page.waitForTimeout(500); // let the view's own initial scroll settle
  await lanes.click({ position: { x: 120, y: 10 * 56 + 10 } }); // ~10:00
  await expect(page.getByTestId('sheet')).toBeVisible();
  await expect(page.getByTestId('sheet-title')).toBeFocused();
  await expect(page.getByTestId('sheet-plan-date')).toHaveValue(day);
  await expect(page.getByTestId('sheet-plan-start')).toHaveValue('10:00');
  await expect(page.getByTestId('sheet-plan-end')).toHaveValue('11:00');
  await page.getByTestId('sheet-title').fill('枠から作成');
  await saveSheet(page);
  await expect(page.getByTestId('block').filter({ hasText: '枠から作成' })).toBeVisible();
  // and it is in the list on the memo screen too
  await page.getByTestId('day-back').click();
  await page.getByTestId('cal-back').click();
  await expect(card(page, '枠から作成').getByTestId('chip-plan')).toContainText('10:00–11:00');
});

test('calendar navigation: paging, today, swipe, and Back keeps the memo intact', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await memo(page).fill('書きかけのメモ');
  await page.getByTestId('open-calendar').click();
  const title = page.getByTestId('month-title');
  const start = await title.textContent();
  await page.getByTestId('month-next').click();
  await expect(title).not.toHaveText(start!);
  await page.getByTestId('month-today').click();
  await expect(title).toHaveText(start!);

  // swipe left = next month
  const grid = page.getByTestId('month-grid');
  const g = (await grid.boundingBox())!;
  await page.mouse.move(g.x + g.width * 0.8, g.y + 40);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width * 0.5, g.y + 42, { steps: 4 });
  await page.mouse.move(g.x + g.width * 0.2, g.y + 44, { steps: 4 });
  await page.mouse.up();
  await expect(title).not.toHaveText(start!);
  await expect(page).toHaveURL(/\/calendar\?m=/); // swipe did not open a day

  // day view paging
  await page.locator('[data-testid=cell]').nth(10).click();
  const dayTitle = page.getByTestId('day-title');
  const d0 = await dayTitle.textContent();
  await page.getByTestId('day-next').click();
  await expect(dayTitle).not.toHaveText(d0!);

  // browser Back: day → month → memo screen, memo text still there
  await page.goBack();
  await expect(page.getByTestId('month-grid')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('calendar')).toHaveCount(0);
  await expect(memo(page)).toHaveValue('書きかけのメモ');
});

test('deep link to a day works and its back button goes to the month', async ({ page }) => {
  const day = plusDays(5);
  await page.goto(`/calendar/${day}`);
  await ready(page);
  await expect(page.getByTestId('timeline')).toBeVisible();
  await page.getByTestId('day-back').click();
  await expect(page.getByTestId('month-grid')).toBeVisible();
  await page.getByTestId('cal-back').click();
  await expect(page.getByTestId('calendar')).toHaveCount(0);
  await expect(memo(page)).toBeVisible();
});

test('details sync to the server and show up on another device @local', async ({ page, browser }) => {
  const day = plusDays(1);
  const name = `cal-${uid()}`;
  await page.goto(`/auth/dev-login?name=${name}`);
  await ready(page);
  await add(page, '同期テスト');
  await detail(page, '同期テスト', { note: '端末をまたぐ', due: [day, '12:00'], plan: [day, '08:00', '09:00'] });
  await page.waitForTimeout(900);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await p2.goto(`/auth/dev-login?name=${name}`);
  await ready(p2);
  await expect(card(p2, '同期テスト').getByTestId('chip-due')).toContainText('明日 12:00');
  await p2.goto(`/calendar/${day}`);
  await expect(p2.getByTestId('block').filter({ hasText: '同期テスト' })).toContainText('08:00–09:00');
  await expect(p2.getByTestId('deadline').filter({ hasText: '同期テスト' })).toBeVisible();
  await other.close();
});

test('API rejects malformed dates and times @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=api-${uid()}`);
  const bad = (o: object) =>
    page.request.post('/api/tasks/sync', {
      data: { tasks: [{ id: crypto.randomUUID(), title: 'x', status: 'todo', created_at: 1, updated_at: 1, ...o }] },
    });
  expect((await bad({ due_date: '2026/10/19' })).status()).toBe(400);
  expect((await bad({ plan_date: '2026-10-19', plan_start: '25:00' })).status()).toBe(400);
  expect((await bad({ due_date: '2026-10-19', due_time: '09:30' })).status()).toBe(200);
});

// ---------- AI picks up deadlines ----------

test('Workers AI picks up deadlines from the memo @local', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/auth/dev-login?name=aidue-${uid()}`);
  await ready(page);
  await memo(page).fill('明日の17時までに部長に見積もりを送る。名刺も補充する');
  await page.getByTestId('ai-button').click();
  const panel = page.getByTestId('ai-suggestions');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByTestId('ai-due').first()).toContainText('明日 17:00');
  await page.getByTestId('ai-accept').click();
  await expect(page.getByTestId('task-card').getByTestId('chip-due').filter({ hasText: '明日 17:00' })).toHaveCount(1);
});

test('an AI-suggested deadline can be dropped before adding @local', async ({ page }) => {
  const tomorrow = plusDays(1);
  await page.route('**/api/ai/split', (route) =>
    route.fulfill({
      json: {
        tasks: [
          { title: '見積もりを送る', due_date: tomorrow, due_time: '17:00' },
          { title: '牛乳を買う', due_date: tomorrow, due_time: null },
        ],
      },
    }),
  );
  await page.goto(`/auth/dev-login?name=aimock-${uid()}`);
  await ready(page);
  await memo(page).fill('明日17時までに見積もり、牛乳');
  await page.getByTestId('ai-button').click();
  const panel = page.getByTestId('ai-suggestions');
  await expect(panel.getByTestId('ai-due')).toHaveCount(2);
  await panel.getByTestId('ai-due-remove').nth(1).click();
  await expect(panel.getByTestId('ai-due')).toHaveCount(1);
  await page.getByTestId('ai-accept').click();
  await expect(card(page, '見積もりを送る').getByTestId('chip-due')).toContainText('明日 17:00');
  await expect(card(page, '牛乳を買う')).toBeVisible();
  await expect(card(page, '牛乳を買う').getByTestId('chip-due')).toHaveCount(0);
});

// ---------- drag blocks in the day view ----------

async function blockOnDay(page: Page, day: string, title: string, start: string, end: string) {
  await page.goto('/');
  await ready(page);
  await add(page, title);
  await detail(page, title, { plan: [day, start, end] });
  await page.goto(`/calendar/${day}`);
  await ready(page);
  const b = page.getByTestId('block').filter({ hasText: title });
  await expect(b).toBeVisible();
  await page.waitForTimeout(500); // entrance animation
  return b;
}

test('drag a block to move it (snaps to 15 min) and it is saved', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'mouse drag; touch is covered separately');
  const day = plusDays(3);
  const b = await blockOnDay(page, day, 'ドラッグ移動', '10:00', '11:00');
  const box = (await b.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 15 + 30, { steps: 4 });
  await expect(page.getByTestId('drag-time')).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, box.y + 15 + 2 * 56 + 3, { steps: 6 }); // +2h (+3px → snaps)
  await page.mouse.up();
  await expect(b).toContainText('12:00–13:00');
  // a drag must not also open the sheet
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('block').filter({ hasText: 'ドラッグ移動' })).toContainText('12:00–13:00');
});

test('drag the bottom edge to change the end time', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'mouse drag; touch is covered separately');
  const day = plusDays(4);
  const b = await blockOnDay(page, day, 'ドラッグ伸縮', '14:00', '15:00');
  const handle = b.getByTestId('block-resize');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 42, { steps: 6 }); // +45 min
  await page.mouse.up();
  await expect(b).toContainText('14:00–15:45');
  await page.mouse.move(box.x + box.width / 2, box.y + 42 + box.height / 2);
  // can't shrink below 15 minutes
  const h2 = (await handle.boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + h2.width / 2, h2.y - 4 * 56, { steps: 6 });
  await page.mouse.up();
  await expect(b).toContainText('14:00–14:15');
});

test.describe(() => {
// Simulated touches go through CDP one call at a time; under heavy parallel load the "quick" swipe's
// first move can arrive after the 300 ms hold threshold. Passes reliably on its own, so allow a retry.
test.describe.configure({ retries: 2 });
test('touch: press and hold drags a block, a quick swipe just scrolls', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  const day = plusDays(5);
  const b = await blockOnDay(page, day, 'タッチ移動', '09:00', '10:00');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y }] } as any);

  // quick swipe over the block: no change. Simulated touches go one CDP call at a time; on a busy
  // machine the first move can land after the 300 ms hold threshold, which is (correctly) a hold.
  // Only a swipe whose first move really arrived quickly counts, so retry until one does.
  let box = (await b.boundingBox())!;
  let x = box.x + box.width / 2;
  let y = box.y + 15;
  for (let attempt = 0; attempt < 3; attempt++) {
    box = (await b.boundingBox())!;
    x = box.x + box.width / 2;
    y = box.y + 15;
    const t0 = Date.now();
    await touch('touchStart', x, y);
    await touch('touchMove', x, y + 15);
    const quick = Date.now() - t0 < 200;
    for (let i = 2; i <= 6; i++) await touch('touchMove', x, y + i * 15); // finger down: earlier hours, block stays on screen
    await touch('touchEnd');
    await page.waitForTimeout(1200); // let the fling scroll come to rest
    if (quick) break;
    // too slow to be a swipe; if it got treated as a drag, put the block back and try again
    await b.click();
    await page.getByTestId('sheet-plan-start').fill('09:00');
    await page.getByTestId('sheet-plan-end').fill('10:00');
    await page.getByTestId('sheet-done').click();
    await expect(b).toContainText('09:00–10:00');
  }
  await expect(b).toContainText('09:00–10:00');

  // hold, then drag down 1h
  box = (await b.boundingBox())!;
  x = box.x + box.width / 2;
  y = box.y + 15;
  await touch('touchStart', x, y);
  await page.waitForTimeout(450);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x, y + (i * 57) / 8);
  await touch('touchEnd');
  await expect(b).toContainText('10:00–11:00');
});
});
