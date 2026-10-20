import { coversDate, COLOR_HEX, type FEvent, type Task } from './store.svelte';
import { toMin } from './dates';

/** span: how many columns the block may take (it widens into free columns to its right) */
export type PlanBlock = { task: Task; start: number; end: number; col: number; cols: number; span: number };

/** Timed blocks for one day, laid out side by side where they overlap (Google Calendar style).
 *  minSpan: minutes the shortest drawn block covers, so a short block's label never sits under the next one. */
export function layoutBlocks(tasks: Task[], date: string, minSpan = 0): PlanBlock[] {
  const vend = (b: PlanBlock) => Math.max(b.end, b.start + minSpan);
  const items = tasks
    .filter((t) => !t.deleted && t.plan_date === date && t.plan_start)
    .map((t) => {
      const start = toMin(t.plan_start!);
      const end = t.plan_end ? Math.max(toMin(t.plan_end), start + 15) : start + 60;
      return { task: t, start, end, col: 0, cols: 1, span: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: PlanBlock[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1));
    for (const b of cluster) {
      b.cols = cols;
      // widen while the next column is free for this block's whole time
      const free = (c: number) => !cluster.some((o) => o.col === c && o.start < vend(b) && b.start < vend(o));
      while (b.col + b.span < cols && free(b.col + b.span)) b.span++;
    }
    cluster = [];
  };
  for (const b of items) {
    if (b.start >= clusterEnd) flush(), (clusterEnd = -1);
    const used = new Set(cluster.filter((o) => vend(o) > b.start).map((o) => o.col));
    let c = 0;
    while (used.has(c)) c++;
    b.col = c;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, vend(b));
  }
  flush();
  return items;
}

export const timedDeadlines = (tasks: Task[], date: string) =>
  tasks
    .filter((t) => !t.deleted && t.kind === 'task' && t.due_date === date && t.due_time)
    .map((t) => ({ task: t, at: toMin(t.due_time!) }))
    .sort((a, b) => a.at - b.at);

export const allDay = (tasks: Task[], date: string) => ({
  plans: tasks.filter((t) => !t.deleted && !t.plan_start && coversDate(t, date)),
  dues: tasks.filter((t) => !t.deleted && t.kind === 'task' && t.due_date === date && !t.due_time),
});

/** event = calendar-only 予定, plan = a task's やる時間, due = a task's 期限 */
/** meet = the イベント itself (大会・行事), drawn as a coloured bar over its days */
export type MonthItem = {
  task: Task;
  kind: 'meet' | 'event' | 'plan' | 'due';
  /** bar colour for a meet */
  color?: string;
  time: string | null;
  /** for multi-day bars: where this cell sits in the range */
  span: 'single' | 'start' | 'mid' | 'end';
  /** last day of a multi-day bar */
  end: string;
};

/** Everything to show in one month cell: blocks first (by time), then deadlines. */
export function monthItems(tasks: Task[], date: string, events: FEvent[] = []): MonthItem[] {
  const out: MonthItem[] = [];
  for (const e of events) {
    if (e.deleted || date < e.start_date || date > e.end_date) continue;
    const span = e.start_date === e.end_date ? 'single' : date === e.start_date ? 'start' : date === e.end_date ? 'end' : 'mid';
    // shaped like a Task so the cell template can treat it the same way
    const task = { id: `meet:${e.id}`, title: e.name, status: 'todo', plan_date: e.start_date, created_at: 0 } as Task;
    out.push({ task, kind: 'meet', time: null, span, color: COLOR_HEX[e.color], end: e.end_date });
  }
  for (const t of tasks) {
    if (t.deleted) continue;
    if (coversDate(t, date)) {
      const end = t.plan_end_date ?? t.plan_date;
      const span = t.plan_date === end ? 'single' : date === t.plan_date ? 'start' : date === end ? 'end' : 'mid';
      out.push({ task: t, kind: t.kind === 'event' ? 'event' : 'plan', time: t.plan_start, span, end: end! });
    }
    if (t.due_date === date) out.push({ task: t, kind: 'due', time: t.due_time, span: 'single', end: date });
  }
  // multi-day bars first (stable rows across cells), then by time; deadlines last
  // イベント bars first, then other multi-day bars (stable rows across cells), then by time; deadlines last
  // every multi-day bar comes before any single item, so a single item that wraps onto two lines never shifts a bar
  const rank = (i: MonthItem) => (i.span !== 'single' ? (i.kind === 'meet' ? -3 : -2) : i.kind === 'meet' ? -1 : i.kind === 'due' ? 2 : 1);
  const key = (i: MonthItem) => rank(i) * 10000 + (i.time ? toMin(i.time) : -1);
  return out.sort((a, b) => key(a) - key(b) || (a.task.plan_date ?? '').localeCompare(b.task.plan_date ?? '') || a.task.id.localeCompare(b.task.id));
}
