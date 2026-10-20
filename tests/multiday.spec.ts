import { test, expect, type Page } from '@playwright/test';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
const uid = () => Math.random().toString(36).slice(2, 8);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
});
const eventCard = (page: Page, text: string) => page.getByTestId('event-card').filter({ hasText: text });
async function ready(page: Page) {
  await expect(page.locator('body')).toHaveClass(/ready/);
}
async function showSchedule(page: Page) {
  if (await page.getByTestId('pane-schedule').isVisible()) await page.getByTestId('pane-schedule').click();
}
async function addRange(page: Page, title: string, from: string, to: string) {
  await showSchedule(page);
  await page.getByTestId('add-event').click();
  await page.getByTestId('sheet-title').fill(title);
  await page.getByTestId('sheet-plan-date').fill(from);
  await page.getByTestId('sheet-plan-end-date').fill(to);
  await page.getByTestId('sheet-done').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
}

test('a 予定 can span several days and is all-day', async ({ page }) => {
  const from = plusDays(2);
  const to = plusDays(3);
  await page.goto('/');
  await ready(page);
  await showSchedule(page);
  await page.getByTestId('add-event').click();
  await page.getByTestId('sheet-title').fill('遠征');
  await page.getByTestId('sheet-plan-date').fill(from);
  await page.getByTestId('sheet-allday').click(); // give it times first…
  await expect(page.getByTestId('sheet-plan-start')).toBeVisible();
  await page.getByTestId('sheet-plan-end-date').fill(to); // …a range makes it all-day
  await expect(page.getByTestId('sheet-plan-start')).toHaveCount(0);
  await expect(page.getByTestId('sheet-multiday')).toContainText('2日間');
  await page.getByTestId('sheet-done').click();

  const ev = eventCard(page, '遠征');
  await expect(ev).toContainText('終日');
  await expect(ev.getByTestId('event-range')).toHaveText(`${md(from)}〜${md(to)}`);

  await page.reload();
  await ready(page);
  await showSchedule(page);
  await eventCard(page, '遠征').click();
  await expect(page.getByTestId('sheet-plan-end-date')).toHaveValue(to);
});

test('a multi-day 予定 shows on every day it covers', async ({ page }) => {
  const from = plusDays(1);
  const to = plusDays(3);
  await page.goto('/');
  await ready(page);
  await addRange(page, '合宿', from, to);

  // month view: one bar across the cells, labelled where it starts
  await page.goto(`/calendar?m=${from.slice(0, 7)}-01`);
  const bar = (d: string) => page.locator(`[data-date="${d}"]`).getByTestId('m-event').filter({ hasText: '合宿' });
  await expect(bar(from)).toHaveAttribute('data-span', 'start');
  await expect(bar(to)).toHaveAttribute('data-span', 'end');
  await expect(page.locator(`[data-date="${plusDays(4)}"]`).getByTestId('m-event')).toHaveCount(0);

  // day view: in the all-day row of a middle day, not as a timed block
  await page.goto(`/calendar/${plusDays(2)}`);
  await expect(page.getByTestId('allday').getByTestId('allday-plan')).toContainText('合宿');
  await expect(page.getByTestId('block')).toHaveCount(0);
});

test('a range that already started stays in the schedule under today', async ({ page }) => {
  await page.addInitScript(
    ([from, to]) => {
      const base = { status: 'todo', deleted: false, note: '', due_date: null, due_time: null, plan_start: null, plan_end: null, created_at: 1, updated_at: 1 };
      localStorage.setItem('ft.tasks.v1', JSON.stringify([{ ...base, id: 'r1', title: '学祭', kind: 'event', plan_date: from, plan_end_date: to }]));
    },
    [plusDays(-1), plusDays(1)],
  );
  await page.goto('/');
  await ready(page);
  await showSchedule(page);
  await expect(page.locator('.day-group').first().locator('h3')).toContainText('今日');
  await expect(eventCard(page, '学祭')).toBeVisible();
});

test('the API keeps ranges sane @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=range-${uid()}`);
  const send = (o: object) =>
    page.request.post('/api/tasks/sync', {
      data: { tasks: [{ id: crypto.randomUUID(), title: 'x', status: 'todo', kind: 'event', created_at: 1, updated_at: 1, ...o }] },
    });
  expect((await send({ plan_date: '2026-10-22', plan_end_date: '2026-10-21' })).status()).toBe(400);
  expect((await send({ plan_end_date: '2026-10-21' })).status()).toBe(400);
  expect((await send({ plan_date: '2026-10-21', plan_end_date: '2026-10-22' })).status()).toBe(200);
});

test('ranges sync to another device @local', async ({ page, browser }) => {
  const name = `range-sync-${uid()}`;
  await page.goto(`/auth/dev-login?name=${name}`);
  await ready(page);
  await addRange(page, '連日の大会', plusDays(5), plusDays(6));
  // wait until this device has pushed everything (no pending changes), not a fixed time
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('ft.dirty.v1') ?? '[]') + (localStorage.getItem('ft.dirtyEvents.v1') ?? '[]')), { timeout: 10_000 }).toBe('[][]');
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(`/auth/dev-login?name=${name}`);
  await ready(p2);
  await showSchedule(p2);
  await expect(eventCard(p2, '連日の大会').getByTestId('event-range')).toHaveText(`${md(plusDays(5))}〜${md(plusDays(6))}`);
  await other.close();
});
