import { test, expect } from '@playwright/test';

// Server rules and Workers AI, independent of the screens.
const uid = () => Math.random().toString(36).slice(2, 8);
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const task = (o: object = {}) => ({ id: crypto.randomUUID(), title: 'x', status: 'todo', created_at: 1, updated_at: 1, ...o });

test('API rejects unauthenticated requests', async ({ request }) => {
  expect((await request.get('/api/tasks')).status()).toBe(401);
  expect((await request.post('/api/ai/split', { data: { text: 'x' } })).status()).toBe(401);
});

test('privacy policy and terms pages are served and linked from the app', async ({ page }) => {
  for (const [path, heading] of [['/privacy', 'プライバシーポリシー'], ['/terms', '利用規約']]) {
    const res = await page.goto(path);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
  await page.goto('/');
  await expect(page.getByTestId('legal-links').getByRole('link', { name: 'プライバシーポリシー' })).toBeVisible();
});

test('API validates dates, times, ranges and kinds @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=api-${uid()}`);
  const send = (o: object) => page.request.post('/api/tasks/sync', { data: { tasks: [task(o)] } });
  expect((await send({ due_date: '2026/10/19' })).status()).toBe(400);
  expect((await send({ plan_date: '2026-10-19', plan_start: '25:00' })).status()).toBe(400);
  expect((await send({ due_date: '2026-10-19', due_time: '09:30' })).status()).toBe(200);
  expect((await send({ kind: 'event', plan_date: '2026-10-22', plan_end_date: '2026-10-21' })).status()).toBe(400);
  expect((await send({ kind: 'event', plan_end_date: '2026-10-21' })).status()).toBe(400);
  expect((await send({ kind: 'event', plan_date: '2026-10-21', plan_end_date: '2026-10-22' })).status()).toBe(200);
  expect((await send({ kind: 'meeting' })).status()).toBe(400);
});

test('API validates events @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=ev-api-${uid()}`);
  const send = (o: object) =>
    page.request.post('/api/tasks/sync', { data: { events: [{ id: crypto.randomUUID(), name: '大会', start_date: '2026-10-31', end_date: '2026-11-01', created_at: 1, updated_at: 1, ...o }] } });
  expect((await send({ end_date: '2026-10-30' })).status()).toBe(400);
  expect((await send({ name: ' ' })).status()).toBe(400);
  expect((await send({ color: 'chartreuse' })).status()).toBe(400);
  expect((await send({ roles: [{ name: '受付', color: 'blue' }] })).status()).toBe(200);
});

test('tasks are private to each account @local', async ({ page, browser }) => {
  await page.goto(`/auth/dev-login?name=priv-${uid()}`);
  expect((await page.request.post('/api/tasks/sync', { data: { tasks: [task({ title: '秘密のタスク', updated_at: Date.now() })] } })).ok()).toBeTruthy();
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(`/auth/dev-login?name=priv-${uid()}`);
  const got = await (await p2.request.get('/api/tasks/changes?from=2026-01-01')).json();
  expect(JSON.stringify(got.tasks)).not.toContain('秘密のタスク');
  await other.close();
});

test('logout clears local data and shows login again @local', async ({ page }) => {
  await page.goto(`/auth/dev-login?name=out-${uid()}`);
  await page.goto('/events/other');
  await page.getByTestId('nx-add').fill('ログアウト前');
  await page.getByTestId('nx-add').press('Enter');
  await expect(page.getByTestId('nx-card').filter({ hasText: 'ログアウト前' })).toBeVisible();
  await page.getByTestId('avatar').click();
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login')).toBeVisible();
  await page.goto('/events/other');
  await expect(page.getByTestId('nx-card').filter({ hasText: 'ログアウト前' })).toHaveCount(0);
  expect((await page.request.get('/api/me')).status()).toBe(401);
});

test('Workers AI splits a memo into tasks, with deadlines, from the add bar @local', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/auth/dev-login?name=ai-${uid()}`);
  await page.goto('/events/other');
  await page.getByTestId('nx-add').fill('明日の17時までに部長に見積もりを送る。名刺も補充する。週末に段ボールを買う');
  await page.getByTestId('nx-ai').click();
  const panel = page.getByTestId('nx-ai-suggestions');
  await expect(panel).toBeVisible({ timeout: 90_000 });
  expect(await panel.locator('label').count()).toBeGreaterThanOrEqual(2);
  await expect(panel).toContainText('17:00');
  const n = await panel.locator('label').count();
  await panel.locator('input[type=checkbox]').first().uncheck();
  await expect(page.getByTestId('nx-ai-accept')).toHaveText(`${n - 1}件追加`);
  await page.getByTestId('nx-ai-accept').click();
  await expect(page.getByTestId('nx-card')).toHaveCount(n - 1);
});

test('AI suggestions keep the deadlines they found @local', async ({ page }) => {
  const tomorrow = plus(1);
  await page.route('**/api/ai/split', (route) =>
    route.fulfill({ json: { tasks: [{ title: '見積もりを送る', due_date: tomorrow, due_time: '17:00' }, { title: '牛乳を買う', due_date: null, due_time: null }] } }),
  );
  await page.goto(`/auth/dev-login?name=aimock-${uid()}`);
  await page.goto('/events/other');
  await page.getByTestId('nx-add').fill('明日17時までに見積もり、牛乳');
  await page.getByTestId('nx-ai').click();
  await page.getByTestId('nx-ai-accept').click();
  await expect(page.getByTestId('nx-card').filter({ hasText: '見積もりを送る' })).toContainText('明日');
  await expect(page.getByTestId('nx-card').filter({ hasText: '牛乳を買う' })).toContainText('日付なし');
});
