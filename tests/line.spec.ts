import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

// LINE bot: signed webhooks, linking a group with a one-time code, 「やること」 / 「今週」 replies, the Monday push.
// The local dev server signs with LINE_CHANNEL_SECRET from .dev.vars and, with no access token, never calls LINE;
// on localhost the webhook answers with what the bot would have said.
const SECRET = 'local-test-line-secret';
const uid = () => Math.random().toString(36).slice(2, 8);
const ymd = (n: number) => new Date(Date.now() + 9 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10); // Japan time

async function hook(request: APIRequestContext, events: object[], secret = SECRET) {
  const body = JSON.stringify({ destination: 'U0', events });
  return request.post('/line/webhook', { data: body, headers: { 'content-type': 'application/json', 'x-line-signature': createHmac('sha256', secret).update(body).digest('base64') } });
}
const say = (group: string, text: string) => ({ type: 'message', replyToken: 'r', source: { type: 'group', groupId: group, userId: 'Uabc' }, message: { type: 'text', text } });
const replies = async (res: Awaited<ReturnType<typeof hook>>) => ((await res.json()) as { replies: { text: string }[] }).replies.map((r) => r.text);

async function signIn(page: Page) {
  await page.goto(`/auth/dev-login?name=line-${uid()}`);
  await expect(page.locator('body')).toHaveClass(/ready/);
  const now = Date.now();
  const ev = { id: crypto.randomUUID(), name: '2026 OBOG総会', start_date: ymd(30), end_date: ymd(30), color: 'orange', created_at: now, updated_at: now };
  const old = { id: crypto.randomUUID(), name: '2025 部同会', start_date: ymd(-300), end_date: ymd(-300), color: 'teal', closed: true, created_at: now, updated_at: now };
  const t = (o: object) => ({ id: crypto.randomUUID(), status: 'todo', created_at: now, updated_at: now, ...o });
  const tasks = [
    t({ title: '案内状の発送', event_id: ev.id, due_date: ymd(2), assignees: ['佐藤'] }),
    t({ title: '会場の予約', event_id: ev.id, due_date: ymd(-3) }),
    t({ title: '来月末の締切', event_id: ev.id, due_date: ymd(45) }),
    t({ title: '終わった作業', event_id: ev.id, due_date: ymd(1), status: 'done' }),
    t({ title: '個人の締切', due_date: ymd(5) }),
    t({ title: '去年の残り', event_id: old.id, due_date: ymd(-299) }),
    t({ title: '幹部読み合わせ', kind: 'event', event_id: ev.id, plan_date: ymd(0), plan_start: '19:00', tag: '幹部読み合わせ' }),
  ];
  expect((await page.request.post('/api/tasks/sync', { data: { events: [ev, old], tasks } })).status()).toBe(200);
}

test.describe('LINE bot @local', () => {
  test('rejects unsigned or wrongly signed webhooks', async ({ request }) => {
    expect((await request.post('/line/webhook', { data: { events: [] } })).status()).toBe(401);
    expect((await hook(request, [say('Cx', 'やること')], 'wrong-secret')).status()).toBe(401);
  });

  test('a group links with a one-time code, then 「やること」 lists overdue and the coming month by event', async ({ page }) => {
    await signIn(page);
    const group = `C${uid()}`;
    // before linking: it says how to link; ordinary talk gets no reply
    expect((await replies(await hook(page.request, [say(group, 'やること')])))[0]).toContain('まだ連携していません');
    expect(await replies(await hook(page.request, [say(group, 'おつかれ〜')]))).toEqual([]);

    const { code } = await (await page.request.post('/api/line/code')).json();
    expect(code).toMatch(/^\d{6}$/);
    // full-width digits and a full-width space work too
    const fw = code.replace(/\d/g, (d: string) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
    expect((await replies(await hook(page.request, [say(group, `連携　${fw}`)])))[0]).toContain('連携しました');
    // a code works once
    expect((await replies(await hook(page.request, [say(`C${uid()}`, `連携 ${code}`)])))[0]).toContain('期限');

    const [text] = await replies(await hook(page.request, [say(group, 'やること')]));
    expect(text).toContain('【2026 OBOG総会】 本番まで30日');
    expect(text).toMatch(/⚠️.*会場の予約/); // overdue
    expect(text).toContain('案内状の発送（佐藤）');
    expect(text).toContain('【その他】');
    expect(text).toContain('個人の締切');
    expect(text.indexOf('2026 OBOG総会')).toBeLessThan(text.indexOf('【その他】'));
    for (const no of ['来月末の締切', '終わった作業', '去年の残り']) expect(text).not.toContain(no);

    const [week] = await replies(await hook(page.request, [say(group, '今週')]));
    expect(week).toContain('今週のまとめ');
    expect(week).toContain('幹部読み合わせ');

    // the app lists the link; 連携解除 in the chat removes it
    const list = await (await page.request.get('/api/line')).json();
    expect(list.links).toHaveLength(1);
    expect(list.links[0]).toMatchObject({ kind: 'group', weekly: true });
    expect((await replies(await hook(page.request, [say(group, '連携解除')])))[0]).toContain('解除');
    expect((await (await page.request.get('/api/line')).json()).links).toHaveLength(0);
  });

  test('the Monday push goes to linked chats that want it', async ({ page }) => {
    await signIn(page);
    const a = `C${uid()}`, b = `C${uid()}`;
    for (const g of [a, b]) {
      const { code } = await (await page.request.post('/api/line/code')).json();
      await hook(page.request, [say(g, `連携 ${code}`)]);
    }
    const links = (await (await page.request.get('/api/line')).json()).links;
    expect((await page.request.patch(`/api/line/links/${links[1].id}`, { data: { weekly: false } })).status()).toBe(200);
    const { sent } = await (await page.request.post('/line/dev-weekly')).json();
    const mine = sent.filter((s: { to: string }) => s.to === a || s.to === b);
    expect(mine).toHaveLength(1);
    expect(mine[0].to).toBe(a);
    expect(mine[0].text).toContain('今週のまとめ');
  });

  test('the LINE連携 screen makes a code and shows the linked chat', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await page.getByTestId('avatar').click();
    await page.getByTestId('line').click();
    const panel = page.getByTestId('nx-line');
    await expect(panel).toBeVisible();
    await page.getByTestId('nx-line-make').click();
    const shown = await page.getByTestId('nx-line-code').locator('span').textContent();
    const code = shown!.replace(/\D/g, '');
    await hook(page.request, [{ ...say(`C${uid()}`, `連携 ${code}`) }]);
    await expect(page.getByTestId('nx-line-link')).toHaveCount(1, { timeout: 8000 }); // the screen notices on its own
    await expect(page.getByTestId('nx-line-code')).toHaveCount(0);
    await page.getByTestId('nx-line-unlink').click();
    await expect(page.getByTestId('nx-line-link')).toHaveCount(0);
  });
});
