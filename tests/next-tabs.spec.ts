import { test, expect, type Page } from '@playwright/test';

// Stage 3 of the new design: 当日の動き, 予定, メモ and the event editor.
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const D = { d30: plus(30), d31: plus(31), d6: plus(6), d13: plus(13), dm5: plus(-5), dm335: plus(-335) };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((p) => {
    if (localStorage.getItem('seeded')) return;
    const now = Date.now();
    const ev = (o: object) => ({ place: '', color: 'orange', note: '', closed: false, roles: [], members: [], tags: [], created_at: now, updated_at: now, deleted: false, ...o });
    localStorage.setItem('ft.events.v1', JSON.stringify([
      ev({ id: 'ev1', name: '2026 OBOG総会', start_date: p.d30, end_date: p.d31, note: '## 連絡事項\n・鍵は学生課\n☐ 提案の担当者を確定',
        members: [{ name: '佐藤', color: 'blue' }, { name: '上田', color: 'pink' }], roles: [{ name: '受付', color: 'pink' }, { name: '設営', color: 'orange' }], tags: ['打ち上げ'] }),
      ev({ id: 'old', name: '2025 OBOG総会', start_date: p.dm335, end_date: p.dm335, closed: true, note: '・受付は2人だと足りない' }),
    ]));
    const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_end_date: null, place: '', items: '', tag: '', assignees: [], roles: [], created_at: now, updated_at: now, event_id: 'ev1' };
    localStorage.setItem('ft.tasks.v1', JSON.stringify([
      { ...base, id: 'm1', title: '会場設営', plan_date: p.d30, plan_start: '11:45', plan_end: '13:00', roles: ['設営'], place: '5号館' },
      { ...base, id: 'm2', title: '受付・荷物受付', plan_date: p.d30, plan_start: '13:30', plan_end: '16:00', roles: ['受付'] },
      { ...base, id: 'm3', title: '本部員集合', plan_date: p.d30, plan_start: '11:30', plan_end: '11:45' },
      { ...base, id: 'm4', title: 'OBOG総会', kind: 'event', plan_date: p.d30, plan_start: '14:00', plan_end: '16:00' },
      { ...base, id: 'm5', title: '2日目の片付け', plan_date: p.d31, plan_start: '10:00', plan_end: '12:00', roles: ['設営'] },
      { ...base, id: 's1', title: 'イベント担当MTG', kind: 'event', plan_date: p.d6, plan_start: '19:00', plan_end: '20:00', tag: 'MTG' },
      { ...base, id: 's2', title: '幹部読み合わせ②', kind: 'event', plan_date: p.d13, tag: '幹部読み合わせ' },
      { ...base, id: 's3', title: '幹部読み合わせ①', kind: 'event', plan_date: p.dm5, tag: '幹部読み合わせ' },
      { ...base, id: 'p1', title: '案内状の発送', due_date: p.d6, assignees: ['佐藤', '上田'] },
    ]));
    localStorage.setItem('ft.hinted', '1');
    localStorage.setItem('seeded', '1');
  }, D);
});
const stored = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem('ft.tasks.v1')!).find((t: { id: string }) => t.id === id), id);
const storedEvent = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem('ft.events.v1')!).find((e: { id: string }) => e.id === id), id);
const rows = (page: Page) => page.getByTestId('nx-day-row');

test.describe('当日の動き', () => {
  test('the day as a table in time order (予定 marked), per day for multi-day events, filter by role', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=day');
    await expect(rows(page)).toHaveText([/11:30.*本部員集合.*全員/, /11:45.*会場設営.*設営.*5号館/, /13:30.*受付・荷物受付/, /14:00.*OBOG総会.*予定/]);
    await page.getByTestId('nx-day-roles').getByRole('button', { name: '受付' }).click();
    await expect(rows(page)).toHaveText([/本部員集合/, /受付・荷物受付/, /OBOG総会/]); // 全員 and 予定 stay
    await page.getByTestId('nx-day-pill').nth(1).click();
    await page.getByTestId('nx-day-roles').getByRole('button', { name: 'すべて' }).click();
    await expect(rows(page)).toHaveText([/2日目の片付け/]);
  });

  test('add a row and edit it in the panel: time, roles, place', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=day');
    await page.getByTestId('nx-day-add').click();
    const panel = page.getByTestId('nx-day-panel');
    await expect(panel).toBeVisible();
    await panel.getByTestId('nx-day-panel-title').fill('マイク確認');
    await panel.getByTestId('nx-day-panel-start').fill('15:00');
    await panel.getByTestId('nx-day-panel-start').dispatchEvent('change');
    await panel.getByTestId('nx-day-panel-role').filter({ hasText: '設営' }).click();
    await panel.getByTestId('nx-day-panel-place').fill('ステージ');
    await panel.getByTestId('nx-day-panel-place').dispatchEvent('change');
    await page.getByTestId('nx-day-panel-close').click();
    await expect(rows(page).filter({ hasText: 'マイク確認' })).toContainText('15:00');
    await expect(rows(page).filter({ hasText: 'マイク確認' })).toContainText('設営');
    await expect(rows(page).filter({ hasText: 'マイク確認' })).toContainText('ステージ');
  });

  test('paste a table from Excel / the 運営マニュアル', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=day');
    await page.getByTestId('nx-day-paste-open').click();
    await page.getByTestId('nx-day-paste').fill('時刻\tやること\t担当\t場所\n9:00-9:30\t集合\t\t正門\n9:30〜10:00\t受付準備\t受付\t5号館入口\t名簿、ペン');
    await expect(page.getByTestId('nx-day-paste-add')).toHaveText('2件追加');
    await page.getByTestId('nx-day-paste-add').click();
    await expect(rows(page).first()).toContainText('09:00');
    await expect(rows(page).filter({ hasText: '受付準備' })).toContainText('名簿、ペン');
    await expect(rows(page).filter({ hasText: '受付準備' })).toContainText('受付');
  });

  test('担当別ボード: role columns, 全員 / 予定 across the width; a block opens the panel', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=day');
    await page.getByTestId('nx-day-board').click();
    await expect(page.getByTestId('nx-dayboard-band')).toHaveCount(2); // 本部員集合 (全員) and OBOG総会 (予定)
    await page.getByTestId('nx-dayboard-block').filter({ hasText: '会場設営' }).click();
    await expect(page.getByTestId('nx-day-panel-title')).toHaveValue('会場設営');
  });
});

test.describe('予定', () => {
  test('upcoming by date with tags (本番 for the event days), filter by tag, past folded', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=sched');
    const r = page.getByTestId('nx-sched-row');
    await expect(r).toHaveText([/イベント担当MTG.*MTG/, /幹部読み合わせ②.*幹部読み合わせ/, /OBOG総会.*本番/]);
    await page.getByTestId('nx-sched-filter').filter({ hasText: 'MTG' }).click();
    await expect(r).toHaveText([/イベント担当MTG/]);
    await page.getByTestId('nx-sched-filter').filter({ hasText: 'すべて' }).click();
    await page.getByTestId('nx-sched-past').click();
    await expect(r.filter({ hasText: '幹部読み合わせ①' })).toBeVisible();
  });

  test('add a 予定, pick a tag, and make a new one', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=sched');
    await page.getByTestId('nx-sched-add').click();
    const panel = page.getByTestId('nx-sched-panel');
    await panel.getByTestId('nx-sched-panel-title').fill('会場下見');
    await panel.getByTestId('nx-sched-panel-tag').filter({ hasText: '読み合わせ' }).first().click();
    await panel.getByTestId('nx-sched-panel-make').click();
    await panel.getByTestId('nx-sched-panel-newtag').fill('下見');
    await panel.getByTestId('nx-sched-panel-newtag').press('Enter');
    await page.getByTestId('nx-sched-panel-close').click();
    await expect(page.getByTestId('nx-sched-row').filter({ hasText: '会場下見' }).getByTestId('nx-sched-tag')).toHaveText('下見');
    expect((await storedEvent(page, 'ev1')).tags).toContain('下見');
  });
});

test.describe('メモ', () => {
  test('shown formatted; checkboxes toggle; edits save themselves', async ({ page }) => {
    await page.goto('/next/events/ev1?tab=memo');
    const view = page.getByTestId('nx-memo-view');
    await expect(view.locator('h3')).toHaveText('連絡事項');
    await view.getByTestId('nx-memo-check').check();
    await expect.poll(async () => (await storedEvent(page, 'ev1')).note).toContain('☑ 提案の担当者を確定');
    await page.getByTestId('nx-memo-edit').click();
    await page.getByTestId('nx-memo-text').press('End');
    await page.getByTestId('nx-memo-text').pressSequentially('\n・二次会は11/14までに人数確定');
    await expect.poll(async () => (await storedEvent(page, 'ev1')).note, { timeout: 5000 }).toContain('二次会は11/14までに人数確定');
    await page.getByTestId('nx-memo-done').click();
    await expect(view).toContainText('二次会は11/14までに人数確定');
  });

  test("last year's notes of the same event are shown beside it", async ({ page }) => {
    await page.goto('/next/events/ev1?tab=memo');
    await expect(page.getByTestId('nx-memo-prev')).toContainText('2025 OBOG総会');
    await expect(page.getByTestId('nx-memo-prev')).toContainText('受付は2人だと足りない');
  });
});

test.describe('イベントの編集', () => {
  test('create an event from the sidebar; it opens', async ({ page }) => {
    await page.goto('/next');
    await page.getByTestId('nx-new-event').click();
    const ed = page.getByTestId('nx-editor');
    await ed.getByTestId('nx-editor-name').fill('新人戦');
    await ed.getByTestId('nx-editor-start').fill(plus(20));
    await ed.getByTestId('nx-editor-add-member').click();
    await ed.getByTestId('nx-editor-member').last().locator('input').fill('鈴木');
    await ed.getByTestId('nx-editor-add-role').click();
    await ed.getByTestId('nx-editor-role').last().locator('input').fill('審判補助');
    await ed.getByTestId('nx-editor-save').click();
    await expect(page.getByTestId('nx-event-title')).toHaveText('新人戦');
    await expect(page.getByTestId('nx-event-head')).toContainText('鈴木');
    await expect(page.getByTestId('nx-event').filter({ hasText: '新人戦' })).toBeVisible();
  });

  test('renaming or removing a person carries over to their tasks', async ({ page }) => {
    await page.goto('/next/events/ev1');
    await page.getByTestId('nx-event-edit').click();
    const ed = page.getByTestId('nx-editor');
    await ed.getByTestId('nx-editor-member').nth(0).locator('input').fill('佐藤(陽)');
    await ed.getByTestId('nx-editor-member').nth(1).getByRole('button', { name: '外す' }).click(); // 上田
    await ed.getByTestId('nx-editor-save').click();
    await expect(ed).toHaveCount(0);
    await expect.poll(async () => (await stored(page, 'p1')).assignees).toEqual(['佐藤(陽)']);
    expect((await storedEvent(page, 'ev1')).members.map((m: { name: string }) => m.name)).toEqual(['佐藤(陽)']);
  });

  test('close and reopen, delete with undo', async ({ page }) => {
    await page.goto('/next/events/ev1');
    await page.getByTestId('nx-event-edit').click();
    await page.getByTestId('nx-editor-close').click();
    await expect(page.getByTestId('nx-event').filter({ hasText: '2026 OBOG総会' })).toHaveCount(0); // finished events leave the list
    await page.getByTestId('nx-event-edit').click();
    await page.getByTestId('nx-editor-reopen').click();
    await expect(page.getByTestId('nx-event').filter({ hasText: '2026 OBOG総会' })).toBeVisible();
    await page.getByTestId('nx-event-edit').click();
    await page.getByTestId('nx-editor-delete').click();
    await expect(page).toHaveURL(/\/next$/);
    await page.getByTestId('nx-toast').filter({ hasText: '削除' }).getByRole('button', { name: '元に戻す' }).click();
    await expect(page.getByTestId('nx-event').filter({ hasText: '2026 OBOG総会' })).toBeVisible();
  });
});
