import type { FEvent, Task } from './store.svelte';
import { addDays, today } from './dates';

/** A 当日の動き: a timed task on one of the event's own days. Everything else attached to it is 準備 (or a 予定). */
export const isMove = (t: Task, e: FEvent) =>
  t.kind === 'task' && !!t.plan_date && !!t.plan_start && e.start_date <= t.plan_date && t.plan_date <= e.end_date;

const of = (tasks: Task[], e: FEvent) => tasks.filter((t) => !t.deleted && t.event_id === e.id);

export const prepTasks = (tasks: Task[], e: FEvent) => of(tasks, e).filter((t) => t.kind === 'task' && !isMove(t, e));
export const moves = (tasks: Task[], e: FEvent) => of(tasks, e).filter((t) => isMove(t, e));
export const schedules = (tasks: Task[], e: FEvent) => of(tasks, e).filter((t) => t.kind === 'event');

export function progress(tasks: Task[], e: FEvent) {
  const prep = prepTasks(tasks, e);
  return { done: prep.filter((t) => t.status === 'done').length, total: prep.length };
}

/** The date a prep task is aimed at: its deadline, else when it's planned. */
export const targetDate = (t: Task) => t.due_date ?? t.plan_date;

/** The soonest unfinished deadline-ish thing, for list cards. */
export function nextUp(tasks: Task[], e: FEvent) {
  return prepTasks(tasks, e)
    .filter((t) => t.status !== 'done' && targetDate(t))
    .sort((a, b) => (targetDate(a)! + (a.due_time ?? '')).localeCompare(targetDate(b)! + (b.due_time ?? '')))[0];
}

export type PrepGroup = { key: string; label: string; tone?: 'over' | 'event'; items: Task[] };

/** 準備 grouped by when it's due relative to today and the event: 期限切れ → 今週 → 本番まで → 本番中 → 本番後 → 日付なし → 完了. */
export function groupPrep(tasks: Task[], e: FEvent): PrepGroup[] {
  const t0 = today();
  const week = addDays(t0, 6);
  const groups: Record<string, PrepGroup> = {
    over: { key: 'over', label: '期限切れ', tone: 'over', items: [] },
    week: { key: 'week', label: '今週', items: [] },
    before: { key: 'before', label: '本番まで', items: [] },
    during: { key: 'during', label: '本番中', tone: 'event', items: [] },
    after: { key: 'after', label: '本番後', items: [] },
    none: { key: 'none', label: '日付なし', items: [] },
    done: { key: 'done', label: '完了', items: [] },
  };
  for (const t of prepTasks(tasks, e)) {
    const d = targetDate(t);
    const g =
      t.status === 'done' ? 'done'
      : !d ? 'none'
      : d < t0 ? 'over'
      : d > e.end_date ? 'after'
      : d >= e.start_date ? 'during'
      : d <= week ? 'week'
      : 'before';
    groups[g].items.push(t);
  }
  const byDate = (a: Task, b: Task) => ((targetDate(a) ?? '') + (a.due_time ?? '')).localeCompare((targetDate(b) ?? '') + (b.due_time ?? '')) || b.created_at - a.created_at;
  return Object.values(groups)
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, items: g.items.sort(byDate) }));
}
