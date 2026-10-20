// 当日モード helpers: which 担当 this device plays, what is happening now/next, delays.
import type { FEvent, Task } from './store.svelte';
import { addDays, nowMin, toMin, today } from './dates';
import { isMove } from './eventView';

const ROLES_KEY = 'ft.liveRoles.v1';
const DELAY_KEY = 'ft.liveDelay.v1';

/** '本部' = sees everything (the 全体 view). Otherwise the role names this device covers. */
export type LiveRoles = { hq: boolean; roles: string[] };

function read<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}
function write<T>(key: string, v: Record<string, T>) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

/** Per device: the shared 幹部 login is used on everyone's phone, so the 担当 lives on the device. */
export const getRoles = (eventId: string): LiveRoles | null => read<LiveRoles>(ROLES_KEY)[eventId] ?? null;
export const setRoles = (eventId: string, r: LiveRoles) => write(ROLES_KEY, { ...read<LiveRoles>(ROLES_KEY), [eventId]: r });

/** Total 押し applied today from this device, in minutes. */
export const getDelay = (eventId: string, date: string) => read<number>(DELAY_KEY)[`${eventId}:${date}`] ?? 0;
export const addDelay = (eventId: string, date: string, min: number) => {
  const all = read<number>(DELAY_KEY);
  write(DELAY_KEY, { ...all, [`${eventId}:${date}`]: (all[`${eventId}:${date}`] ?? 0) + min });
};

/** The day the live view shows: today when the event is on, else its first day (preview). */
export function liveDay(e: FEvent) {
  const t = today();
  return e.start_date <= t && t <= e.end_date ? t : e.start_date;
}
export const eventDays = (e: FEvent) => {
  const out: string[] = [];
  for (let d = e.start_date; d <= e.end_date && out.length < 14; d = addDays(d, 1)) out.push(d);
  return out;
};

export type Row = { task: Task; start: number; end: number; isEvent: boolean };

/** Everything timed on that day for the event: moves (checkable) and 予定 (context), by start time. */
export function dayRows(tasks: Task[], e: FEvent, date: string): Row[] {
  return tasks
    .filter((t) => !t.deleted && t.event_id === e.id && t.plan_date === date && t.plan_start && (isMove(t, e) || t.kind === 'event'))
    .map((t) => {
      const start = toMin(t.plan_start!);
      return { task: t, start, end: t.plan_end ? Math.max(toMin(t.plan_end), start + 1) : start + 30, isEvent: t.kind === 'event' };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Is this row for me? No 担当 = everyone; 本部 sees all. 予定 are context for everyone. */
export const mine = (r: Row, who: LiveRoles) => who.hq || r.isEvent || r.task.roles.length === 0 || r.task.roles.some((x) => who.roles.includes(x));

/** now: running and not done (latest start first); next: the first not-done move starting later; over: ended, not done. */
export function situation(rows: Row[], now = nowMin()) {
  const moves = rows.filter((r) => !r.isEvent);
  const running = moves.filter((r) => r.start <= now && now < r.end && r.task.status !== 'done').sort((a, b) => b.start - a.start);
  const next = moves.find((r) => r.start > now && r.task.status !== 'done') ?? null;
  const over = moves.filter((r) => r.end <= now && r.task.status !== 'done');
  return { now: running[0] ?? null, alsoNow: running.slice(1), next, over };
}

export const inMinutes = (min: number) => (min < 60 ? `あと${min}分` : `あと${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`);
export const itemsList = (s: string) =>
  s
    .split(/[、,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Side-by-side columns for overlapping time ranges (same idea as the calendar day view). */
export function columnize<T extends { start: number; end: number }>(items: T[]): (T & { col: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end).map((it) => ({ ...it, col: 0, cols: 1 }));
  let cluster: typeof sorted = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1));
    for (const b of cluster) b.cols = cols;
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) (flush(), (clusterEnd = -1));
    const used = new Set(cluster.filter((o) => o.end > b.start).map((o) => o.col));
    let c = 0;
    while (used.has(c)) c++;
    b.col = c;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return sorted;
}
