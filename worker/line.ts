// LINE bot: a group sends 「やること」 and gets the list back; every Monday morning it gets 今週のまとめ.
// Replies are free on LINE; only the Monday push counts against the official account's monthly quota.
// The texts are built from the same rules as the home screen's やること (overdue + the coming month, by event).

export type LineEnv = {
  DB: D1Database;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
};

type Row = {
  id: string; title: string; status: string; kind: string; event_id: string | null; assignees: string;
  due_date: string | null; due_time: string | null; plan_date: string | null; plan_start: string | null; tag: string;
};
type Ev = { id: string; name: string; start_date: string; end_date: string; closed: number };

const API = 'https://api.line.me/v2/bot';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_LINES = 45; // LINE allows 5000 characters per message; stay well under

// ---------- dates (Japan time, whatever the Worker's clock zone) ----------
export const jstToday = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmt(new Date(parse(s).getTime() + n * 86_400_000));
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}(${WD[parse(s).getUTCDay()]})`;
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
/** The same day next month (1/31 → 2/28), as on the home screen. */
export function monthAhead(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(d, last))));
}
const mondayOf = (s: string) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));

// ---------- what to list ----------
const isMove = (t: Row, e: Ev) => t.kind === 'task' && !!t.plan_date && !!t.plan_start && e.start_date <= t.plan_date && t.plan_date <= e.end_date;
/** A 準備 task is aimed at its deadline, else the day it is planned for (day-of moves have none). */
const aim = (t: Row, e: Ev | null) => t.due_date ?? (t.plan_date && !(e && isMove(t, e)) ? t.plan_date : null);

type Item = { t: Row; e: Ev | null; date: string };
async function load(db: D1Database, userId: string) {
  const [t, e] = await db.batch([
    db.prepare(
      `SELECT id, title, status, kind, event_id, assignees, due_date, due_time, plan_date, plan_start, tag
       FROM tasks WHERE user_id = ? AND deleted = 0 AND (status != 'done' OR kind = 'event')`,
    ).bind(userId),
    db.prepare('SELECT id, name, start_date, end_date, closed FROM events WHERE user_id = ? AND deleted = 0 ORDER BY start_date').bind(userId),
  ]);
  return { tasks: t.results as Row[], events: e.results as Ev[] };
}
/** Unfinished tasks overdue or due by `until`, grouped like the home screen: running events in order, then その他. */
export function todoGroups(tasks: Row[], events: Ev[], until: string) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const items: Item[] = [];
  for (const t of tasks) {
    if (t.kind !== 'task' || t.status === 'done') continue;
    const e = (t.event_id && byId.get(t.event_id)) || null;
    if (e?.closed) continue; // a finished event's leftovers stay in 過去資料
    const date = aim(t, e);
    if (date && date <= until) items.push({ t, e, date });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.t.due_time ?? '99').localeCompare(b.t.due_time ?? '99'));
  const running = events.filter((e) => !e.closed);
  const groups = running.map((e) => ({ e: e as Ev | null, items: items.filter((x) => x.e?.id === e.id) }));
  groups.push({ e: null, items: items.filter((x) => !x.e) });
  return groups.filter((g) => g.items.length);
}

const who = (t: Row) => {
  try {
    const a = JSON.parse(t.assignees) as string[];
    return a.length ? `（${a.join('・')}）` : '';
  } catch {
    return '';
  }
};
const line = (x: Item, today: string) => `${x.date < today ? '⚠️' : '・'}${md(x.date)}${x.t.due_time ? ` ${x.t.due_time}` : ''} ${x.t.title}${who(x.t)}`;
const head = (e: Ev | null, today: string) =>
  e ? `【${e.name}】${e.start_date > today ? ` 本番まで${daysBetween(today, e.start_date)}日` : e.end_date >= today ? ' 本番中' : ''}` : '【その他】';

/** Lines → one message, cut at MAX_LINES with a count of what was left out. */
function clip(lines: string[], footer: string[]) {
  if (lines.length <= MAX_LINES) return [...lines, ...footer].join('\n');
  const rest = lines.slice(MAX_LINES).filter((l) => /^(⚠️|・)/.test(l)).length;
  return [...lines.slice(0, MAX_LINES), `…ほか${rest}件はアプリで`, ...footer].join('\n');
}

/** 「やること」: overdue and the coming month, by event. */
export function todoText(tasks: Row[], events: Ev[], today: string, appUrl: string) {
  const until = monthAhead(today);
  const groups = todoGroups(tasks, events, until);
  const title = `📋 やること（期限切れと${md(until)}まで）`;
  if (!groups.length) return `${title}\n\n1か月以内の締切はありません 🎉\n${appUrl}`;
  const lines = [title];
  for (const g of groups) lines.push('', head(g.e, today), ...g.items.map((x) => line(x, today)));
  const n = groups.reduce((s, g) => s + g.items.length, 0);
  return clip(lines, ['', `全${n}件 ▶ ${appUrl}`]);
}

/** Monday's 今週のまとめ: overdue, this week's deadlines by event, this week's 予定, and the next 本番. Null when there is nothing to say. */
export function weeklyText(tasks: Row[], events: Ev[], today: string, appUrl: string) {
  const mon = mondayOf(today);
  const sun = addDays(mon, 6);
  const groups = todoGroups(tasks, events, sun);
  const plans = tasks
    .filter((t) => t.kind === 'event' && t.plan_date && t.plan_date >= today && t.plan_date <= sun)
    .sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || (a.plan_start ?? '').localeCompare(b.plan_start ?? ''));
  const next = events.filter((e) => !e.closed && e.start_date >= today).slice(0, 3);
  if (!groups.length && !plans.length) return null;
  const lines = [`🗓 今週のまとめ（${md(mon)}〜${md(sun)}）`];
  if (groups.length) {
    for (const g of groups) lines.push('', head(g.e, today), ...g.items.map((x) => line(x, today)));
  } else lines.push('', '今週の締切はありません');
  if (plans.length) {
    const evName = (id: string | null) => events.find((e) => e.id === id)?.name;
    lines.push('', '【今週の予定】', ...plans.map((t) => `・${md(t.plan_date!)}${t.plan_start ? ` ${t.plan_start}` : ''} ${t.title}${t.tag ? `［${t.tag}］` : ''}${evName(t.event_id) ? `（${evName(t.event_id)}）` : ''}`));
  }
  if (next.length) lines.push('', next.map((e) => `${e.name} 本番まで${daysBetween(today, e.start_date)}日`).join('\n'));
  return clip(lines, ['', `「やること」と送ると1か月分を返します ▶ ${appUrl}`]);
}

export const HELP = [
  'Task本部 ボットの使い方',
  '・「やること」… 期限切れと1か月先までの締切を返します',
  '・「今週」… 今週のまとめを返します',
  '・「連携 123456」… アプリの「LINE連携」で出したコードでつなぎます',
  '・「連携解除」… このトークとの連携をやめます',
  '毎週月曜の朝8時に、今週のまとめを送ります。',
].join('\n');

// ---------- LINE API ----------
/** X-Line-Signature = base64(HMAC-SHA256(channel secret, raw body)). */
export async function verifySignature(secret: string, body: string, signature: string | undefined) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(body));
}
async function call(env: LineEnv, path: string, payload: unknown) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return false;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error('LINE API', path, res.status, await res.text());
  return res.ok;
}
const reply = (env: LineEnv, token: string, text: string) => call(env, '/message/reply', { replyToken: token, messages: [{ type: 'text', text }] });
const push = (env: LineEnv, to: string, text: string) => call(env, '/message/push', { to, messages: [{ type: 'text', text }] });
async function groupName(env: LineEnv, kind: string, id: string) {
  if (kind !== 'group' || !env.LINE_CHANNEL_ACCESS_TOKEN) return '';
  try {
    const res = await fetch(`${API}/group/${encodeURIComponent(id)}/summary`, { headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` } });
    return res.ok ? ((await res.json()) as { groupName?: string }).groupName ?? '' : '';
  } catch {
    return '';
  }
}

// ---------- webhook ----------
type Source = { type: 'user' | 'group' | 'room'; userId?: string; groupId?: string; roomId?: string };
type LineEvent = { type: string; replyToken?: string; source?: Source; message?: { type: string; text?: string } };
const targetOf = (s: Source | undefined) => (s ? (s.groupId ?? s.roomId ?? s.userId ?? null) : null);
/** Fold full-width digits/spaces so 「連携　１２３４５６」 works too. */
const normalize = (s: string) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\s+/g, ' ').trim();

/** Handle one webhook body. Returns the replies it made (the local test suite reads them). */
export async function handleWebhook(env: LineEnv, events: LineEvent[], appUrl: string, now = Date.now()) {
  const replies: { to: string | null; text: string }[] = [];
  const say = async (ev: LineEvent, text: string) => {
    replies.push({ to: targetOf(ev.source), text });
    if (ev.replyToken) await reply(env, ev.replyToken, text);
  };
  for (const ev of events) {
    const target = targetOf(ev.source);
    if (!target || !ev.source) continue;
    if (ev.type === 'join' || ev.type === 'follow') {
      await say(ev, `Task本部のボットです。\nアプリの「LINE連携」で連携コードを出して、ここに「連携 123456」のように送ってください。\n\n${HELP}`);
      continue;
    }
    if (ev.type === 'leave' || ev.type === 'unfollow') {
      await env.DB.prepare('DELETE FROM line_links WHERE target_id = ?').bind(target).run();
      continue;
    }
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
    const text = normalize(ev.message.text ?? '');
    const link = await env.DB.prepare('SELECT user_id FROM line_links WHERE target_id = ?').bind(target).first<{ user_id: string }>();

    const code = text.match(/^連携 ?(\d{6})$/)?.[1];
    if (code) {
      const row = await env.DB.prepare('SELECT user_id FROM line_codes WHERE code = ? AND expires_at > ?').bind(code, now).first<{ user_id: string }>();
      if (!row) {
        await say(ev, 'コードが違うか、期限（10分）が切れています。アプリの「LINE連携」でもう一度コードを出してください。');
        continue;
      }
      const name = await groupName(env, ev.source.type, target);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM line_codes WHERE code = ?').bind(code),
        env.DB.prepare(
          `INSERT INTO line_links (id, target_id, user_id, kind, name, weekly, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(target_id) DO UPDATE SET user_id = excluded.user_id, name = excluded.name`,
        ).bind(crypto.randomUUID(), target, row.user_id, ev.source.type, name, now),
      ]);
      await say(ev, `Task本部と連携しました ✅\n毎週月曜の朝8時に今週のまとめを送ります。「やること」と送ると1か月分の締切を返します。`);
      continue;
    }
    if (text === '連携解除') {
      if (!link) continue;
      await env.DB.prepare('DELETE FROM line_links WHERE target_id = ?').bind(target).run();
      await say(ev, '連携を解除しました。もう一度つなぐときはアプリの「LINE連携」から。');
      continue;
    }
    if (text === 'ヘルプ' || text === '使い方') {
      await say(ev, HELP);
      continue;
    }
    if (text === 'やること' || text === '今週') {
      if (!link) {
        await say(ev, 'まだ連携していません。アプリの「LINE連携」で連携コードを出して、「連携 123456」のように送ってください。');
        continue;
      }
      const { tasks, events: evs } = await load(env.DB, link.user_id);
      const today = jstToday(now);
      await say(ev, text === 'やること' ? todoText(tasks, evs, today, appUrl) : (weeklyText(tasks, evs, today, appUrl) ?? `🗓 今週の締切と予定はありません\n${appUrl}`));
    }
    // anything else is ordinary group talk: stay quiet
  }
  return replies;
}

/** Monday 08:00 JST: push 今週のまとめ to every linked chat that wants it (skipped when there is nothing to say). */
export async function weeklyPush(env: LineEnv, appUrl: string, now = Date.now()) {
  const { results } = await env.DB.prepare('SELECT target_id, user_id FROM line_links WHERE weekly = 1').all<{ target_id: string; user_id: string }>();
  const today = jstToday(now);
  const sent: { to: string; text: string }[] = [];
  const cache = new Map<string, Awaited<ReturnType<typeof load>>>();
  for (const l of results) {
    if (!cache.has(l.user_id)) cache.set(l.user_id, await load(env.DB, l.user_id));
    const { tasks, events } = cache.get(l.user_id)!;
    const text = weeklyText(tasks, events, today, appUrl);
    if (!text) continue;
    sent.push({ to: l.target_id, text });
    await push(env, l.target_id, text);
  }
  return sent;
}
