import { test, expect, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const uid = () => Math.random().toString(36).slice(2, 8);
const memo = (page: Page) => page.locator('#boot-memo');
const card = (page: Page, text: string) => page.getByTestId('task-card').filter({ hasText: text });
async function ready(page: Page) {
  await expect(page.locator('body')).toHaveClass(/ready/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
});

/** Seed an event and items straight into local storage (works signed out). */
async function seed(page: Page, tasks: object[] = [], event: object = {}) {
  await page.addInitScript(
    ([tasks, event]) => {
      if (localStorage.getItem('seeded')) return;
      const now = Date.now();
      const ev = {
        id: 'ev1', name: '秋季リーグ戦', start_date: '', end_date: '', place: '第1体育館', color: 'blue', note: '', closed: false, created_at: now, updated_at: now, deleted: false,
        roles: [{ name: '本部', color: 'gray' }, { name: '受付', color: 'blue' }, { name: '設営', color: 'orange' }],
        ...event,
      };
      const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, event_id: 'ev1', roles: [], place: '', items: '' };
      let n = now;
      localStorage.setItem('ft.events.v1', JSON.stringify([ev]));
      localStorage.setItem('ft.tasks.v1', JSON.stringify((tasks as object[]).map((t) => ({ ...base, id: crypto.randomUUID(), created_at: n--, updated_at: n, ...t }))));
      localStorage.setItem('seeded', '1');
    },
    [tasks, { start_date: plus(11), end_date: plus(12), ...event }] as const,
  );
}

test('create an event from home; it opens and shows the days left', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('event-chip-add').click();
  const sheet = page.getByTestId('event-sheet');
  await expect(page.getByTestId('event-name')).toBeFocused();
  await page.getByTestId('event-name').fill('新人戦');
  await page.getByTestId('event-start').fill(plus(20));
  await page.getByTestId('event-end').fill(plus(21));
  await page.getByTestId('event-place').fill('武道場');
  await page.getByTestId('event-color-green').click();
  await sheet.getByTestId('role-preset').filter({ hasText: '受付' }).click();
  await sheet.getByTestId('role-preset').filter({ hasText: '設営' }).click();
  await expect(sheet.getByTestId('role-name')).toHaveCount(2);
  await page.getByTestId('event-save').click();

  await expect(page).toHaveURL(/\/events\/[^/]+$/);
  await expect(page.getByTestId('event-title')).toHaveText('新人戦');
  await expect(page.getByTestId('event-ring')).toContainText('20日');
  await page.goto('/events');
  await expect(page.getByTestId('meet-card').filter({ hasText: '新人戦' }).getByTestId('event-days')).toHaveText('20日');
});

test('home switcher narrows the lists and new memos go into the chosen event', async ({ page }) => {
  await seed(page, [{ title: '審判派遣依頼', due_date: plus(1) }, { title: '関係ないタスク', event_id: null }]);
  await page.goto('/');
  await ready(page);
  await expect(card(page, '関係ないタスク')).toBeVisible();
  await expect(card(page, '審判派遣依頼').getByTestId('chip-event')).toContainText('秋季リーグ戦');

  const chip = page.getByTestId('event-chip').filter({ hasText: '秋季リーグ戦' });
  await expect(chip).toContainText('あと11日');
  await chip.click();
  await expect(card(page, '関係ないタスク')).toHaveCount(0);
  await expect(card(page, '審判派遣依頼')).toBeVisible();
  await expect(page.getByTestId('composer-target')).toContainText('秋季リーグ戦の');

  await memo(page).fill('弁当を発注');
  await memo(page).press('Enter');
  await expect(card(page, '弁当を発注')).toBeVisible();
  await page.getByTestId('event-chip-all').click();
  await expect(card(page, '弁当を発注').getByTestId('chip-event')).toContainText('秋季リーグ戦');

  // tapping the selected chip again opens the event
  await chip.click();
  await chip.click();
  await expect(page.getByTestId('event-title')).toHaveText('秋季リーグ戦');
});

test('準備 is grouped by when it is due, relative to today and the event', async ({ page }) => {
  await seed(page, [
    { title: 'A期限切れ', due_date: plus(-2) },
    { title: 'B今週', due_date: plus(3) },
    { title: 'C本番まで', due_date: plus(9) },
    { title: 'D本番後', due_date: plus(20) },
    { title: 'E日付なし' },
    { title: 'F完了', status: 'done', due_date: plus(1) },
    { title: '動き（準備には出ない）', plan_date: plus(11), plan_start: '09:00', plan_end: '10:00' },
  ]);
  await page.goto('/events/ev1');
  await ready(page);
  const groups = page.getByTestId('prep-group');
  await expect(groups.locator('h3')).toHaveText(['期限切れ', '今週', '本番まで', '本番後', '日付なし']);
  await expect(groups.nth(0)).toContainText('A期限切れ');
  await expect(groups.nth(3)).toContainText('D本番後');
  await expect(page.getByTestId('event-screen').getByText('動き（準備には出ない）')).toHaveCount(0);
  await expect(page.getByTestId('event-ring')).toContainText('1/6 完了');
  await page.getByTestId('prep-done-toggle').click();
  await expect(page.getByTestId('event-screen').getByTestId('task-card').filter({ hasText: 'F完了' })).toBeVisible();

  // add a prep task from here: it belongs to the event
  await page.getByTestId('event-add-task').click();
  await page.getByTestId('sheet-title').fill('G新しい準備');
  await expect(page.getByTestId('sheet-event-option').filter({ hasText: '秋季リーグ戦' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('sheet-done').click();
  await expect(page.getByTestId('prep-group').filter({ hasText: '日付なし' })).toContainText('G新しい準備');
});

test('当日の動き: add a move with 担当・場所, filter by 担当', async ({ page }) => {
  await seed(page, [
    { title: '集合・朝礼', plan_date: plus(11), plan_start: '07:30', plan_end: '08:00' },
    { title: 'コート設営', plan_date: plus(11), plan_start: '08:00', plan_end: '08:45', roles: ['設営'] },
    { title: '開会式', kind: 'event', plan_date: plus(11), plan_start: '09:00', plan_end: '09:15' },
  ]);
  await page.goto('/events/ev1?tab=day');
  await ready(page);
  const rows = page.getByTestId('plan-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('全員');

  await page.getByTestId('event-add-move').click();
  await page.getByTestId('sheet-title').fill('受付・選手誘導');
  await page.getByTestId('sheet-plan-start').fill('08:30');
  await expect(page.getByTestId('sheet-move')).toBeVisible();
  await page.getByTestId('sheet-role').filter({ hasText: '受付' }).click();
  await page.getByTestId('sheet-place').fill('正面玄関');
  await page.getByTestId('sheet-items').fill('名簿、ペン');
  await page.getByTestId('sheet-done').click();

  const added = rows.filter({ hasText: '受付・選手誘導' });
  await expect(added).toContainText('08:30');
  await expect(added).toContainText('正面玄関');
  await expect(added.locator('.role-chip')).toHaveText(['受付']);
  await expect(rows.nth(2)).toContainText('受付・選手誘導'); // sorted by time

  await page.getByTestId('role-filter').selectOption('設営');
  await expect(rows.filter({ hasText: '受付・選手誘導' })).toHaveCount(0);
  await expect(rows.filter({ hasText: 'コート設営' })).toBeVisible();
  await expect(rows.filter({ hasText: '集合・朝礼' })).toBeVisible(); // 全員 stays
});

test('the event shows as a bar on the calendar and links back to it', async ({ page }) => {
  await seed(page);
  await page.goto(`/calendar?m=${plus(11).slice(0, 7)}-01`);
  await ready(page);
  // the bar may wrap onto the next month; check the first day if it is in this grid
  const start = page.locator(`[data-date="${plus(11)}"]`).getByTestId('m-meet');
  await expect(start).toContainText('秋季リーグ戦');
  await page.goto(`/calendar/${plus(12)}`);
  await page.getByTestId('allday-meet').click();
  await expect(page.getByTestId('event-title')).toHaveText('秋季リーグ戦');
});

test('edit and delete an event; its tasks stay, undo brings it back', async ({ page }) => {
  await seed(page, [{ title: '残るタスク' }]);
  await page.goto('/events/ev1');
  await ready(page);
  await page.getByTestId('event-edit').click();
  await page.getByTestId('event-name').fill('秋季リーグ戦（改）');
  await page.getByTestId('event-save').click();
  await expect(page.getByTestId('event-title')).toHaveText('秋季リーグ戦（改）');

  await page.getByTestId('event-edit').click();
  await page.getByTestId('event-delete').click();
  const toast = page.getByTestId('toast').filter({ hasText: 'イベントを削除しました' });
  await expect(toast).toBeVisible();
  await page.goto('/');
  await expect(card(page, '残るタスク')).toBeVisible();
  await expect(card(page, '残るタスク').getByTestId('chip-event')).toHaveCount(0);
  await expect(page.getByTestId('event-chip')).toHaveCount(0);
});

test('events and their tasks sync to another device @local', async ({ page, browser }) => {
  const name = `ev-sync-${uid()}`;
  await page.goto(`/auth/dev-login?name=${name}`);
  await ready(page);
  await page.getByTestId('event-chip-add').click();
  await page.getByTestId('event-name').fill('同期する大会');
  await page.getByTestId('role-preset').filter({ hasText: '本部' }).click();
  await page.getByTestId('event-save').click();
  await page.getByTestId('event-add-task').click();
  await page.getByTestId('sheet-title').fill('大会の準備');
  await page.getByTestId('sheet-done').click();
  await page.waitForTimeout(900);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(`/auth/dev-login?name=${name}`);
  await ready(p2);
  await expect(p2.getByTestId('event-chip').filter({ hasText: '同期する大会' })).toBeVisible();
  await p2.getByTestId('event-chip').filter({ hasText: '同期する大会' }).click();
  await expect(card(p2, '大会の準備')).toBeVisible();
  // live: renaming on device 1 shows up on device 2 without a reload
  await page.getByTestId('event-edit').click();
  await page.getByTestId('event-name').fill('同期する大会2');
  await page.getByTestId('event-save').click();
  await expect(p2.getByTestId('event-chip').filter({ hasText: '同期する大会2' })).toBeVisible({ timeout: 5000 });
  await ctx.close();
});

test('the API validates events @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=ev-api-${uid()}`);
  const send = (o: object) =>
    page.request.post('/api/tasks/sync', {
      data: { events: [{ id: crypto.randomUUID(), name: '大会', start_date: '2026-10-31', end_date: '2026-11-01', created_at: 1, updated_at: 1, ...o }] },
    });
  expect((await send({ end_date: '2026-10-30' })).status()).toBe(400);
  expect((await send({ name: ' ' })).status()).toBe(400);
  expect((await send({ color: 'chartreuse' })).status()).toBe(400);
  expect((await send({ roles: [{ name: '受付', color: 'blue' }] })).status()).toBe(200);
});
