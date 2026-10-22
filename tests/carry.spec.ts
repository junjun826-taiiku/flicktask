import { test, expect, type Page } from '@playwright/test';

// 引継ぎ: 過去資料 by 年度 in the sidebar, and a new event started from a past one.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    const now = Date.now();
    const ev = (o: object) => ({ place: '', note: '', closed: true, roles: [], members: [], tags: [], created_at: now, updated_at: now, deleted: false, ...o });
    localStorage.setItem('ft.events.v1', JSON.stringify([
      ev({ id: 'obog25', name: '2025 OBOG総会', start_date: '2025-11-22', end_date: '2025-11-23', color: 'orange', place: '5号館',
        members: [{ name: '佐藤', color: 'blue' }], roles: [{ name: '受付', color: 'pink' }], tags: ['打ち上げ'] }),
      ev({ id: 'winter', name: '2025 冬期研修会', start_date: '2026-02-14', end_date: '2026-02-14', color: 'violet' }),
      ev({ id: 'bu24', name: '2024 部同会', start_date: '2024-12-05', end_date: '2024-12-05', color: 'teal' }),
    ]));
    const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, place: '', items: '', tag: '', assignees: [], roles: [], created_at: now, updated_at: now, event_id: 'obog25' };
    localStorage.setItem('ft.tasks.v1', JSON.stringify([
      { ...base, id: 'p1', title: '案内状の発送', status: 'done', due_date: '2025-10-01', assignees: ['佐藤'], note: '往復はがきで' },
      { ...base, id: 'p2', title: '会場の予約', status: 'doing', due_date: '2025-09-01' },
      { ...base, id: 'p3', title: '去年だけの作業', due_date: '2025-10-10' },
      { ...base, id: 'm1', title: '本部員集合', plan_date: '2025-11-22', plan_start: '11:30', plan_end: '11:45' },
      { ...base, id: 'm2', title: '受付', plan_date: '2025-11-22', plan_start: '13:00', plan_end: '16:00', roles: ['受付'], place: '入口', items: '名簿' },
      { ...base, id: 'm3', title: '2日目の片付け', plan_date: '2025-11-23', plan_start: '10:00', plan_end: '12:00' },
      { ...base, id: 's1', title: 'イベント担当MTG', kind: 'event', plan_date: '2025-10-15', plan_start: '19:00', tag: 'MTG' },
    ]));
    localStorage.setItem('ft.hinted', '1');
    localStorage.setItem('seeded', '1');
  });
});
const tasksOf = (page: Page, eventId: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem('ft.tasks.v1')!).filter((t: { event_id: string; deleted: boolean }) => t.event_id === id && !t.deleted), eventId);

test('過去資料: finished events sit under their 年度 (April to March), newest open', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nx-timeline')).toBeVisible();
  const head = page.getByTestId('nx-finished');
  await expect(head).toContainText('過去資料');
  await expect(head).toContainText('3');
  await head.click();
  const years = page.getByTestId('nx-past-year');
  await expect(years).toHaveCount(2);
  await expect(years.nth(0)).toContainText('2025年度'); // 2025-11 and 2026-02
  await expect(years.nth(0)).toContainText('2');
  await expect(years.nth(1)).toContainText('2024年度');
  const listed = page.getByTestId('nx-finished-event');
  await expect(listed).toHaveCount(2); // only the newest 年度 is open
  await expect(listed.nth(0)).toContainText('2025 冬期研修会');
  await years.nth(1).click();
  await expect(listed).toHaveCount(3);
  // a finished event's leftover tasks (p3 is still 未着手, past its deadline) don't come back on the home screen
  await expect(page.getByTestId('nx-week')).not.toContainText('去年だけの作業');
  await listed.filter({ hasText: '2024 部同会' }).click();
  await expect(page).toHaveURL(/\/events\/bu24$/);
});

test('a new event made from last year carries 準備 tasks fresh and 当日の動き on the same days', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nx-timeline')).toBeVisible();
  await page.getByTestId((await page.getByTestId('nx-new-event').isVisible()) ? 'nx-new-event' : 'nx-new-event-phone').click();
  await page.getByTestId('nx-carry-from').selectOption('obog25');
  await expect(page.getByTestId('nx-editor-name')).toHaveValue('2026 OBOG総会');
  await expect(page.getByTestId('nx-editor-place')).toHaveValue('5号館');
  await expect(page.getByTestId('nx-editor-role')).toHaveCount(1);
  await expect(page.getByTestId('nx-editor-member')).toHaveCount(0); // people change every year
  const prep = page.getByTestId('nx-carry-prep');
  await expect(prep).toContainText('3/3件');
  await expect(page.getByTestId('nx-carry-moves')).toContainText('3/3件');
  await expect(page.getByTestId('nx-carry')).not.toContainText('イベント担当MTG'); // 予定 stay behind
  await prep.getByText('去年だけの作業').click();
  await expect(prep).toContainText('2/3件');
  await page.getByTestId('nx-editor-start').fill('2026-11-21');
  await page.getByTestId('nx-editor-end').fill('2026-11-22');
  await page.getByTestId('nx-editor-save').click();
  await expect(page.getByTestId('nx-toast').filter({ hasText: '5件を引継ぎ' })).toBeVisible();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  const got = await tasksOf(page, id);
  expect(got).toHaveLength(5);
  const by = (t: string) => got.find((x: { title: string }) => x.title === t);
  expect(by('案内状の発送')).toMatchObject({ status: 'todo', due_date: null, assignees: [], note: '往復はがきで' });
  expect(by('会場の予約')).toMatchObject({ status: 'todo', due_date: null });
  expect(by('去年だけの作業')).toBeUndefined();
  expect(by('受付')).toMatchObject({ plan_date: '2026-11-21', plan_start: '13:00', plan_end: '16:00', roles: ['受付'], place: '入口', items: '名簿' });
  expect(by('2日目の片付け')).toMatchObject({ plan_date: '2026-11-22', plan_start: '10:00' });
  expect(got.some((x: { kind: string }) => x.kind === 'event')).toBe(false);
  const ev = await page.evaluate((id) => JSON.parse(localStorage.getItem('ft.events.v1')!).find((e: { id: string }) => e.id === id), id);
  expect(ev).toMatchObject({ name: '2026 OBOG総会', members: [], tags: ['打ち上げ'], closed: false });

  // the copies show on the 準備 board; last year's own tasks are left as they were
  await expect(page.getByTestId('nx-card').filter({ hasText: '案内状の発送' })).toHaveCount(1);
  const old = await tasksOf(page, 'obog25');
  expect(old.find((x: { id: string }) => x.id === 'p1')).toMatchObject({ status: 'done', due_date: '2025-10-01', assignees: ['佐藤'] });
  expect(old.filter((x: { kind: string }) => x.kind === 'task')).toHaveLength(6);
});
