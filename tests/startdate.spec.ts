import { test, expect, type Page } from '@playwright/test';

// 着手目安日: entered with the deadline when adding, edited in the panel, the start of a timeline bar,
// and the day it comes a 未着手 task moves to 進行中 by itself.
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (p) => {
      if (localStorage.getItem('seeded')) return;
      const now = Date.now();
      const members = [{ name: '佐藤', color: 'blue' }, { name: '上田', color: 'pink' }];
      localStorage.setItem('ft.events.v1', JSON.stringify([
        { id: 'ev1', name: '2027 新歓', start_date: p.d60, end_date: p.d60, place: '', color: 'orange', note: '', closed: false, roles: [], members, tags: [], created_at: now, updated_at: now, deleted: false },
      ]));
      const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_time: null, start_on: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, roles: [], place: '', items: '', tag: '', created_at: now, updated_at: now, event_id: 'ev1' };
      const old = now - 3 * 86_400_000; // last touched before yesterday began
      localStorage.setItem('ft.tasks.v1', JSON.stringify([
        { ...base, id: 'due', title: '着手日が来た作業', due_date: p.d10, start_on: p.dm1, assignees: ['佐藤'], created_at: old, updated_at: old },
        { ...base, id: 'back', title: '戻した作業', due_date: p.d10, start_on: p.dm1, assignees: ['佐藤'] }, // touched today: moved back by hand
        { ...base, id: 'later', title: 'まだ先の作業', due_date: p.d20, start_on: p.d5, assignees: ['佐藤'], created_at: old, updated_at: old },
        // same person: A then B, each with its own start day, fit one row; without start days B would take a new row
        { ...base, id: 'A', title: '前半の作業', due_date: p.d10, start_on: p.d3, assignees: ['上田'] },
        { ...base, id: 'B', title: '後半の作業', due_date: p.d20, start_on: p.d12, assignees: ['上田'] },
      ]));
      localStorage.setItem('ft.hinted', '1');
      localStorage.setItem('seeded', '1');
    },
    { dm1: plus(-1), d3: plus(3), d5: plus(5), d10: plus(10), d12: plus(12), d20: plus(20), d60: plus(60) },
  );
});
const stored = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem('ft.tasks.v1')!).find((t: { id: string }) => t.id === id), id);
const byTitle = (page: Page, title: string) => page.evaluate((title) => JSON.parse(localStorage.getItem('ft.tasks.v1')!).find((t: { title: string }) => t.title === title), title);

test('on opening, a 未着手 task whose start day has come is 進行中 — unless it was moved back that day', async ({ page }) => {
  await page.goto('/events/ev1');
  await expect(page.getByTestId('nx-prep')).toBeVisible();
  await expect.poll(async () => (await stored(page, 'due')).status).toBe('doing');
  expect((await stored(page, 'back')).status).toBe('todo');
  expect((await stored(page, 'later')).status).toBe('todo');
  // the card shows when to start while it waits
  await expect(page.getByTestId('nx-card').filter({ hasText: 'まだ先の作業' }).getByTestId('nx-card-start')).toHaveText(`${md(plus(5))}〜`);
});

test('the add form takes 締切日・時刻 and 着手目安日 (all optional) for what it adds', async ({ page }) => {
  await page.goto('/events/ev1');
  await expect(page.getByTestId('nx-add-submit')).toBeDisabled();
  await expect(page.getByTestId('nx-add-time')).toBeDisabled(); // a time needs a day
  await page.getByTestId('nx-add').fill('ビラの印刷');
  await page.getByTestId('nx-add-due').fill(plus(14));
  await page.getByTestId('nx-add-time').fill('17:00');
  await page.getByTestId('nx-add-start').fill(plus(7));
  await page.getByTestId('nx-add-submit').click();
  await expect.poll(() => byTitle(page, 'ビラの印刷')).toMatchObject({ due_date: plus(14), due_time: '17:00', start_on: plus(7), status: 'todo', event_id: 'ev1' });
  // the fields clear for the next one; Enter with no dates still works
  await expect(page.getByTestId('nx-add-due')).toHaveValue('');
  await page.getByTestId('nx-add').fill('名札の作成');
  await page.getByTestId('nx-add').press('Enter');
  await expect.poll(() => byTitle(page, '名札の作成')).toMatchObject({ due_date: null, start_on: null });
  // a start day that has already come: added as 進行中
  await page.getByTestId('nx-add').fill('すぐやる作業');
  await page.getByTestId('nx-add-start').fill(plus(0));
  await page.getByTestId('nx-add-submit').click();
  await expect.poll(() => byTitle(page, 'すぐやる作業')).toMatchObject({ start_on: plus(0), status: 'doing' });
});

test('setting 着手目安日 in the panel; a day that has come moves it to 進行中 (with undo)', async ({ page }) => {
  await page.goto('/events/ev1');
  await page.getByTestId('nx-card').filter({ hasText: 'まだ先の作業' }).click();
  await expect(page.getByTestId('nx-panel-start')).toHaveValue(plus(5));
  await page.getByTestId('nx-panel-start').fill(plus(0));
  await page.getByTestId('nx-panel-start').blur();
  await expect.poll(async () => (await stored(page, 'later')).status).toBe('doing');
  await page.getByTestId('nx-toast').filter({ hasText: '進行中' }).getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await stored(page, 'later')).status).toBe('todo');
  await page.getByTestId('nx-panel-start').fill('');
  await page.getByTestId('nx-panel-start').blur();
  await expect.poll(async () => (await stored(page, 'later')).start_on).toBe(null);
});

test('timeline bars start at 着手目安日, so two that follow each other share a row', async ({ page }) => {
  await page.goto('/events/ev1');
  await page.getByTestId('nx-view-timeline').click();
  const lane = page.getByTestId('nx-lane').filter({ hasText: '上田' });
  const a = lane.getByTestId('nx-pill').filter({ hasText: '前半の作業' });
  const b = lane.getByTestId('nx-pill').filter({ hasText: '後半の作業' });
  const [ba, bb] = [(await a.boundingBox())!, (await b.boundingBox())!];
  expect(Math.round(ba.y)).toBe(Math.round(bb.y)); // same row
  expect(bb.x).toBeGreaterThan(ba.x + ba.width); // B starts after A ends (12 days vs 10)
  // A starts 3 days after today: right of the today line
  const nowLine = page.locator('.now').first();
  expect(ba.x).toBeGreaterThan((await nowLine.boundingBox())!.x + 20);
});

test('the server moves 未着手 to 進行中 on the start day (daily job) @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=start-${Math.random().toString(36).slice(2, 8)}`);
  await expect(page.locator('body')).toHaveClass(/ready/);
  const now = Date.now();
  const old = now - 3 * 86_400_000;
  const jst = (n: number) => new Date(now + 9 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
  const t = (o: object) => ({ id: crypto.randomUUID(), status: 'todo', created_at: old, updated_at: old, ...o });
  const came = t({ title: '来た', start_on: jst(0) });
  const notYet = t({ title: 'まだ', start_on: jst(2) });
  const touched = t({ title: '今日戻した', start_on: jst(-1), updated_at: now });
  expect((await page.request.post('/api/tasks/sync', { data: { tasks: [came, notYet, touched] } })).status()).toBe(200);
  expect((await page.request.post('/api/tasks/sync', { data: { tasks: [{ ...came, start_on: 'x' }] } })).status()).toBe(400);
  await page.request.post('/line/dev-autostart');
  const got = (await (await page.request.get('/api/tasks/changes?from=2020-01-01')).json()).tasks as { id: string; status: string; start_on: string }[];
  const of = (x: { id: string }) => got.find((g) => g.id === x.id)!;
  expect(of(came)).toMatchObject({ status: 'doing', start_on: jst(0) });
  expect(of(notYet).status).toBe('todo');
  expect(of(touched).status).toBe('todo');
});
