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
const eventCard = (page: Page, text: string) => page.getByTestId('event-card').filter({ hasText: text });
async function ready(page: Page) {
  await expect(page.locator('body')).toHaveClass(/ready/);
}
async function add(page: Page, text: string) {
  await memo(page).fill(text);
  await memo(page).press('Enter');
  await expect(card(page, text)).toBeVisible();
}
/** On phones only one pane shows; open the schedule pane when the switch is visible. */
async function showSchedule(page: Page) {
  if (await page.getByTestId('pane-schedule').isVisible()) await page.getByTestId('pane-schedule').click();
}
async function showTasks(page: Page) {
  if (await page.getByTestId('pane-tasks').isVisible()) await page.getByTestId('pane-tasks').click();
}

test('choosing 予定 moves an item out of the task list into the schedule', async ({ page }) => {
  const day = plusDays(1);
  await page.goto('/');
  await ready(page);
  await add(page, '研究室ミーティング');
  await expect(page.getByTestId('count-all')).toHaveText('1');
  await card(page, '研究室ミーティング').getByTestId('task-title').click();
  await page.getByTestId('sheet-kind-event').click();
  await expect(page.getByTestId('sheet-due-toggle')).toHaveCount(0); // no deadline for 予定
  await page.getByTestId('sheet-plan-date').fill(day);
  await page.getByTestId('sheet-plan-start').fill('10:00');
  await page.getByTestId('sheet-plan-end').fill('11:30');
  await page.getByTestId('sheet-done').click();

  await expect(card(page, '研究室ミーティング')).toHaveCount(0);
  await expect(page.getByTestId('count-all')).toHaveText('0');
  await expect(page.getByTestId('pane-schedule').locator('.count')).toHaveText('1');
  await showSchedule(page);
  const ev = eventCard(page, '研究室ミーティング');
  await expect(ev).toContainText('10:00');
  await expect(ev).toContainText('11:30');

  // and back to a task
  await ev.click();
  await page.getByTestId('sheet-status-doing').click();
  await page.getByTestId('sheet-done').click();
  await showTasks(page);
  await expect(card(page, '研究室ミーティング')).toHaveAttribute('data-status', 'doing');
  await expect(eventCard(page, '研究室ミーティング')).toHaveCount(0);
});

test('in the schedule pane, Enter adds all-day 予定 for today; the toast opens its sheet', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('composer-target').click(); // → 予定 (also opens the schedule pane on phones)
  await expect(page.getByTestId('composer-target')).toContainText('予定');
  await memo(page).fill('・歯医者\n・飲み会');
  await memo(page).press('Enter');
  await showSchedule(page);
  await expect(eventCard(page, '歯医者')).toContainText('終日');
  await expect(eventCard(page, '飲み会')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(0);

  await memo(page).fill('美容院');
  await memo(page).press('Enter');
  await page.getByTestId('toast').filter({ hasText: '今日の予定に追加しました' }).getByRole('button', { name: '日時を設定' }).click();
  await expect(page.getByTestId('sheet-title')).toHaveValue('美容院');
  await expect(page.getByTestId('sheet-kind-event')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('sheet-plan-date')).toHaveValue(plusDays(0));
});

test('+ 予定 creates an event; 終日 toggles the time off and on without changing the date', async ({ page }) => {
  const day = plusDays(2);
  await page.goto('/');
  await ready(page);
  await showSchedule(page);
  await expect(page.getByTestId('schedule-empty')).toBeVisible();
  await page.getByTestId('add-event').click();
  await page.getByTestId('sheet-title').fill('学会');
  await page.getByTestId('sheet-plan-date').fill(day);
  await page.getByTestId('sheet-allday').click(); // all-day → timed
  await expect(page.getByTestId('sheet-plan-start')).not.toHaveValue('');
  await page.getByTestId('sheet-allday').click(); // back to all-day
  await expect(page.getByTestId('sheet-plan-start')).toHaveValue('');
  await expect(page.getByTestId('sheet-plan-date')).toHaveValue(day);
  await page.getByTestId('sheet-done').click();
  await expect(eventCard(page, '学会')).toContainText('終日');
});

test('予定 look different from task blocks and deadlines in the calendar', async ({ page }) => {
  const day = plusDays(1);
  await page.addInitScript((day) => {
    const base = { status: 'todo', deleted: false, note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, created_at: 1, updated_at: 1 };
    localStorage.setItem(
      'ft.tasks.v1',
      JSON.stringify([
        { ...base, id: 'e1', title: 'ゼミ', kind: 'event', plan_date: day, plan_start: '13:00', plan_end: '15:00' },
        { ...base, id: 't1', title: '資料づくり', kind: 'task', plan_date: day, plan_start: '10:00', plan_end: '11:00' },
        { ...base, id: 't2', title: '原稿提出', kind: 'task', due_date: day, due_time: '17:00' },
      ]),
    );
  }, day);
  await page.goto(`/calendar?m=${day.slice(0, 7)}-01`);
  const cell = page.locator(`[data-date="${day}"]`);
  await expect(cell.getByTestId('m-event')).toBeVisible();
  await expect(cell.getByTestId('m-plan')).toBeVisible();
  await expect(cell.getByTestId('m-due')).toBeVisible();
  await cell.click();
  const ev = page.getByTestId('block').filter({ hasText: 'ゼミ' });
  const task = page.getByTestId('block').filter({ hasText: '資料づくり' });
  await expect(ev).toHaveAttribute('data-kind', 'event');
  await expect(task).toHaveAttribute('data-kind', 'task');
  const bg = (l: typeof ev) => l.evaluate((el) => getComputedStyle(el).backgroundColor + getComputedStyle(el).backgroundImage);
  expect(await bg(ev)).not.toEqual(await bg(task));
  await expect(ev).toHaveCSS('border-left-style', 'solid');
  await expect(page.getByTestId('deadline').filter({ hasText: '原稿提出' })).toHaveCSS('border-top-style', 'dashed');
});

test('wide screens show both lists side by side; phones show one at a time', async ({ page }, info) => {
  await page.goto('/');
  await ready(page);
  const tasks = page.getByRole('region', { name: 'タスク' });
  const schedule = page.getByRole('region', { name: 'スケジュール' });
  if (info.project.name === 'mobile') {
    await expect(page.getByTestId('pane-tasks')).toBeVisible();
    await expect(tasks).toBeVisible();
    await expect(schedule).toBeHidden();
    await page.getByTestId('pane-schedule').click();
    await expect(schedule).toBeVisible();
    await expect(tasks).toBeHidden();
  } else {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('pane-tasks')).toBeHidden();
    await expect(tasks).toBeVisible();
    await expect(schedule).toBeVisible();
    const a = (await tasks.boundingBox())!;
    const b = (await schedule.boundingBox())!;
    expect(b.x).toBeGreaterThan(a.x + a.width - 1); // schedule sits to the right
  }
});

test('予定 sync with their kind to another device @local', async ({ page, browser }) => {
  const day = plusDays(3);
  const name = `ev-${uid()}`;
  await page.goto(`/auth/dev-login?name=${name}`);
  await ready(page);
  await showSchedule(page);
  await page.getByTestId('add-event').click();
  await page.getByTestId('sheet-title').fill('同期する予定');
  await page.getByTestId('sheet-plan-date').fill(day);
  await page.getByTestId('sheet-done').click();
  await page.waitForTimeout(900);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
  await p2.goto(`/auth/dev-login?name=${name}`);
  await ready(p2);
  await expect(p2.getByTestId('task-card')).toHaveCount(0);
  await showSchedule(p2);
  await expect(eventCard(p2, '同期する予定')).toBeVisible();
  await other.close();
});

test('API rejects an unknown kind @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=kind-${uid()}`);
  const send = (kind: string) =>
    page.request.post('/api/tasks/sync', {
      data: { tasks: [{ id: crypto.randomUUID(), title: 'x', status: 'todo', created_at: 1, updated_at: 1, kind }] },
    });
  expect((await send('meeting')).status()).toBe(400);
  expect((await send('event')).status()).toBe(200);
});
