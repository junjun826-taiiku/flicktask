import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const uid = () => Math.random().toString(36).slice(2, 8);
const at = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

/** The day's plan from the design: it's 9:12 — 受付 is mid 受付・選手誘導, マイク確認 (設営) ran late. */
function plan(day: string) {
  return [
    { title: '集合・朝礼', plan_start: '07:30', plan_end: '08:00', status: 'done' },
    { title: 'コート設営', plan_start: '08:00', plan_end: '08:45', roles: ['設営'], status: 'done' },
    { title: 'マイク確認', plan_start: '08:45', plan_end: '09:00', roles: ['設営'] },
    { title: '受付・選手誘導', plan_start: '08:30', plan_end: '09:30', place: '正面玄関', roles: ['受付'], items: '名簿、ペン' },
    { title: '開会式', kind: 'event', plan_start: '09:00', plan_end: '09:15' },
    { title: '来賓案内', plan_start: '09:30', plan_end: '10:00', place: '本部席', roles: ['受付', '本部'] },
    { title: '会場巡回', plan_start: '10:00', plan_end: '11:00', roles: ['設営'] },
    { title: '弁当の配布', plan_start: '12:00', plan_end: '13:00', roles: ['受付'] },
  ].map((t) => ({ plan_date: day, ...t }));
}

async function seed(page: Page, { day = plus(0), start = plus(0), end = plus(0) } = {}) {
  await page.addInitScript(
    ([tasks, start, end]) => {
      if (localStorage.getItem('seeded')) return;
      const now = Date.now();
      const ev = { id: 'ev1', name: '秋季リーグ戦', start_date: start, end_date: end, place: '第1体育館', color: 'blue', note: '', closed: false, created_at: now, updated_at: now, deleted: false,
        roles: [{ name: '本部', color: 'gray' }, { name: '受付', color: 'blue' }, { name: '設営', color: 'orange' }] };
      const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_end_date: null, event_id: 'ev1', roles: [], place: '', items: '' };
      let n = now;
      localStorage.setItem('ft.events.v1', JSON.stringify([ev]));
      localStorage.setItem('ft.tasks.v1', JSON.stringify((tasks as object[]).map((t) => ({ ...base, id: crypto.randomUUID(), created_at: n--, updated_at: n, ...t }))));
      localStorage.setItem('ft.hinted', '1');
      localStorage.setItem('seeded', '1');
    },
    [plan(day), start, end] as const,
  );
}
async function ready(page: Page) {
  await expect(page.locator('body')).toHaveClass(/ready/);
}
async function pick(page: Page, ...roles: string[]) {
  for (const r of roles) await page.getByTestId('pick-role').filter({ hasText: r }).click();
  await page.getByTestId('pick-start').click();
}

test('on the event day the home banner opens 当日モード; いま / つぎ follow the clock', async ({ page }) => {
  await page.clock.install({ time: at(9, 12) });
  await seed(page);
  await page.goto('/');
  await ready(page);
  const banner = page.getByTestId('live-banner');
  await expect(banner).toContainText('本番当日');
  await banner.click();
  await expect(page.getByTestId('live-pick')).toBeVisible();
  await pick(page, '受付');

  await expect(page.getByTestId('live-clock')).toHaveText('9:12');
  const now = page.getByTestId('live-now');
  await expect(now).toContainText('受付・選手誘導');
  await expect(now).toContainText('正面玄関');
  await expect(now.locator('.lv-items i')).toHaveText(['名簿', 'ペン']);
  await expect(page.getByTestId('live-next')).toContainText('来賓案内');
  await expect(page.getByTestId('live-next')).toContainText('あと18分');
  // 受付's flow: 全員 items + 受付 items + 予定, not 設営's
  const rows = page.getByTestId('live-row');
  await expect(rows.filter({ hasText: '集合・朝礼' })).toHaveCount(1);
  await expect(rows.filter({ hasText: '会場巡回' })).toHaveCount(0);
  await expect(rows.filter({ hasText: '開会式' })).toHaveCount(1);
});

test('flick the いま card right to finish it, undo from the toast', async ({ page }) => {
  await page.clock.install({ time: at(9, 12) });
  await seed(page);
  await page.goto('/events/ev1/live');
  await ready(page);
  await pick(page, '受付');
  const card = page.getByTestId('live-now');
  await expect(card).toContainText('受付・選手誘導');
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 60 + i * 20, box.y + box.height / 2);
  await page.mouse.up();
  await expect(page.getByTestId('live-now-idle')).toContainText('次の動きまで待機');
  await expect(page.getByTestId('live-row').filter({ hasText: '受付・選手誘導' })).toHaveAttribute('data-state', 'done');
  await page.getByTestId('toast').filter({ hasText: '完了' }).getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByTestId('live-now')).toContainText('受付・選手誘導');
});

test('late moves show up in red for their 担当; the 担当 is remembered on the device', async ({ page }) => {
  await page.clock.install({ time: at(9, 12) });
  await seed(page);
  await page.goto('/events/ev1/live');
  await ready(page);
  await pick(page, '設営');
  await expect(page.getByTestId('live-over')).toContainText('マイク確認');
  await page.getByTestId('live-over').click(); // done
  await expect(page.getByTestId('live-over')).toHaveCount(0);

  await page.reload();
  await ready(page);
  await expect(page.getByTestId('live-pick')).toHaveCount(0);
  await expect(page.getByTestId('live-role')).toContainText('設営');
  // switch 担当
  await page.getByTestId('live-role').click();
  await page.getByTestId('pick-role').filter({ hasText: '設営' }).click(); // deselect
  await pick(page, '受付');
  await expect(page.getByTestId('live-now')).toContainText('受付・選手誘導');
});

test('本部 sees every 担当 on one board with done / now / late states', async ({ page }) => {
  await page.clock.install({ time: at(9, 12) });
  await seed(page);
  await page.goto('/events/ev1/live');
  await ready(page);
  await page.getByTestId('pick-hq').click();
  const board = page.getByTestId('live-board');
  await expect(board).toBeVisible();
  const block = (t: string) => board.getByTestId('board-block').filter({ hasText: t });
  await expect(block('集合・朝礼')).toHaveAttribute('data-state', 'done');
  await expect(block('受付・選手誘導')).toHaveAttribute('data-state', 'now');
  await expect(block('マイク確認')).toHaveAttribute('data-state', 'over');
  await expect(block('開会式')).toHaveAttribute('data-state', 'event');
  await expect(block('来賓案内')).toHaveCount(2); // one block in each of its 担当 columns
});

test('押し shifts what has not started yet, shows on the board, and can be undone', async ({ page }) => {
  await page.clock.install({ time: at(9, 12) });
  await seed(page);
  await page.goto('/events/ev1/live');
  await ready(page);
  await pick(page, '受付');
  await page.clock.pauseAt(new Date(at(9, 12).getTime() + 40_000)); // keep the undo toast up while the test looks around
  await page.getByTestId('live-delay').click();
  await page.getByTestId('delay-10').click();
  const preview = page.getByTestId('delay-preview');
  await expect(preview).toContainText('来賓案内');
  await expect(preview).toContainText('→ 09:40');
  await expect(preview).not.toContainText('受付・選手誘導'); // already running: not moved
  await page.getByTestId('delay-apply').click();
  await expect(page.getByTestId('live-next')).toContainText('09:40');
  await page.getByTestId('live-all').click();
  await expect(page.getByTestId('live-delay-banner')).toContainText('＋10分 押し中');
  await page.getByTestId('toast').filter({ hasText: '押しました' }).getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByTestId('live-delay-banner')).toHaveCount(0);
  await page.getByTestId('live-all-back').click();
  await expect(page.getByTestId('live-next')).toContainText('09:30');
});

test('end of the day: finish or hand back leftovers, save the 申し送り, close the event', async ({ page }) => {
  await page.clock.install({ time: at(17, 50) });
  await seed(page);
  await page.goto('/events/ev1/live');
  await ready(page);
  await page.getByTestId('pick-hq').click();
  await page.getByTestId('live-end').click();
  const left = page.getByTestId('sum-left');
  await expect(left).toHaveCount(5); // everything not done
  await left.filter({ hasText: 'マイク確認' }).getByTestId('sum-done-btn').click();
  await left.filter({ hasText: '弁当の配布' }).getByTestId('sum-prep-btn').click();
  await expect(left).toHaveCount(3);
  await expect(page.getByTestId('sum-done')).toContainText('3');
  await page.getByTestId('sum-note').fill('受付は2人だと足りない');
  await page.getByTestId('sum-finish').click();

  // back home; the event is closed and its note kept
  await expect(page.getByTestId('event-chip')).toHaveCount(0);
  await expect(page.getByTestId('live-banner')).toHaveCount(0);
  await page.goto('/events/ev1');
  await page.getByTestId('event-edit').click();
  await expect(page.getByTestId('event-note')).toHaveValue(/受付は2人だと足りない/);
  await page.keyboard.press('Escape');
  // 弁当の配布 became a prep task due tomorrow
  await page.getByTestId('tab-prep').click();
  await expect(page.getByTestId('event-screen').getByTestId('task-card').filter({ hasText: '弁当の配布' })).toBeVisible();
});

test('before the event, 当日モード is a preview of day one', async ({ page }) => {
  await page.clock.install({ time: at(20, 0) });
  await seed(page, { day: plus(3), start: plus(3), end: plus(3) });
  await page.goto('/events/ev1');
  await ready(page);
  await expect(page.getByTestId('live-banner')).toHaveCount(0);
  await page.getByTestId('tab-day').click();
  await page.getByTestId('live-start').click();
  await pick(page, '受付');
  await expect(page.getByTestId('live-preview')).toContainText('プレビュー');
  await expect(page.getByTestId('live-next')).toContainText('08:30');

  // the × leaves 当日モード
  await page.getByTestId('live-exit').click();
  await expect(page).toHaveURL(/\/events\/ev1(\?|$)/);
  await expect(page.getByTestId('live')).toHaveCount(0);

  // finishing a preview only leaves: the event is not closed and no note is written
  await page.getByTestId('live-start').click();
  await page.getByTestId('live-end').click();
  await page.getByTestId('sum-note').fill('プレビューのメモ');
  await expect(page.getByTestId('sum-finish')).toHaveText('プレビューを閉じる');
  await page.getByTestId('sum-finish').click();
  await expect(page.getByTestId('event-closed')).toHaveCount(0);
  await page.getByTestId('event-edit').click();
  await expect(page.getByTestId('event-note')).toHaveValue('');
});

test('overlapping items on the 本部 board sit side by side, never on top of each other', async ({ page }) => {
  await page.clock.install({ time: at(9, 12) });
  await seed(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded2')) return;
    const tasks = JSON.parse(localStorage.getItem('ft.tasks.v1')!);
    const t0 = tasks[0];
    tasks.push({ ...t0, id: crypto.randomUUID(), title: '全員ミーティング', status: 'todo', roles: [], plan_start: '07:40', plan_end: '08:10' });
    tasks.push({ ...t0, id: crypto.randomUUID(), title: '受付の準備', status: 'todo', roles: ['受付'], plan_start: '08:40', plan_end: '09:10' });
    localStorage.setItem('ft.tasks.v1', JSON.stringify(tasks));
    localStorage.setItem('seeded2', '1');
  });
  await page.goto('/events/ev1/live');
  await ready(page);
  await page.getByTestId('pick-hq').click();
  const blocks = page.getByTestId('live-board').getByTestId('board-block');
  await expect(blocks.filter({ hasText: '全員ミーティング' })).toBeVisible();
  const boxes = await blocks.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { t: el.textContent, x1: r.left, x2: r.right, y1: r.top, y2: r.bottom }; }));
  for (const a of boxes)
    for (const b of boxes) {
      if (a === b) continue;
      const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 1 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 1;
      expect(overlap, `${a.t} overlaps ${b.t}`).toBe(false);
    }
});

test('本部 board updates live when another phone finishes a move @local', async ({ browser }) => {
  const name = `live-${uid()}`;
  const login = async (ctx: BrowserContext) => {
    const p = await ctx.newPage();
    await p.clock.install({ time: at(9, 12) });
    await p.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
    await p.goto(`/auth/dev-login?name=${name}`);
    await ready(p);
    return p;
  };
  const a = await login(await browser.newContext());
  // set up on device A through the API: event + plan
  const ev = { id: `ev-${uid()}`, name: '同期大会', start_date: plus(0), end_date: plus(0), color: 'blue', roles: [{ name: '受付', color: 'blue' }], created_at: Date.now(), updated_at: Date.now() };
  const tasks = plan(plus(0)).map((t) => ({ id: crypto.randomUUID(), status: 'todo', kind: 'task', created_at: Date.now(), updated_at: Date.now(), roles: [], ...t, event_id: ev.id }));
  expect((await a.request.post('/api/tasks/sync', { data: { events: [ev], tasks } })).ok()).toBeTruthy();
  await a.goto(`/events/${ev.id}/live`);
  await a.getByTestId('pick-hq').click();
  await expect(a.getByTestId('live-board').getByTestId('board-block').filter({ hasText: '受付・選手誘導' })).toHaveAttribute('data-state', 'now');

  const b = await login(await browser.newContext());
  await b.goto(`/events/${ev.id}/live`);
  await pick(b, '受付');
  await b.getByRole('button', { name: '完了にする' }).first().click(); // first unchecked in 受付's flow
  await expect(a.getByTestId('live-board').getByTestId('board-block').filter({ hasText: '受付・選手誘導' })).toHaveAttribute('data-state', 'done', { timeout: 6000 });
});
