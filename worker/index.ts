import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { isBulleted, stripBullet } from '../src/lib/bullets';
import type { UserHub } from './hub';
export { UserHub } from './hub';

type Env = {
  DB: D1Database;
  AI: Ai;
  HUB: DurableObjectNamespace<UserHub>;
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

/** The account's real-time hub (one Durable Object per user). */
const hub = (c: { env: Env; get: (k: 'user') => User }) => c.env.HUB.get(c.env.HUB.idFromName(c.get('user').id));

// WebSocket for "your data changed" pushes. Auth is the session cookie checked by the /api/* middleware.
app.get('/api/live', (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
  return hub(c).fetch(c.req.raw);
});

const TASK_COLS =
  'id, title, status, created_at, updated_at, deleted, note, due_date, due_time, plan_date, plan_start, plan_end, kind, plan_end_date, event_id, roles, place, items';
const EVENT_COLS = 'id, name, start_date, end_date, place, color, roles, note, closed, created_at, updated_at, deleted';
const parseJson = (s: unknown) => {
  try {
    return typeof s === 'string' ? JSON.parse(s) : [];
  } catch {
    return [];
  }
};
const rows = (results: any[]) => results.map((t) => ({ ...t, deleted: !!t.deleted, roles: parseJson(t.roles) }));
const eventRows = (results: any[]) =>
  results.map((e) => ({ ...e, deleted: !!e.deleted, closed: !!e.closed, roles: parseJson(e.roles) }));
/** SQL for "tasks belonging to an event that is still running" — always part of a device's working set. */
const ACTIVE_EVENT_TASK = `event_id IN (SELECT id FROM events WHERE user_id = tasks.user_id AND closed = 0 AND deleted = 0)`;

/** Deleted rows are purged from the server this long after deletion; older cursors must resync in full. */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Cursor overlap: rows written around the moment of a read are fetched again rather than missed. */
const CURSOR_SKEW_MS = 5000;

// Legacy: the whole list. Kept so a tab still running an older build keeps working until it reloads.
app.get('/api/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(c.get('user').id)
    .all();
  return c.json(rows(results));
});

/**
 * Incremental sync.
 *  - without `since` (first load / reset): the device's working set only — unfinished tasks, anything
 *    dated or touched within the window, 予定 that haven't ended before `from` — not years of history.
 *  - with `since`: every row the server stamped after it, deletions included.
 * Returns a cursor for the next call. `reset: true` = the cursor was too old (tombstones may be gone),
 * so this is a fresh working set and the device should drop what it isn't told about.
 */
app.get('/api/tasks/changes', async (c) => {
  const userId = c.get('user').id;
  const now = Date.now();
  const since = Number(c.req.query('since') ?? '');
  const from = c.req.query('from') ?? '';
  const cutoff = Number(c.req.query('cutoff') ?? '') || now - 60 * 86_400_000;
  const cursor = now - CURSOR_SKEW_MS;
  if (since && since > now - TOMBSTONE_TTL_MS) {
    const [t, e] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE user_id = ? AND synced_at > ?`).bind(userId, since),
      c.env.DB.prepare(`SELECT ${EVENT_COLS} FROM events WHERE user_id = ? AND synced_at > ?`).bind(userId, since),
    ]);
    return c.json({ tasks: rows(t.results), events: eventRows(e.results), cursor, reset: false });
  }
  if (!isDate(from) || !from) return c.json({ error: 'bad from' }, 400);
  const [t, e] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT ${TASK_COLS} FROM tasks WHERE user_id = ?3 AND deleted = 0 AND (
         ${ACTIVE_EVENT_TASK}
         OR (kind = 'event' AND COALESCE(plan_end_date, plan_date, '9999-12-31') >= ?1)
         OR (kind = 'task' AND (status != 'done' OR updated_at >= ?2
              OR COALESCE(plan_end_date, plan_date, '') >= ?1 OR COALESCE(due_date, '') >= ?1)))`,
    ).bind(from, cutoff, userId),
    // events are few: a device always has all of them
    c.env.DB.prepare(`SELECT ${EVENT_COLS} FROM events WHERE user_id = ? AND deleted = 0`).bind(userId),
  ]);
  return c.json({ tasks: rows(t.results), events: eventRows(e.results), cursor, reset: true });
});

/** Older items for a calendar range outside the device's working set (e.g. last year's months). */
app.get('/api/tasks/range', async (c) => {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!from || !to || !isDate(from) || !isDate(to) || to < from) return c.json({ error: 'bad range' }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT ${TASK_COLS} FROM tasks WHERE user_id = ?3 AND deleted = 0 AND (
       (plan_date IS NOT NULL AND plan_date <= ?2 AND COALESCE(plan_end_date, plan_date) >= ?1)
       OR (due_date IS NOT NULL AND due_date BETWEEN ?1 AND ?2))`,
  )
    .bind(from, to, c.get('user').id)
    .all();
  return c.json(rows(results));
});

/** All of one event's items (for a finished event whose tasks are no longer on the device). */
app.get('/api/events/:id/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE user_id = ? AND event_id = ? AND deleted = 0`)
    .bind(c.get('user').id, c.req.param('id'))
    .all();
  return c.json(rows(results));
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
  plan_end_date?: string | null;
  kind?: 'task' | 'event';
  event_id?: string | null;
  roles?: string[];
  place?: string;
  items?: string;
};

type EventIn = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  place?: string;
  color?: string;
  roles?: { name: string; color: string }[];
  note?: string;
  closed?: boolean;
  created_at: number;
  updated_at: number;
  deleted?: boolean;
};
const COLORS = ['blue', 'orange', 'violet', 'pink', 'green', 'teal', 'gray'];

const isDate = (v: unknown) => v == null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const isTime = (v: unknown) => v == null || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));

/** Returns an error message, or null when the task is acceptable. */
function invalid(t: TaskIn): string | null {
  if (typeof t.id !== 'string' || !t.id || t.id.length > 64) return 'bad id';
  if (typeof t.title !== 'string' || t.title.length > 2000) return 'bad title';
  if (!STATUSES.includes(t.status as any)) return 'bad status';
  if (t.note != null && (typeof t.note !== 'string' || t.note.length > 20000)) return 'bad note';
  if (!isDate(t.due_date) || !isDate(t.plan_date) || !isDate(t.plan_end_date)) return 'bad date';
  if (t.plan_end_date && (!t.plan_date || t.plan_end_date < t.plan_date)) return 'bad range';
  if (!isTime(t.due_time) || !isTime(t.plan_start) || !isTime(t.plan_end)) return 'bad time';
  if (t.kind != null && t.kind !== 'task' && t.kind !== 'event') return 'bad kind';
  if (t.event_id != null && (typeof t.event_id !== 'string' || t.event_id.length > 64)) return 'bad event';
  if (t.roles != null && (!Array.isArray(t.roles) || t.roles.length > 20 || t.roles.some((r) => typeof r !== 'string' || r.length > 30)))
    return 'bad roles';
  if (t.place != null && (typeof t.place !== 'string' || t.place.length > 200)) return 'bad place';
  if (t.items != null && (typeof t.items !== 'string' || t.items.length > 1000)) return 'bad items';
  return null;
}

function invalidEvent(e: EventIn): string | null {
  if (typeof e.id !== 'string' || !e.id || e.id.length > 64) return 'bad id';
  if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 200) return 'bad name';
  if (!e.start_date || !e.end_date || !isDate(e.start_date) || !isDate(e.end_date) || e.end_date < e.start_date) return 'bad dates';
  if (e.place != null && (typeof e.place !== 'string' || e.place.length > 200)) return 'bad place';
  if (e.color != null && !COLORS.includes(e.color)) return 'bad color';
  if (
    e.roles != null &&
    (!Array.isArray(e.roles) ||
      e.roles.length > 20 ||
      e.roles.some((r) => !r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 30 || !COLORS.includes(r.color)))
  )
    return 'bad roles';
  if (e.note != null && (typeof e.note !== 'string' || e.note.length > 20000)) return 'bad note';
  return null;
}

function upsertEvent(db: D1Database, userId: string, e: EventIn, now: number) {
  return db
    .prepare(
      `INSERT INTO events (id, user_id, name, start_date, end_date, place, color, roles, note, closed, created_at, updated_at, deleted, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
         place = excluded.place, color = excluded.color, roles = excluded.roles, note = excluded.note, closed = excluded.closed,
         updated_at = excluded.updated_at, deleted = excluded.deleted, synced_at = excluded.synced_at
       WHERE events.user_id = excluded.user_id AND excluded.updated_at > events.updated_at`,
    )
    .bind(
      e.id,
      userId,
      e.name.trim(),
      e.start_date,
      e.end_date,
      e.place ?? '',
      e.color ?? 'blue',
      JSON.stringify((e.roles ?? []).map((r) => ({ name: r.name.trim(), color: r.color }))),
      e.note ?? '',
      e.closed ? 1 : 0,
      Math.floor(Number(e.created_at)) || now,
      Math.floor(Number(e.updated_at)) || now,
      e.deleted ? 1 : 0,
      now,
    );
}

/** Last-write-wins upsert (client updated_at), stamped with the server clock for incremental sync. */
function upsert(db: D1Database, userId: string, t: TaskIn, now: number) {
  return db
    .prepare(
      `INSERT INTO tasks (id, user_id, title, status, created_at, updated_at, deleted,
         note, due_date, due_time, plan_date, plan_start, plan_end, kind, plan_end_date, synced_at,
         event_id, roles, place, items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status,
         updated_at = excluded.updated_at, deleted = excluded.deleted, note = excluded.note,
         due_date = excluded.due_date, due_time = excluded.due_time,
         plan_date = excluded.plan_date, plan_start = excluded.plan_start, plan_end = excluded.plan_end,
         kind = excluded.kind, plan_end_date = excluded.plan_end_date, synced_at = excluded.synced_at,
         event_id = excluded.event_id, roles = excluded.roles, place = excluded.place, items = excluded.items
       WHERE tasks.user_id = excluded.user_id AND excluded.updated_at > tasks.updated_at`,
    )
    .bind(
      t.id,
      userId,
      t.title.trim(),
      t.status,
      Math.floor(Number(t.created_at)) || now,
      Math.floor(Number(t.updated_at)) || now,
      t.deleted ? 1 : 0,
      t.note ?? '',
      t.due_date ?? null,
      t.due_date ? (t.due_time ?? null) : null,
      t.plan_date ?? null,
      t.plan_date ? (t.plan_start ?? null) : null,
      t.plan_date ? (t.plan_end ?? null) : null,
      t.kind ?? 'task',
      // a range that ends on its start day is just a single day
      t.plan_date && t.plan_end_date && t.plan_end_date > t.plan_date ? t.plan_end_date : null,
      now,
      t.event_id ?? null,
      JSON.stringify((t.roles ?? []).map((r) => r.trim()).filter(Boolean)),
      t.place ?? '',
      t.items ?? '',
    );
}

// Batch upsert. Lets the local-first client push its queue in one request.
app.post('/api/tasks/sync', async (c) => {
  const body = (await c.req.json()) as { tasks?: TaskIn[]; events?: EventIn[] };
  const userId = c.get('user').id;
  const tasks = (body.tasks ?? []).slice(0, 500);
  const events = (body.events ?? []).slice(0, 100);
  for (const t of tasks) {
    const err = invalid(t);
    if (err) return c.json({ error: err }, 400);
  }
  for (const e of events) {
    const err = invalidEvent(e);
    if (err) return c.json({ error: err }, 400);
  }
  const now = Date.now();
  const db = c.env.DB;
  const results = tasks.length + events.length
    ? await db.batch([...events.map((e) => upsertEvent(db, userId, e, now)), ...tasks.map((t) => upsert(db, userId, t, now))])
    : [];
  // rows the server kept its own (newer) version of: send that version back so the device converges
  const rejectedEvents = events.filter((_, i) => !results[i]?.meta.changes).map((e) => e.id);
  const rejected = tasks.filter((_, i) => !results[events.length + i]?.meta.changes).map((t) => t.id);
  const inList = (ids: string[]) => ids.map(() => '?').join(',');
  const stale = rejected.length
    ? rows((await db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE user_id = ? AND id IN (${inList(rejected)})`).bind(userId, ...rejected).all()).results)
    : [];
  const staleEvents = rejectedEvents.length
    ? eventRows(
        (await db.prepare(`SELECT ${EVENT_COLS} FROM events WHERE user_id = ? AND id IN (${inList(rejectedEvents)})`).bind(userId, ...rejectedEvents).all())
          .results,
      )
    : [];
  // tell the user's other open devices to pull (fire-and-forget; the save already succeeded)
  if (tasks.length + events.length > rejected.length + rejectedEvents.length)
    c.executionCtx.waitUntil(hub(c).changed(c.req.header('x-client-id') ?? '').catch(() => 0));
  return c.json({ ok: true, count: tasks.length + events.length, stale, staleEvents });
});

// ---------- backup ----------

/** Everything the account has (not deleted), as one JSON file. */
app.get('/api/export', async (c) => {
  const user = c.get('user');
  const [t, e] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE user_id = ? AND deleted = 0 ORDER BY created_at`).bind(user.id),
    c.env.DB.prepare(`SELECT ${EVENT_COLS} FROM events WHERE user_id = ? AND deleted = 0 ORDER BY start_date`).bind(user.id),
  ]);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  c.header('content-disposition', `attachment; filename="flick-backup-${stamp}.json"`);
  return c.json({
    app: 'flick',
    version: 2,
    exported_at: new Date().toISOString(),
    account: user.email,
    events: eventRows(e.results),
    tasks: rows(t.results),
  });
});

/** Which of these ids exist in `table`, and which account owns each. */
async function owners(db: D1Database, table: 'tasks' | 'events', ids: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT id, user_id FROM ${table} WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ id: string; user_id: string }>();
    for (const r of results) out.set(r.id, r.user_id);
  }
  return out;
}

/**
 * Restore a backup into the signed-in account. Rows whose id already belongs to ANOTHER account
 * (e.g. moving data from last year's 幹部 account) get a fresh id — events too, with their tasks
 * re-linked — and the rest merge last-write-wins.
 */
app.post('/api/import', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { app?: string; tasks?: TaskIn[]; events?: EventIn[] } | null;
  if (!body || body.app !== 'flick' || !Array.isArray(body.tasks)) return c.json({ error: 'not a Flick backup' }, 400);
  let tasks = body.tasks.slice(0, 20000).filter((t) => !t.deleted);
  let events = (Array.isArray(body.events) ? body.events : []).slice(0, 2000).filter((e) => !e.deleted);
  for (const t of tasks) {
    const err = invalid(t);
    if (err) return c.json({ error: `${err}: ${String(t.title ?? '').slice(0, 40)}` }, 400);
  }
  for (const e of events) {
    const err = invalidEvent(e);
    if (err) return c.json({ error: `${err}: ${String(e.name ?? '').slice(0, 40)}` }, 400);
  }
  const userId = c.get('user').id;
  const db = c.env.DB;
  let added = 0;
  let merged = 0;
  const count = (owner: string | undefined) => (owner === userId ? merged++ : added++);

  const eventOwners = await owners(db, 'events', events.map((e) => e.id));
  const newEventId = new Map<string, string>();
  events = events.map((e) => {
    const owner = eventOwners.get(e.id);
    count(owner);
    if (owner && owner !== userId) {
      const id = crypto.randomUUID();
      newEventId.set(e.id, id);
      return { ...e, id };
    }
    return e;
  });
  const taskOwners = await owners(db, 'tasks', tasks.map((t) => t.id));
  tasks = tasks.map((t) => {
    const owner = taskOwners.get(t.id);
    count(owner);
    const event_id = t.event_id ? (newEventId.get(t.event_id) ?? t.event_id) : null;
    return owner && owner !== userId ? { ...t, id: crypto.randomUUID(), event_id } : { ...t, event_id };
  });

  const now = Date.now();
  const stmts = [...events.map((e) => upsertEvent(db, userId, e, now)), ...tasks.map((t) => upsert(db, userId, t, now))];
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  if (stmts.length) c.executionCtx.waitUntil(hub(c).changed('').catch(() => 0));
  return c.json({ ok: true, added, merged });
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

/** Daily housekeeping: purge deletions older than the tombstone TTL and expired sessions. */
async function cleanup(env: Env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM tasks WHERE deleted = 1 AND synced_at < ?').bind(now - TOMBSTONE_TTL_MS),
    env.DB.prepare('DELETE FROM events WHERE deleted = 1 AND synced_at < ?').bind(now - TOMBSTONE_TTL_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Math.floor(now / 1000)),
  ]);
}

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(cleanup(env)),
} satisfies ExportedHandler<Env>;
