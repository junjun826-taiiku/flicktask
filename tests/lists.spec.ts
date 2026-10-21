import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ft.hinted', '1'));
});
const memo = (page: Page) => page.locator('#boot-memo');
const titles = (page: Page) => page.getByTestId('task-title').allTextContents();
const uid = () => Math.random().toString(36).slice(2, 8);
async function ready(page: Page) {
  await expect(page.locator('body')).toHaveClass(/ready/);
}

test('Enter on a bulleted list: one task per line, markers removed, order kept', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await memo(page).fill(['・牛乳', '- 卵', '1. 議事録', '（2）返信', '① 電話', '- [ ] 掃除', '-5度対策', '10:00 会議'].join('\n'));
  await page.getByTestId('add-button').click();
  await expect(page.getByTestId('task-card')).toHaveCount(8);
  expect(await titles(page)).toEqual(['牛乳', '卵', '議事録', '返信', '電話', '掃除', '-5度対策', '10:00 会議']);
});

test('a multi-line memo submitted before the app loads becomes separate tasks', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/src\/main\.ts|\/assets\/index-.*\.js/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await memo(page).waitFor();
  await page.waitForFunction(() => (window as any).__ftBootReady); // the pre-load Enter handler is attached
  await memo(page).fill('・はやい1\n・はやい2');
  await memo(page).press('Enter');
  release();
  await ready(page);
  await expect(page.getByTestId('task-card')).toHaveCount(2);
  expect(await titles(page)).toEqual(['はやい1', 'はやい2']);
});

test('AI notices: recovered items are flagged, overflow goes back into the memo @local', async ({ page }) => {
  const rest = Array.from({ length: 3 }, (_, i) => `残り${i + 1}`);
  await page.route('**/api/ai/split', (route) =>
    route.fulfill({
      json: {
        tasks: [
          { title: 'AIが作った', due_date: null, due_time: null },
          { title: '拾い直した', due_date: null, due_time: null, recovered: true },
        ],
        recovered: 1,
        overflow: 3,
        rest,
      },
    }),
  );
  await page.goto(`/auth/dev-login?name=notice-${uid()}`);
  await ready(page);
  await memo(page).fill('・いろいろ\n・たくさん');
  await page.getByTestId('ai-button').click();
  await expect(page.getByTestId('ai-recovered')).toContainText('1件');
  await expect(page.getByTestId('ai-overflow')).toContainText('残り3件');
  await page.getByTestId('ai-accept').click();
  await expect(page.getByTestId('task-card')).toHaveCount(2);
  await expect(memo(page)).toHaveValue('・残り1\n・残り2\n・残り3');
  await expect(page.getByTestId('toast').filter({ hasText: '残り3件をメモ欄に戻しました' })).toBeVisible();
});

test('Workers AI returns every item of a 12-line bulleted list @local', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/auth/dev-login?name=list12-${uid()}`);
  await ready(page);
  const items = ['・金曜までに学会のスライド作成', '・明日17時締切 経費精算', '- 牛乳', '- 卵', '1. 来週水曜 研究室ミーティングの議事録', '2. 指導教員にメール返信', '・論文サーベイ', '・プリンタのトナー注文', '・週末 部屋の掃除', '・図書館の本を返す', '・ジムに行く', '・母に電話'];
  await memo(page).fill(items.join('\n'));
  await page.getByTestId('ai-button').click();
  const panel = page.getByTestId('ai-suggestions');
  await expect(panel).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('ai-accept')).toHaveText('12件を追加');
  const chips = (await panel.locator('button.chip').allTextContents()).join(' ');
  for (const word of ['スライド', '経費', '牛乳', '卵', '議事録', '指導教員', 'サーベイ', 'トナー', '掃除', '図書館', 'ジム', '母']) expect(chips).toContain(word);
  await page.getByTestId('ai-accept').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
});
