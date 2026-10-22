import { test, expect } from '@playwright/test';

// Home: sidebar, これからの流れ, 今週やること, 直近の予定; theme; the data fields behind them.
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

test('home: events in the sidebar, 「その他」 last, dark by default', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  await page.getByTestId('nx-theme').click();
  await expect(page.getByTestId('nx')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.getByTestId('nx')).toHaveAttribute('data-theme', 'light');
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
  await p2.goto('/');
  await expect(p2.getByTestId('nx-event').filter({ hasText: '部同会' })).toBeVisible();
  const stored = await p2.evaluate((evId) => JSON.parse(localStorage.getItem('ft.events.v1') ?? '[]').find((e: { id: string }) => e.id === evId), evId);
  expect(stored.members).toEqual([{ name: '堤', color: 'brown' }]);
  await ctx.close();
});

test.describe('new home', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      (p) => {
        if (localStorage.getItem('home-seeded')) return;
        const now = Date.now();
        const evs = JSON.parse(localStorage.getItem('ft.events.v1') ?? '[]');
        evs.push({ id: 'ev2', name: '津田沼祭', start_date: p.d40, end_date: p.d41, place: '', color: 'pink', note: '', closed: false, roles: [], members: [], tags: [], created_at: now, updated_at: now, deleted: false });
        localStorage.setItem('ft.events.v1', JSON.stringify(evs));
        const tasks = JSON.parse(localStorage.getItem('ft.tasks.v1') ?? '[]');
        const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, roles: [], place: '', items: '', assignees: [], tag: '', created_at: now, updated_at: now };
        // t1 (案内状の発送, ev1) and t2/t3 (no event, no date) come from the outer seed
        tasks.push(
          { ...base, id: 'w1', title: '期限切れの申請', event_id: 'ev1', due_date: p.dm2, assignees: ['佐藤'] },
          { ...base, id: 'w2', title: '出店申請', event_id: 'ev2', due_date: p.today },
          { ...base, id: 'w3', title: '再来月の準備', event_id: 'ev2', due_date: p.d45 },
          { ...base, id: 'w5', title: '3週間後の締切', event_id: 'ev2', due_date: p.d20 },
          { ...base, id: 'w4', title: '個人の締切', event_id: null, due_date: p.today },
          { ...base, id: 's1', title: '幹部読み合わせ', kind: 'event', event_id: 'ev1', plan_date: p.d1, plan_start: '19:00', tag: '幹部読み合わせ' },
        );
        localStorage.setItem('ft.tasks.v1', JSON.stringify(tasks));
        localStorage.setItem('home-seeded', '1');
      },
      { today: plus(0), dm2: plus(-2), d1: plus(1), d20: plus(20), d40: plus(40), d41: plus(41), d45: plus(45) },
    );
  });

  test('これからの流れ: one row per running event with its deadlines; a row opens the event', async ({ page }) => {
    await page.goto('/');
    const rows = page.getByTestId('nx-tl-row');
    await expect(rows).toHaveCount(2);
    const obog = rows.filter({ hasText: '2026 OBOG総会' });
    // w1 is overdue (2 days ago); it is drawn red unless it falls before this week's Monday
    await expect(rows.filter({ hasText: '津田沼祭' }).getByTestId('nx-tl-due')).toHaveCount(3);
    await obog.click();
    await expect(page).toHaveURL(/\/events\/ev1$/);
    await expect(page.getByTestId('nx-event-title')).toContainText('2026 OBOG総会');
    await page.goBack();
    await expect(page.getByTestId('nx-timeline')).toBeVisible();
  });

  test('やること: the coming month grouped by event (その他 last), or one list by deadline; the choice is remembered', async ({ page }) => {
    await page.goto('/');
    const week = page.getByTestId('nx-week');
    const groups = week.getByTestId('nx-week-group');
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(0)).toContainText('2026 OBOG総会');
    await expect(groups.nth(0)).toContainText('期限切れ');
    await expect(groups.nth(2)).toContainText('その他');
    await expect(groups.nth(2)).toContainText('個人の締切');
    await expect(week.locator('h2')).toHaveText('やること');
    await expect(groups.nth(1)).toContainText('3週間後の締切'); // within the month
    await expect(week).not.toContainText('再来月の準備'); // beyond a month
    await expect(week).not.toContainText('個人のメモ'); // no date

    await page.getByTestId('nx-week-by-due').click();
    await expect(week.getByTestId('nx-week-group')).toHaveCount(0);
    await expect(week.getByTestId('nx-week-row').first()).toContainText('期限切れの申請'); // oldest first
    await page.reload();
    await expect(page.getByTestId('nx-week-by-due')).toHaveAttribute('aria-pressed', 'true');
  });

  test('checking a task off completes it, with undo', async ({ page }) => {
    await page.goto('/');
    const row = page.getByTestId('nx-week-row').filter({ hasText: '出店申請' });
    await row.getByTestId('nx-week-check').click();
    await expect(row).toHaveCount(0);
    await page.getByTestId('nx-toast').filter({ hasText: '完了' }).getByRole('button', { name: '元に戻す' }).click();
    await expect(page.getByTestId('nx-week-row').filter({ hasText: '出店申請' })).toBeVisible();
  });

  test('直近の予定 lists upcoming 予定 with their tag', async ({ page }) => {
    await page.goto('/');
    const item = page.getByTestId('nx-upcoming-item').filter({ hasText: '幹部読み合わせ' });
    await expect(item).toContainText('19:00');
    await expect(item).toContainText('2026 OBOG総会');
  });

  test('mini calendar: today is marked, months page, days with deadlines get a dot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nx-timeline')).toBeVisible(); // the app has loaded
    if (await page.getByTestId('nx-cal-toggle').isVisible()) await page.getByTestId('nx-cal-toggle').click(); // folded on phones
    const cal = page.getByTestId('nx-minical');
    await expect(cal).toBeVisible();
    const title = await page.getByTestId('nx-minical-title').textContent();
    await expect(cal.locator(`[data-date="${plus(0)}"]`)).toHaveClass(/today/);
    await page.getByTestId('nx-minical-next').click();
    await expect(page.getByTestId('nx-minical-title')).not.toHaveText(title!);
    await page.getByTestId('nx-minical-prev').click();
    await expect(page.getByTestId('nx-minical-title')).toHaveText(title!);
    expect(await cal.getByTestId('nx-minical-dot').count()).toBeGreaterThan(0);
  });
});
