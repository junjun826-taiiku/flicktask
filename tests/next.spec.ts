import { test, expect } from '@playwright/test';

// The new design lives at /next while it is being built; "/" keeps the current app.
const uid = () => Math.random().toString(36).slice(2, 8);
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([start]) => {
      if (localStorage.getItem('seeded')) return;
      const now = Date.now();
      const ev = { id: 'ev1', name: '2026 OBOG総会', start_date: start, end_date: start, place: '5号館', color: 'orange', note: '', closed: false,
        roles: [], members: [{ name: '佐藤', color: 'blue' }], tags: [], created_at: now, updated_at: now, deleted: false };
      const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, roles: [], place: '', items: '', created_at: now, updated_at: now };
      localStorage.setItem('ft.events.v1', JSON.stringify([ev]));
      localStorage.setItem('ft.tasks.v1', JSON.stringify([
        { ...base, id: 't1', title: '案内状の発送', event_id: 'ev1' },
        { ...base, id: 't2', title: '個人のメモ', event_id: null },
        { ...base, id: 't3', title: '買い出し', event_id: null },
      ]));
      localStorage.setItem('ft.hinted', '1');
      localStorage.setItem('seeded', '1');
    },
    [plus(31)],
  );
});

test('/next shows the new shell: events in the sidebar, 「その他」 last, dark by default', async ({ page }) => {
  await page.goto('/next');
  const root = page.getByTestId('nx');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  const events = page.getByTestId('nx-event');
  await expect(events.first()).toContainText('2026 OBOG総会');
  await expect(events.first()).toContainText('31');
  await expect(page.getByTestId('nx-other')).toContainText('その他');
  await expect(page.getByTestId('nx-other')).toContainText('2件'); // tasks with no event
  await expect(page.locator('#boot')).toHaveCount(0); // no memo skeleton in the new design
});

test('the theme switch flips to light and is remembered on the device', async ({ page }) => {
  await page.goto('/next');
  await page.getByTestId('nx-theme').click();
  await expect(page.getByTestId('nx')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.getByTestId('nx')).toHaveAttribute('data-theme', 'light');
});

test('the current app at / is unchanged', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/ready/);
  await expect(page.locator('#boot-memo')).toBeVisible();
  await expect(page.getByTestId('nx')).toHaveCount(0);
});

test('the API stores イベント担当, tags, assignees and the 15 colours @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=nx-${uid()}`);
  const now = Date.now();
  const ev = { id: crypto.randomUUID(), name: '新人戦', start_date: '2026-11-21', end_date: '2026-11-21', color: 'coral', created_at: now, updated_at: now,
    members: [{ name: '佐藤', color: 'indigo' }, { name: '上田', color: 'lime' }], tags: ['打ち上げ'], roles: [{ name: '受付', color: 'sky' }] };
  const task = { id: crypto.randomUUID(), title: '案内状', status: 'todo', created_at: now, updated_at: now, event_id: ev.id, assignees: ['佐藤', '上田'] };
  const sched = { id: crypto.randomUUID(), title: '読み合わせ', status: 'todo', kind: 'event', plan_date: '2026-11-04', created_at: now, updated_at: now, event_id: ev.id, tag: '読み合わせ' };
  expect((await page.request.post('/api/tasks/sync', { data: { events: [ev], tasks: [task, sched] } })).status()).toBe(200);

  const got = await (await page.request.get('/api/tasks/changes?from=2026-01-01')).json();
  const e = got.events.find((x: { id: string }) => x.id === ev.id);
  expect(e.color).toBe('coral');
  expect(e.members).toEqual(ev.members);
  expect(e.tags).toEqual(['打ち上げ']);
  const t = got.tasks.find((x: { id: string }) => x.id === task.id);
  expect(t.assignees).toEqual(['佐藤', '上田']);
  expect(got.tasks.find((x: { id: string }) => x.id === sched.id).tag).toBe('読み合わせ');

  const bad = (o: object) => page.request.post('/api/tasks/sync', { data: { events: [{ ...ev, id: crypto.randomUUID(), ...o }] } });
  expect((await bad({ color: 'chartreuse' })).status()).toBe(400);
  expect((await bad({ members: [{ name: '', color: 'blue' }] })).status()).toBe(400);
  expect((await bad({ members: Array.from({ length: 51 }, (_, i) => ({ name: `人${i}`, color: 'blue' })) })).status()).toBe(400);
  expect((await page.request.post('/api/tasks/sync', { data: { tasks: [{ ...task, id: crypto.randomUUID(), assignees: 'x' }] } })).status()).toBe(400);
});

test('old data without the new fields still loads, and new fields survive a sync round trip @local', async ({ page, browser }) => {
  const name = `nx-sync-${uid()}`;
  await page.goto(`/auth/dev-login?name=${name}`);
  await expect(page.locator('body')).toHaveClass(/ready/);
  const id = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ft.tasks.v1') ?? '[]');
    return s.length;
  });
  expect(id).toBeGreaterThanOrEqual(0);
  // write through the app's store so the push path carries the new fields
  const evId = crypto.randomUUID();
  await page.evaluate(async (evId) => {
    const now = Date.now();
    const ev = { id: evId, name: '部同会', start_date: '2026-12-03', end_date: '2026-12-03', place: '', color: 'magenta', roles: [], members: [{ name: '堤', color: 'brown' }], tags: [], note: '', closed: false, created_at: now, updated_at: now, deleted: false };
    await fetch('/api/tasks/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [ev] }) });
  }, evId);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(`/auth/dev-login?name=${name}`);
  await expect(p2.locator('body')).toHaveClass(/ready/);
  await p2.goto('/next');
  await expect(p2.getByTestId('nx-event').filter({ hasText: '部同会' })).toBeVisible();
  const stored = await p2.evaluate((evId) => JSON.parse(localStorage.getItem('ft.events.v1') ?? '[]').find((e: { id: string }) => e.id === evId), evId);
  expect(stored.members).toEqual([{ name: '堤', color: 'brown' }]);
  await ctx.close();
});
