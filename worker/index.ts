import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

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
    'SELECT id, title, status, created_at, updated_at, deleted FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results.map((t: any) => ({ ...t, deleted: !!t.deleted })));
});

type TaskIn = { id: string; title: string; status: string; created_at: number; updated_at: number; deleted?: boolean };

// Batch upsert with last-write-wins on updated_at. Lets the local-first client push its queue in one request.
app.post('/api/tasks/sync', async (c) => {
  const body = (await c.req.json()) as { tasks: TaskIn[] };
  const userId = c.get('user').id;
  const tasks = (body.tasks ?? []).slice(0, 500);
  for (const t of tasks) {
    if (typeof t.id !== 'string' || t.id.length > 64) return c.json({ error: 'bad id' }, 400);
    if (typeof t.title !== 'string' || t.title.length > 2000) return c.json({ error: 'bad title' }, 400);
    if (!STATUSES.includes(t.status as any)) return c.json({ error: 'bad status' }, 400);
  }
  if (tasks.length) {
    await c.env.DB.batch(
      tasks.map((t) =>
        c.env.DB.prepare(
          `INSERT INTO tasks (id, user_id, title, status, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status,
             updated_at = excluded.updated_at, deleted = excluded.deleted
           WHERE tasks.user_id = excluded.user_id AND excluded.updated_at > tasks.updated_at`,
        ).bind(t.id, userId, t.title.trim(), t.status, Math.floor(Number(t.created_at)) || Date.now(), Math.floor(Number(t.updated_at)) || Date.now(), t.deleted ? 1 : 0),
      ),
    );
  }
  return c.json({ ok: true, count: tasks.length });
});

// Workers AI: turn a free-form memo into a list of concrete tasks.
app.post('/api/ai/split', async (c) => {
  const { text } = (await c.req.json()) as { text?: string };
  const memo = (text ?? '').trim().slice(0, 4000);
  if (!memo) return c.json({ tasks: [] });
  const result: any = await c.env.AI.run(AI_MODEL as any, {
    messages: [
      {
        role: 'system',
        content:
          'You turn a user memo into a list of concrete, actionable tasks. ' +
          'Reply in the same language as the memo. Each task must make sense on its own when read later: ' +
          'include the object and any deadline or context from the memo (never a bare verb like "作成" or "連絡"). ' +
          'Keep each title under 40 characters, with no numbering or bullets. ' +
          'Do not invent tasks that are not implied by the memo. Return at most 10 tasks.',
      },
      { role: 'user', content: '週末に引っ越すので段ボールを買って、ガスを止める連絡をする' },
      { role: 'assistant', content: '{"tasks":["引っ越し用の段ボールを買う","ガス会社に停止の連絡をする"]}' },
      { role: 'user', content: memo },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: { tasks: { type: 'array', items: { type: 'string' } } },
        required: ['tasks'],
      },
    },
    max_tokens: 600,
  });
  let parsed: any = result?.response;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = { tasks: parsed.split('\n') };
    }
  }
  const tasks = ((parsed?.tasks ?? []) as unknown[])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.replace(/^\s*([-*・•]|\d+[.)．、])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 10);
  return c.json({ tasks });
});

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

export default app;
