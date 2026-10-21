import { test, expect, type Page } from '@playwright/test';

// The new event screen (/next/events/:id), 準備 tab.
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (p) => {
      if (localStorage.getItem('seeded')) return;
      const now = Date.now();
      const members = [{ name: '佐藤', color: 'blue' }, { name: '上田', color: 'pink' }, { name: '八木', color: 'green' }];
      localStorage.setItem('ft.events.v1', JSON.stringify([
        { id: 'ev1', name: '2026 OBOG総会', start_date: p.d30, end_date: p.d30, place: '5号館', color: 'orange', note: '', closed: false, roles: [], members, tags: [], created_at: now, updated_at: now, deleted: false },
      ]));
      const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, roles: [], place: '', items: '', tag: '', created_at: now, updated_at: now, event_id: 'ev1' };
      localStorage.setItem('ft.tasks.v1', JSON.stringify([
        { ...base, id: 'a', title: 'OB名簿の更新', due_date: p.dm2, assignees: ['佐藤'] },
        { ...base, id: 'b', title: '案内状の発送', due_date: p.d9, assignees: ['上田', '八木'] },
        { ...base, id: 'c', title: '会場予約', status: 'doing', due_date: p.d6, assignees: ['佐藤'] },
        { ...base, id: 'd', title: '日程の決定', status: 'done', due_date: p.dm9, assignees: [] },
        { ...base, id: 'e', title: '備品リスト', due_date: null, assignees: [] },
        { ...base, id: 'f', title: '当日の受付', plan_date: p.d30, plan_start: '13:00', plan_end: '14:00', assignees: [] }, // a day-of move: not in 準備
        { ...base, id: 'g', title: 'イベント外のタスク', event_id: null, due_date: null, assignees: [] },
      ]));
      localStorage.setItem('ft.hinted', '1');
      localStorage.setItem('seeded', '1');
    },
    { dm9: plus(-9), dm2: plus(-2), d6: plus(6), d9: plus(9), d30: plus(30) },
  );
});
const col = (page: Page, s: string) => page.getByTestId(`nx-col-${s}`);
const card = (page: Page, t: string) => page.getByTestId('nx-card').filter({ hasText: t });
const stored = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem('ft.tasks.v1')!).find((t: { id: string }) => t.id === id), id);
async function showCol(page: Page, s: string) {
  // phones show one column at a time
  await expect(page.getByTestId('nx-prep')).toBeVisible();
  if (await page.getByTestId(`nx-col-pick-${s}`).isVisible()) await page.getByTestId(`nx-col-pick-${s}`).click();
}

test('the sidebar opens an event: header, countdown, progress, and 準備 in three status columns', async ({ page }) => {
  await page.goto('/next');
  await page.getByTestId('nx-event').filter({ hasText: '2026 OBOG総会' }).click();
  await expect(page).toHaveURL(/\/next\/events\/ev1$/);
  const head = page.getByTestId('nx-event-head');
  await expect(head).toContainText('30');
  await expect(head).toContainText('1/5'); // done / all 準備 (the day-of move is not counted)
  await expect(head).toContainText('佐藤・上田・八木');
  await expect(head.getByTestId('nx-strip-due').first()).toBeVisible();
  await expect(col(page, 'todo').getByTestId('nx-card')).toHaveText([/OB名簿の更新/, /案内状の発送/, /備品リスト/]); // by deadline, undated last
  await expect(page.getByTestId('nx-card').filter({ hasText: '当日の受付' })).toHaveCount(0);
  await expect(card(page, 'OB名簿の更新')).toContainText('期限切れ');
});

test('Enter adds one task per line into this event', async ({ page }) => {
  await page.goto('/next/events/ev1');
  await page.getByTestId('nx-add').fill('・弁当の発注\n・名札の作成');
  await page.getByTestId('nx-add').press('Enter');
  await expect(card(page, '弁当の発注')).toBeVisible();
  await expect(card(page, '名札の作成')).toBeVisible();
  await expect(page.getByTestId('nx-add')).toHaveValue('');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('ft.tasks.v1')!).find((x: { title: string }) => x.title === '弁当の発注'));
  expect(t.event_id).toBe('ev1');
});

test('dragging a card to another column changes its status @desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'drag and drop is the PC gesture');
  await page.goto('/next/events/ev1');
  await card(page, '案内状の発送').dragTo(col(page, 'doing'));
  await expect(col(page, 'doing').getByTestId('nx-card').filter({ hasText: '案内状の発送' })).toBeVisible();
  expect((await stored(page, 'b')).status).toBe('doing');
});

test('keyboard: arrow keys move a focused card, done shows an undo toast', async ({ page }) => {
  await page.goto('/next/events/ev1');
  await showCol(page, 'doing');
  await card(page, '会場予約').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('nx-toast').filter({ hasText: '完了' })).toBeVisible();
  expect((await stored(page, 'c')).status).toBe('done');
  await page.getByTestId('nx-toast').getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await stored(page, 'c')).status).toBe('doing');
});

test('the side panel edits status, deadline, people and memo; delete can be undone', async ({ page }) => {
  await page.goto('/next/events/ev1');
  await card(page, '備品リスト').click();
  const panel = page.getByTestId('nx-panel');
  await expect(panel).toBeVisible();
  await panel.getByTestId('nx-panel-status-doing').click();
  await panel.getByTestId('nx-panel-due').fill(plus(12));
  await panel.getByTestId('nx-panel-due').dispatchEvent('change');
  await panel.getByTestId('nx-panel-member').filter({ hasText: '八木' }).click();
  await panel.getByTestId('nx-panel-note').fill('倉庫の鍵は学生課');
  await panel.getByTestId('nx-panel-title').click(); // blur the memo → saved
  await expect.poll(async () => (await stored(page, 'e')).note).toBe('倉庫の鍵は学生課');
  const t = await stored(page, 'e');
  expect(t.status).toBe('doing');
  expect(t.due_date).toBe(plus(12));
  expect(t.assignees).toEqual(['八木']);

  await panel.getByTestId('nx-panel-delete').click();
  await expect(panel).toHaveCount(0);
  await showCol(page, 'doing');
  await expect(card(page, '備品リスト')).toHaveCount(0);
  await page.getByTestId('nx-toast').filter({ hasText: '削除' }).getByRole('button', { name: '元に戻す' }).click();
  await expect(card(page, '備品リスト')).toBeVisible();
});

test('filter by person, and 担当なし', async ({ page }) => {
  await page.goto('/next/events/ev1');
  const who = page.getByTestId('nx-who');
  await who.getByRole('button', { name: /佐藤/ }).click();
  await showCol(page, 'todo');
  await expect(col(page, 'todo').getByTestId('nx-card')).toHaveText([/OB名簿の更新/]);
  await who.getByRole('button', { name: '担当なし' }).click();
  await expect(col(page, 'todo').getByTestId('nx-card')).toHaveText([/備品リスト/]);
  await who.getByRole('button', { name: '全員' }).click();
  await expect(col(page, 'todo').getByTestId('nx-card')).toHaveCount(3);
});

test('担当別タイムライン: a lane per person, undated tasks below; the view is remembered', async ({ page }) => {
  await page.goto('/next/events/ev1');
  await page.getByTestId('nx-view-timeline').click();
  const tl = page.getByTestId('nx-member-timeline');
  await expect(tl.getByTestId('nx-lane')).toHaveCount(4); // 3 people + 担当なし
  await expect(tl.getByTestId('nx-lane').filter({ hasText: '上田' }).getByTestId('nx-pill')).toHaveText([/案内状の発送/]);
  await expect(tl.getByTestId('nx-lane').filter({ hasText: '八木' }).getByTestId('nx-pill')).toHaveText([/案内状の発送/]); // shared task on both lanes
  await expect(page.getByTestId('nx-undated')).toContainText('備品リスト');
  await tl.getByTestId('nx-pill').filter({ hasText: 'OB名簿の更新' }).click();
  await expect(page.getByTestId('nx-panel-title')).toHaveValue('OB名簿の更新');
  await page.getByTestId('nx-panel-close').click();
  await page.reload();
  await expect(page.getByTestId('nx-member-timeline')).toBeVisible();
});

test('「その他」 holds tasks with no event; tasks added there have no event', async ({ page }) => {
  await page.goto('/next/events/other');
  await expect(page.getByTestId('nx-event-title')).toHaveText('その他');
  await expect(card(page, 'イベント外のタスク')).toBeVisible();
  await expect(page.getByTestId('nx-view-timeline')).toHaveCount(0);
  await page.getByTestId('nx-add').fill('個人の用事');
  await page.getByTestId('nx-add').press('Enter');
  await expect(card(page, '個人の用事')).toBeVisible();
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('ft.tasks.v1')!).find((x: { title: string }) => x.title === '個人の用事'));
  expect(t.event_id).toBeNull();
});

test('the other tabs point to the current screens until stage 3', async ({ page }) => {
  await page.goto('/next/events/ev1');
  await page.getByTestId('nx-tab-day').click();
  await expect(page).toHaveURL(/tab=day/);
  await expect(page.getByTestId('nx-tab-wip')).toBeVisible();
  await page.getByTestId('nx-tab-prep').click();
  await expect(page.getByTestId('nx-prep')).toBeVisible();
});
