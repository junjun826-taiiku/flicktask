import { test, expect, type Page } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const memo = (page: Page) => page.locator('#boot-memo');
const card = (page: Page, text: string) => page.getByTestId('task-card').filter({ hasText: text });

async function login(page: Page, name: string) {
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await page.goto(`/auth/dev-login?name=${name}`);
  await expect(page.locator('body')).toHaveClass(/ready/);
}
const base = { status: 'todo', kind: 'task', note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null };
const old = Date.now() - 200 * 86_400_000;

test('the device keeps a working set; old finished items stay on the server @local', async ({ page, browser }) => {
  const name = `ws-${uid()}`;
  await login(page, name);
  // seed history straight into the server: an old finished task, an old 予定, an open old task, a recent done task
  const res = await page.request.post('/api/tasks/sync', {
    data: {
      tasks: [
        { ...base, id: crypto.randomUUID(), title: '昔の完了タスク', status: 'done', created_at: old, updated_at: old },
        { ...base, id: crypto.randomUUID(), title: '昔の予定', kind: 'event', plan_date: daysAgo(200), created_at: old, updated_at: old },
        { ...base, id: crypto.randomUUID(), title: '古いけど未完了', created_at: old, updated_at: old },
        { ...base, id: crypto.randomUUID(), title: '最近の完了', status: 'done', created_at: Date.now(), updated_at: Date.now() },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();

  // a fresh device only downloads the working set
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, name);
  await expect(card(p2, '古いけど未完了')).toBeVisible();
  await expect(card(p2, '最近の完了')).toBeVisible();
  await expect(card(p2, '昔の完了タスク')).toHaveCount(0);
  const stored = await p2.evaluate(() => localStorage.getItem('ft.tasks.v1') ?? '');
  expect(stored).not.toContain('昔の完了タスク');
  expect(stored).not.toContain('昔の予定');

  // …and fetches an old month when the calendar opens it
  const d = daysAgo(200);
  await p2.goto(`/calendar?m=${d.slice(0, 7)}-01`);
  await expect(p2.locator(`[data-date="${d}"]`).getByTestId('m-event')).toContainText('昔の予定');
  await ctx.close();
});

test('incremental sync applies deletions from another device @local', async ({ page, browser }) => {
  const name = `del-${uid()}`;
  await login(page, name);
  await memo(page).fill('消される予定のタスク');
  await memo(page).press('Enter');
  await page.waitForTimeout(800);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, name);
  await expect(card(p2, '消される予定のタスク')).toBeVisible();
  const cursor = await p2.evaluate(() => JSON.parse(localStorage.getItem('ft.cursor.v1') ?? 'null')?.cursor);
  expect(cursor).toBeGreaterThan(0);

  await card(page, '消される予定のタスク').focus();
  await page.keyboard.press('Delete');
  await expect(card(p2, '消される予定のタスク')).toHaveCount(0, { timeout: 5000 });
  // and after a reload it doesn't come back
  await p2.reload();
  await expect(p2.locator('body')).toHaveClass(/ready/);
  await expect(card(p2, '消される予定のタスク')).toHaveCount(0);
  await ctx.close();
});

test('the changes API only returns what changed since the cursor @local', async ({ page }) => {
  await login(page, `api-${uid()}`);
  const first = await (await page.request.get(`/api/tasks/changes?from=${daysAgo(60)}`)).json();
  expect(first.reset).toBe(true);
  await page.request.post('/api/tasks/sync', {
    data: { tasks: [{ ...base, id: crypto.randomUUID(), title: '差分', created_at: Date.now(), updated_at: Date.now() }] },
  });
  const next = await (await page.request.get(`/api/tasks/changes?since=${first.cursor}`)).json();
  expect(next.reset).toBe(false);
  expect(next.tasks.map((t: { title: string }) => t.title)).toContain('差分');
  // a cursor older than the tombstone window forces a full working set
  const stale = await (await page.request.get(`/api/tasks/changes?since=${Date.now() - 40 * 86_400_000}&from=${daysAgo(60)}`)).json();
  expect(stale.reset).toBe(true);
});

test('export a backup and import it into another account @local', async ({ page, browser }) => {
  await login(page, `exp-${uid()}`);
  await memo(page).fill('・引き継ぐ書類\n・引き継ぐ連絡先');
  await memo(page).press('Enter');
  await page.waitForTimeout(800);

  await page.getByTestId('avatar').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  expect(download.suggestedFilename()).toMatch(/^flick-backup-\d{8}\.json$/);
  const path = await download.path();

  // next year's 幹部 account
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, `next-${uid()}`);
  await p2.getByTestId('avatar').click();
  await p2.getByTestId('import-file').setInputFiles(path!);
  await expect(p2.getByTestId('toast').filter({ hasText: '追加 2件' })).toBeVisible();
  await expect(card(p2, '引き継ぐ書類')).toBeVisible();
  await expect(card(p2, '引き継ぐ連絡先')).toBeVisible();

  // the original account is untouched (ids were re-issued, not stolen)
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/ready/);
  await expect(card(page, '引き継ぐ書類')).toBeVisible();

  // a file that isn't a backup is refused politely
  await p2.getByTestId('avatar').click();
  await p2.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(p2.getByTestId('toast').filter({ hasText: 'バックアップファイルではありません' })).toBeVisible();
  await ctx.close();
});

test('a save that loses to a newer server version gets that version back @local', async ({ page }) => {
  await login(page, `stale-${uid()}`);
  const id = crypto.randomUUID();
  const t = { ...base, id, title: '新しい方', created_at: 1000, updated_at: 5000 };
  await page.request.post('/api/tasks/sync', { data: { tasks: [t] } });
  const res = await (await page.request.post('/api/tasks/sync', { data: { tasks: [{ ...t, title: '古い方', updated_at: 4000 }] } })).json();
  expect(res.stale).toHaveLength(1);
  expect(res.stale[0].title).toBe('新しい方');
});
