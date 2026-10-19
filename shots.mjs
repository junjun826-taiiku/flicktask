// Temporary: screenshots for visual review. Not committed.
import { chromium, devices } from '@playwright/test';

const out = process.argv[2];
const browser = await chromium.launch();
const seed = () => {
  if (localStorage.getItem('seeded')) return;
  const p = (n) => String(n).padStart(2, '0');
  const ymd = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  const d = new Date();
  const t = ymd(d);
  const t1 = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  const t3 = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3));
  const base = { status: 'todo', kind: 'task', deleted: false, note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null };
  let n = Date.now();
  const mk = (o) => ({ ...base, id: crypto.randomUUID(), created_at: n--, updated_at: n, ...o });
  localStorage.setItem('ft.tasks.v1', JSON.stringify([
    mk({ title: 'RLT定例の資料づくり', plan_date: t, plan_start: '12:00', plan_end: '13:30' }),
    mk({ title: '講演の原稿を提出', due_date: t, due_time: '14:30' }),
    mk({ title: '経費精算', status: 'doing' }),
    mk({ title: '修士ゼミ', kind: 'event', plan_date: t, plan_start: '13:00', plan_end: '15:00', note: '3号館 401' }),
    mk({ title: '卒研ゼミ', kind: 'event', plan_date: t, plan_start: '15:00', plan_end: '17:00' }),
    mk({ title: '会議NG', kind: 'event', plan_date: t1 }),
    mk({ title: '東京都立産業技術研究センター 講演', kind: 'event', plan_date: t3, plan_start: '14:00', plan_end: '16:00' }),
  ]));
  localStorage.setItem('ft.hinted', '1');
  localStorage.setItem('seeded', '1');
};
const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

for (const [name, opts] of [['phone', devices['iPhone 13']], ['wide', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.addInitScript(seed);
  await page.goto('http://localhost:5173/');
  await page.waitForSelector('body.ready');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-1-home.png` });
  if (name === 'phone') {
    await page.getByTestId('pane-schedule').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-2-schedule.png` });
    await page.getByTestId('event-card').first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-3-sheet.png` });
    await page.keyboard.press('Escape');
    await page.goto(`http://localhost:5173/calendar/${today}`);
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('[data-testid=timeline]').scrollTo({ top: 11 * 56 }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-4-day.png` });
  }
  await ctx.close();
}
await browser.close();
