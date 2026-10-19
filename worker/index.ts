import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { isBulleted, stripBullet } from '../src/lib/bullets';

type Env = {
  DB: D1Database;
  AI: Ai;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "1" enables /auth/dev-login. Only honoured on localhost; never set in production. */
  DEV_LOGIN?: string;
};
type User = { id: string; email: string; name: string | null; picture: string | null };
type Vars = { user: User };

const SESSION_COOKIE = 'ft_sid';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const STATUSES = ['todo', 'doing', 'done'] as const;
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------- helpers ----------
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (s: string) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const isLocalHost = (url: string) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
const isHttps = (url: string) => new URL(url).protocol === 'https:';

async function createSession(c: any, userId: string) {
  const token = randomToken();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Math.floor(Date.now() / 1000) + SESSION_TTL)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

async function upsertUser(db: D1Database, u: User) {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`,
    )
    .bind(u.id, u.email, u.name, u.picture, Date.now())
    .run();
}

// ---------- auth ----------
app.get('/auth/google', async (c) => {
  // Guard against a misconfigured secret (e.g. the client secret pasted into GOOGLE_CLIENT_ID),
  // which would otherwise be leaked in the redirect URL.
  if (!c.env.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com'))
    return c.text('Google OAuth is not configured', 500);
  const state = randomToken(16);
  const verifier = randomToken(32);
  const opts = { httpOnly: true, secure: isHttps(c.req.url), sameSite: 'Lax' as const, path: '/auth', maxAge: 600 };
  setCookie(c, 'ft_oauth_state', state, opts);
  setCookie(c, 'ft_oauth_verifier', verifier, opts);
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL('/auth/callback', c.req.url).toString(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/callback', async (c) => {
  const { code, state } = c.req.query();
  const savedState = getCookie(c, 'ft_oauth_state');
  const verifier = getCookie(c, 'ft_oauth_verifier');
  deleteCookie(c, 'ft_oauth_state', { path: '/auth' });
  deleteCookie(c, 'ft_oauth_verifier', { path: '/auth' });
  if (!code || !state || state !== savedState || !verifier) return c.redirect('/?login=failed');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: new URL('/auth/callback', c.req.url).toString(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) return c.redirect('/?login=failed');
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) return c.redirect('/?login=failed');
  const info = (await infoRes.json()) as { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
  if (!info.email_verified) return c.redirect('/?login=failed');

  const user: User = { id: `google:${info.sub}`, email: info.email, name: info.name ?? null, picture: info.picture ?? null };
  await upsertUser(c.env.DB, user);
  await createSession(c, user.id);
  return c.redirect('/');
});

// Local-only login used by the E2E test suite (Google sign-in cannot be automated).
app.get('/auth/dev-login', async (c) => {
  if (c.env.DEV_LOGIN !== '1' || !isLocalHost(c.req.url)) return c.notFound();
  const name = c.req.query('name') || 'Test User';
  const user: User = { id: `dev:${name}`, email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.test`, name, picture: null };
  await upsertUser(c.env.DB, user);
  await createSession(c, user.id);
  return c.redirect('/');
});

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// ---------- API ----------
app.use('/api/*', async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<User>();
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
});

app.get('/api/me', (c) => c.json(c.get('user')));

app.get('/api/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, status, created_at, updated_at, deleted, note, due_date, due_time, plan_date, plan_start, plan_end, kind
     FROM tasks WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results.map((t: any) => ({ ...t, deleted: !!t.deleted })));
});

type TaskIn = {
  id: string;
  title: string;
  status: string;
  created_at: number;
  updated_at: number;
  deleted?: boolean;
  note?: string;
  due_date?: string | null;
  due_time?: string | null;
  plan_date?: string | null;
  plan_start?: string | null;
  plan_end?: string | null;
  kind?: 'task' | 'event';
};

const isDate = (v: unknown) => v == null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const isTime = (v: unknown) => v == null || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));

// Batch upsert with last-write-wins on updated_at. Lets the local-first client push its queue in one request.
app.post('/api/tasks/sync', async (c) => {
  const body = (await c.req.json()) as { tasks: TaskIn[] };
  const userId = c.get('user').id;
  const tasks = (body.tasks ?? []).slice(0, 500);
  for (const t of tasks) {
    if (typeof t.id !== 'string' || t.id.length > 64) return c.json({ error: 'bad id' }, 400);
    if (typeof t.title !== 'string' || t.title.length > 2000) return c.json({ error: 'bad title' }, 400);
    if (!STATUSES.includes(t.status as any)) return c.json({ error: 'bad status' }, 400);
    if (t.note != null && (typeof t.note !== 'string' || t.note.length > 20000)) return c.json({ error: 'bad note' }, 400);
    if (!isDate(t.due_date) || !isDate(t.plan_date)) return c.json({ error: 'bad date' }, 400);
    if (!isTime(t.due_time) || !isTime(t.plan_start) || !isTime(t.plan_end)) return c.json({ error: 'bad time' }, 400);
    if (t.kind != null && t.kind !== 'task' && t.kind !== 'event') return c.json({ error: 'bad kind' }, 400);
  }
  if (tasks.length) {
    await c.env.DB.batch(
      tasks.map((t) =>
        c.env.DB.prepare(
          `INSERT INTO tasks (id, user_id, title, status, created_at, updated_at, deleted,
             note, due_date, due_time, plan_date, plan_start, plan_end, kind)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status,
             updated_at = excluded.updated_at, deleted = excluded.deleted, note = excluded.note,
             due_date = excluded.due_date, due_time = excluded.due_time,
             plan_date = excluded.plan_date, plan_start = excluded.plan_start, plan_end = excluded.plan_end,
             kind = excluded.kind
           WHERE tasks.user_id = excluded.user_id AND excluded.updated_at > tasks.updated_at`,
        ).bind(
          t.id,
          userId,
          t.title.trim(),
          t.status,
          Math.floor(Number(t.created_at)) || Date.now(),
          Math.floor(Number(t.updated_at)) || Date.now(),
          t.deleted ? 1 : 0,
          t.note ?? '',
          t.due_date ?? null,
          t.due_date ? (t.due_time ?? null) : null,
          t.plan_date ?? null,
          t.plan_date ? (t.plan_start ?? null) : null,
          t.plan_date ? (t.plan_end ?? null) : null,
          t.kind ?? 'task',
        ),
      ),
    );
  }
  return c.json({ ok: true, count: tasks.length });
});

// Workers AI: turn a free-form memo into a list of concrete tasks, picking up deadlines ("金曜までに", "明日17時締切").
// LLMs are unreliable at date arithmetic, so the prompt carries a lookup table of the next three weeks built from the
// user's local date, and every date the model returns is validated before it reaches the client.
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const ymdUTC = (d: Date) => d.toISOString().slice(0, 10);
const shiftDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdUTC(d);
};
const wdOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
/** The first date on/after `from` that falls on weekday `wd` (0 = Sunday). */
const nextWeekday = (from: string, wd: number) => shiftDays(from, (wd - wdOf(from) + 7) % 7);

function calendarTable(today: string) {
  const rel = ['今日', '明日', '明後日'];
  return Array.from({ length: 21 }, (_, i) => {
    const d = shiftDays(today, i);
    return `${d}(${WD[wdOf(d)]})${rel[i] ? ` = ${rel[i]}` : ''}`;
  }).join('\n');
}

type AiTask = { title: string; due_date: string | null; due_time: string | null };

app.post('/api/ai/split', async (c) => {
  const body = (await c.req.json()) as { text?: string; today?: string };
  const memo = (body.text ?? '').trim().slice(0, 4000);
  if (!memo) return c.json({ tasks: [] });
  // the client's local date, so "明日" means the user's tomorrow; fall back to UTC
  const today = isDate(body.today) && body.today ? body.today : ymdUTC(new Date());

  const exTomorrow = shiftDays(today, 1);
  const exFriday = nextWeekday(shiftDays(today, 1), 5);
  const result: any = await c.env.AI.run(AI_MODEL as any, {
    messages: [
      {
        role: 'system',
        content:
          'You turn a user memo into a list of concrete, actionable tasks. ' +
          'Reply in the same language as the memo. Each task title must make sense on its own when read later: ' +
          'include the object and context (never a bare verb like "作成" or "連絡"), but leave dates and times out of the title. ' +
          'Keep each title under 40 characters, with no numbering or bullets, written as natural Japanese with particles ' +
          '(「牛乳を買う」 not 「牛乳買う」, 「部屋を掃除する」 not 「部屋掃除」). ' +
          'Do not invent tasks that are not implied by the memo. ' +
          `If the memo is a list, every list item becomes exactly one task, in the same order; never skip an item. Return at most ${AI_MAX_TASKS} tasks.\n\n` +
          'Deadlines: when the memo says by when (or on which day) a task must be done, set due_date (YYYY-MM-DD) and, ' +
          'if a clock time is given, due_time (HH:MM, 24h). Otherwise set both to null. Never guess a deadline. ' +
          'Look dates up in this table instead of calculating them. A bare weekday like "金曜" means the first matching date ' +
          'after today in the table; "来週X曜" means the X曜 in the following week (Monday-start weeks); "週末" means the first Saturday after today; ' +
          '"朝" = 09:00, "昼" = 12:00, "夕方" = 17:00, "夜" = 20:00, "午後3時" = 15:00.\n\n' +
          `Calendar:\n${calendarTable(today)}`,
      },
      { role: 'user', content: '明日の17時までに部長に見積もりを送って、金曜までに企画書を仕上げる。名刺も補充' },
      {
        role: 'assistant',
        content: JSON.stringify({
          tasks: [
            { title: '部長に見積もりを送る', due_date: exTomorrow, due_time: '17:00' },
            { title: '企画書を仕上げる', due_date: exFriday, due_time: null },
            { title: '名刺を補充する', due_date: null, due_time: null },
          ],
        }),
      },
      { role: 'user', content: memo },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                due_date: { type: ['string', 'null'] },
                due_time: { type: ['string', 'null'] },
              },
              required: ['title', 'due_date', 'due_time'],
            },
          },
        },
        required: ['tasks'],
      },
    },
    max_tokens: 3000, // ~30 tasks with dates
  });

  // Workers AI models answer either as { response } or OpenAI-style { choices: [{ message: { content } }] }
  let parsed: any = result?.response ?? result?.choices?.[0]?.message?.content;
  if (typeof parsed === 'string') {
    parsed = parsed.replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // cut off by max_tokens: keep every task object that did arrive complete
      const objs = parsed.match(/\{[^{}]*"title"[^{}]*\}/g) ?? [];
      parsed = { tasks: objs.flatMap((o: string) => { try { return [JSON.parse(o)]; } catch { return []; } }) };
    }
  }
  const latest = shiftDays(today, 400);
  const aiTasks: AiTask[] = ((parsed?.tasks ?? []) as unknown[])
    .map((t: any): AiTask | null => {
      const raw = typeof t === 'string' ? { title: t } : t;
      if (!raw || typeof raw.title !== 'string') return null;
      const title = stripBullet(raw.title);
      // keep only plausible deadlines: valid format, not in the past, within ~a year
      let due_date = typeof raw.due_date === 'string' && isDate(raw.due_date) ? raw.due_date : null;
      if (due_date && (due_date < today || due_date > latest || ymdUTC(new Date(`${due_date}T00:00:00Z`)) !== due_date)) due_date = null;
      const due_time = due_date && typeof raw.due_time === 'string' && isTime(raw.due_time) ? raw.due_time : null;
      return title ? { title, due_date, due_time } : null;
    })
    .filter((t): t is AiTask => !!t);

  // Safety net for lists: every bullet line must come back as a task. Lines the model skipped
  // are added as-is (marker stripped, no deadline) so nothing is silently lost.
  const { tasks: all, recovered } = coverListItems(memo, aiTasks);
  const tasks = all.slice(0, AI_MAX_TASKS);
  // whatever didn't fit is handed back so the client can put it into the memo box for another pass
  const rest = all.slice(AI_MAX_TASKS).map((t) => t.title);
  return c.json({ tasks, recovered, overflow: rest.length, rest });
});

const AI_MAX_TASKS = 30;

/** Character bigrams of a string with spaces/punctuation removed (works for Japanese without a tokenizer). */
const bigrams = (s: string) => {
  const t = s.replace(/[\s\p{P}\p{S}]/gu, '');
  if (t.length < 2) return new Set(t ? [t] : []);
  return new Set(Array.from({ length: t.length - 1 }, (_, i) => t.slice(i, i + 2)));
};

/**
 * Pair each list item in the memo with the AI task that covers it (one-to-one, best overlap first).
 * Returns tasks in the memo's order, with uncovered items inserted as plain tasks.
 */
function coverListItems(memo: string, aiTasks: AiTask[]): { tasks: (AiTask & { recovered?: boolean })[]; recovered: number } {
  const items = memo.split('\n').filter(isBulleted).map(stripBullet);
  if (items.length < 2) return { tasks: aiTasks, recovered: 0 };

  const ib = items.map(bigrams);
  const tb = aiTasks.map((t) => bigrams(t.title));
  const pairs: { i: number; t: number; score: number }[] = [];
  const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '');
  ib.forEach((a, i) =>
    tb.forEach((b, t) => {
      const short = norm(items[i]);
      // 1–2 character items ("卵", "牛乳") match when the title contains them
      const shared = short.length <= 2 ? (norm(aiTasks[t].title).includes(short) ? 2 : 0) : [...a].filter((g) => b.has(g)).length;
      if (shared >= 2 || (a.size > 0 && shared / a.size >= 0.5)) pairs.push({ i, t, score: shared / Math.max(1, a.size) + shared / 100 });
    }),
  );
  pairs.sort((x, y) => y.score - x.score);
  const itemToTask = new Map<number, number>();
  const usedTasks = new Set<number>();
  for (const p of pairs) {
    if (itemToTask.has(p.i) || usedTasks.has(p.t)) continue;
    itemToTask.set(p.i, p.t);
    usedTasks.add(p.t);
  }

  const out: (AiTask & { recovered?: boolean })[] = [];
  let recovered = 0;
  items.forEach((title, i) => {
    const t = itemToTask.get(i);
    if (t !== undefined) out.push(aiTasks[t]);
    else (out.push({ title, due_date: null, due_time: null, recovered: true }), recovered++);
  });
  // tasks the model produced beyond the list items (e.g. it split one item in two) are kept, after
  aiTasks.forEach((t, i) => usedTasks.has(i) || out.push(t));
  return { tasks: out, recovered };
}

// Google Search Console ownership file (needed to list the domain as an OAuth authorized domain).
// Served by the Worker because static assets would redirect the .html path to an extensionless URL.
const SITE_VERIFICATION = 'googlefa52df59a4a2a0d4.html';
app.get(`/${SITE_VERIFICATION}`, (c) => c.html(`google-site-verification: ${SITE_VERIFICATION}`));

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

export default app;
