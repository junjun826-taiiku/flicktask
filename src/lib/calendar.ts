import type { Task } from './store.svelte';
import { toMin } from './dates';

export type PlanBlock = { task: Task; start: number; end: number; col: number; cols: number };

/** Timed blocks for one day, laid out side by side where they overlap (Google Calendar style). */
export function layoutBlocks(tasks: Task[], date: string): PlanBlock[] {
  const items = tasks
    .filter((t) => !t.deleted && t.plan_date === date && t.plan_start)
    .map((t) => {
      const start = toMin(t.plan_start!);
      const end = t.plan_end ? Math.max(toMin(t.plan_end), start + 15) : start + 60;
      return { task: t, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: PlanBlock[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1));
    for (const b of cluster) b.cols = cols;
    cluster = [];
  };
  for (const b of items) {
    if (b.start >= clusterEnd) flush(), (clusterEnd = -1);
    const used = new Set(cluster.filter((o) => o.end > b.start).map((o) => o.col));
    let c = 0;
    while (used.has(c)) c++;
    b.col = c;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
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
  plans: tasks.filter((t) => !t.deleted && t.plan_date === date && !t.plan_start),
  dues: tasks.filter((t) => !t.deleted && t.kind === 'task' && t.due_date === date && !t.due_time),
});

/** event = calendar-only 予定, plan = a task's やる時間, due = a task's 期限 */
export type MonthItem = { task: Task; kind: 'event' | 'plan' | 'due'; time: string | null };

/** Everything to show in one month cell: blocks first (by time), then deadlines. */
export function monthItems(tasks: Task[], date: string): MonthItem[] {
  const out: MonthItem[] = [];
  for (const t of tasks) {
    if (t.deleted) continue;
    if (t.plan_date === date) out.push({ task: t, kind: t.kind === 'event' ? 'event' : 'plan', time: t.plan_start });
    if (t.due_date === date) out.push({ task: t, kind: 'due', time: t.due_time });
  }
  const key = (i: MonthItem) => (i.kind === 'due' ? 1 : 0) * 10000 + (i.time ? toMin(i.time) : -1);
  return out.sort((a, b) => key(a) - key(b));
}
