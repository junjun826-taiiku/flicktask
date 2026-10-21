import { test, expect } from '@playwright/test';

// Stage 4: the month view of the new design, and 当日モード entered from it.
const pad = (n: number) => String(n).padStart(2, '0');
const at = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    const now = Date.now();
    const ev = (o: object) => ({ place: '', note: '', closed: false, roles: [{ name: '受付', color: 'pink' }], members: [], tags: [], created_at: now, updated_at: now, deleted: false, ...o });
    localStorage.setItem('ft.events.v1', JSON.stringify([
      ev({ id: 'fest', name: '津田沼祭', start_date: '2026-11-21', end_date: '2026-11-22', color: 'pink' }),
      ev({ id: 'obog', name: '2026 OBOG総会', start_date: '2026-11-21', end_date: '2026-11-21', color: 'orange' }),
    ]));
    const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, place: '', items: '', tag: '', assignees: [], roles: [], created_at: now, updated_at: now };
    localStorage.setItem('ft.tasks.v1', JSON.stringify([
      { ...base, id: 'd1', title: '食品の発注', event_id: 'obog', due_date: '2026-11-10' },
      { ...base, id: 'm1', title: '本部員集合', event_id: 'obog', plan_date: '2026-11-21', plan_start: '11:30', plan_end: '11:45' },
      { ...base, id: 's1', title: '読み合わせ', kind: 'event', event_id: 'obog', plan_date: '2026-11-18', plan_start: '19:30', tag: '読み合わせ' },
      { ...base, id: 'x1', title: '年末大掃除', kind: 'event', event_id: null, plan_date: '2026-12-05', plan_end_date: '2026-12-07' },
    ]));
    localStorage.setItem('ft.hinted', '1');
    localStorage.setItem('seeded', '1');
  });
});

test('month view: event bars across their days, deadlines and 予定 in the cells, not the timetable', async ({ page }) => {
  await page.goto('/calendar?m=2026-11-01');
  await expect(page.getByTestId('nx-month-title')).toHaveText('2026年11月');
  await expect(page.getByTestId('nx-month-bar').filter({ hasText: '津田沼祭' })).toHaveCount(2); // Sat 21 and again on the next week row (Sun 22)
  const cell = (d: string) => page.locator(`[data-date="${d}"]`);
  await expect(cell(at(2026, 11, 10))).toContainText('食品の発注');
  await expect(cell(at(2026, 11, 18))).toContainText('読み合わせ');
  await expect(cell(at(2026, 11, 21))).toContainText('2026 OBOG総会');
  await expect(cell(at(2026, 11, 21))).not.toContainText('本部員集合'); // 当日の動き stay in the event
  await page.getByTestId('nx-month-next').click();
  await expect(page.getByTestId('nx-month-title')).toHaveText('2026年12月');
  await expect(page.getByTestId('nx-month-bar').filter({ hasText: '年末大掃除' })).toHaveCount(2); // Sat 12/5, then Sun–Mon on the next row
});

test('tapping a day lists it; an item opens where it lives', async ({ page }) => {
  await page.goto('/calendar?m=2026-11-01');
  await page.locator('[data-date="2026-11-18"]').click();
  const panel = page.getByTestId('nx-month-day');
  await expect(panel).toContainText('11月18日');
  await panel.getByTestId('nx-month-day-item').filter({ hasText: '読み合わせ' }).click();
  await expect(page).toHaveURL(/\/events\/obog\?tab=sched$/);
  await expect(page.getByTestId('nx-sched')).toBeVisible();
});

test('the mini calendar opens the month view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nx-timeline')).toBeVisible();
  if (await page.getByTestId('nx-cal-toggle').isVisible()) await page.getByTestId('nx-cal-toggle').click();
  await page.getByTestId('nx-open-month').click();
  await expect(page.getByTestId('nx-month')).toBeVisible();
});

test('当日モード from the new design is dark and comes back to the event', async ({ page }) => {
  await page.goto('/events/obog');
  await page.getByTestId('nx-live-start').click();
  await page.getByTestId('pick-hq').click();
  await expect(page.getByTestId('live')).toHaveClass(/dark/);
  await page.getByTestId('live-all-back').click();
  await expect(page).toHaveURL(/\/events\/obog$/);
  // opened directly, × goes to the event's 当日の動き; light theme makes it light
  await page.evaluate(() => localStorage.setItem('ft.theme.v1', 'light'));
  await page.goto('/events/obog/live');
  await expect(page.getByTestId('live')).not.toHaveClass(/dark/);
  await page.getByTestId('live-all-back').click();
  await expect(page).toHaveURL(/\/events\/obog\?tab=day$/);
});

test('addresses from before the redesign still land on the right screen', async ({ page }) => {
  await page.goto('/next/events/obog?tab=memo');
  await expect(page).toHaveURL(/\/events\/obog\?tab=memo$/);
  await expect(page.getByTestId('nx-memo')).toBeVisible();
  await page.goto('/calendar/2026-11-18');
  await expect(page).toHaveURL(/\/calendar\?m=2026-11-01&d=2026-11-18$/);
  await expect(page.getByTestId('nx-month-day')).toBeVisible();
  await page.goto('/events');
  await expect(page.getByTestId('nx-timeline')).toBeVisible();
});
