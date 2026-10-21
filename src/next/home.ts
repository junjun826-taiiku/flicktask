// What the new home shows, as plain functions of the store's data (easy to test and reason about).
import { BUILTIN_TAGS, COLOR_HEX, coversDate, type FEvent, type Task } from '../lib/store.svelte';
import { addDays, parseYmd } from '../lib/dates';
import { isMove } from '../lib/eventView';

/** Days between two 'YYYY-MM-DD' dates (b - a). */
export const dayDiff = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
/** Monday of the week containing `date`. */
export function mondayOf(date: string) {
  const wd = parseYmd(date).getDay();
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

/** The date a 準備 task is aimed at: its deadline, else the day it is planned for. Day-of moves have none here. */
export function aimDate(t: Task, e: FEvent | null) {
  if (t.due_date) return t.due_date;
  if (t.plan_date && !(e && isMove(t, e))) return t.plan_date;
  return null;
}
const openTask = (t: Task) => !t.deleted && t.kind === 'task' && t.status !== 'done';

// ---------- これからの流れ ----------
export const TIMELINE_DAYS = 91; // 13 weeks from this week's Monday
export type TimelineRow = {
  event: FEvent;
  color: string;
  /** event days, as offsets from the timeline start (may lie outside 0..TIMELINE_DAYS) */
  start: number;
  end: number;
  dues: { task: Task; at: number; over: boolean }[];
};
export function timeline(tasks: Task[], events: FEvent[], today: string) {
  const from = mondayOf(today);
  const rows: TimelineRow[] = events.map((e) => ({
    event: e,
    color: COLOR_HEX[e.color] ?? COLOR_HEX.gray,
    start: dayDiff(from, e.start_date),
    end: dayDiff(from, e.end_date),
    dues: tasks
      .filter((t) => openTask(t) && t.event_id === e.id)
      .map((t) => ({ task: t, d: aimDate(t, e) }))
      .filter((x): x is { task: Task; d: string } => !!x.d)
      .map(({ task, d }) => ({ task, at: dayDiff(from, d), over: d < today }))
      .filter((x) => x.at >= 0 && x.at < TIMELINE_DAYS)
      .sort((a, b) => a.at - b.at),
  }));
  const months: { label: string; at: number }[] = [];
  for (let i = 1; i < TIMELINE_DAYS; i++) {
    const d = addDays(from, i);
    if (d.endsWith('-01')) months.push({ label: `${Number(d.slice(5, 7))}月`, at: i });
  }
  return { from, today: dayDiff(from, today), rows, months };
}

// ---------- 今週やること ----------
export type WeekItem = { task: Task; event: FEvent | null; date: string; over: boolean };
/** Unfinished tasks that are overdue or aimed at this week (through Sunday), soonest first. */
export function thisWeek(tasks: Task[], eventById: (id: string | null) => FEvent | null, today: string): WeekItem[] {
  const sunday = addDays(mondayOf(today), 6);
  return tasks
    .filter(openTask)
    .map((t) => {
      const event = eventById(t.event_id);
      return { task: t, event, date: aimDate(t, event) };
    })
    .filter((x): x is WeekItem & { date: string } => !!x.date && x.date <= sunday)
    .map((x) => ({ ...x, over: x.date < today }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.task.due_time ?? '99').localeCompare(b.task.due_time ?? '99') || a.task.created_at - b.task.created_at);
}
export type WeekGroup = { key: string; event: FEvent | null; items: WeekItem[] };
/** Group by event in sidebar order; tasks with no event go last under 「その他」. */
export function byEvent(items: WeekItem[], order: FEvent[]): WeekGroup[] {
  const groups: WeekGroup[] = order.map((e) => ({ key: e.id, event: e, items: items.filter((x) => x.event?.id === e.id) }));
  const rest = items.filter((x) => !x.event || !order.some((e) => e.id === x.event!.id));
  return [...groups, { key: 'other', event: null, items: rest }].filter((g) => g.items.length);
}

// ---------- 直近の予定 ----------
export type Upcoming = { task: Task; event: FEvent | null; date: string };
/** 予定 from today on (multi-day ones that already started count from today), soonest first. */
export function upcoming(tasks: Task[], eventById: (id: string | null) => FEvent | null, today: string, limit = 8): Upcoming[] {
  return tasks
    .filter((t) => !t.deleted && t.kind === 'event' && t.plan_date && (t.plan_date >= today || coversDate(t, today)))
    .map((t) => ({ task: t, event: eventById(t.event_id), date: t.plan_date! < today ? today : t.plan_date! }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.task.plan_start ?? '').localeCompare(b.task.plan_start ?? ''))
    .slice(0, limit);
}
export const TAG_COLOR: Record<string, string> = { MTG: '#8ea8ff', 読み合わせ: '#2fc4b2', 幹部読み合わせ: '#e8609a' };
export const tagColor = (tag: string) => TAG_COLOR[tag] ?? (BUILTIN_TAGS.includes(tag as never) ? '#8ea8ff' : '#a3a3a3');

// ---------- mini calendar ----------
/** Which days of the month have a deadline / an event day, for the dots. */
export function calendarMarks(tasks: Task[], events: FEvent[], month: string) {
  const marks = new Map<string, string>();
  const ym = month.slice(0, 7);
  for (const e of events) {
    for (let d = e.start_date; d <= e.end_date; d = addDays(d, 1)) if (d.startsWith(ym)) marks.set(d, COLOR_HEX[e.color] ?? COLOR_HEX.gray);
  }
  for (const t of tasks) {
    if (!openTask(t) || !t.due_date?.startsWith(ym) || marks.has(t.due_date)) continue;
    marks.set(t.due_date, '');
  }
  return marks;
}
