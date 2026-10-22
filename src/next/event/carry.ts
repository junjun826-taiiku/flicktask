// 引継ぎ: start this year's event from a past one, and the 過去資料 shelf by 年度.
import type { FEvent, Task } from '../../lib/store.svelte';
import { addDays } from '../../lib/dates';
import { isMove } from '../../lib/eventView';
import { dayDiff } from '../home';
import { byAim } from './prep';

/** 年度 starts in April: 2027-03 belongs to 2026年度. */
export const fiscalYear = (date: string) => Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);

/** Finished events by 年度, newest first. */
export function byFiscalYear(events: FEvent[]) {
  const map = new Map<number, FEvent[]>();
  for (const e of [...events].sort((a, b) => b.start_date.localeCompare(a.start_date))) {
    const y = fiscalYear(e.start_date);
    map.set(y, [...(map.get(y) ?? []), e]);
  }
  return [...map].map(([year, list]) => ({ year, events: list }));
}

/** 「2025 OBOG総会」 → 「2026 OBOG総会」; a name without a leading year stays as it is. */
export const nextName = (name: string, add = 1) => name.replace(/^(\s*)((?:19|20)\d{2})/, (_, sp: string, y: string) => sp + (Number(y) + add));

/** What a past event hands over: its 準備 tasks and its 当日の動き (予定 are left behind). */
export function carryable(tasks: Task[], e: FEvent) {
  const mine = tasks.filter((t) => !t.deleted && t.event_id === e.id && t.kind === 'task');
  return {
    prep: mine.filter((t) => !isMove(t, e)).sort(byAim(e)),
    moves: mine
      .filter((t) => isMove(t, e))
      .sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || a.plan_start!.localeCompare(b.plan_start!)),
  };
}

/** A 準備 task starts over: no dates, nobody on it, not started. Its title and note carry over. */
export const prepCopy = (t: Task) => ({ title: t.title, note: t.note, kind: 'task' as const });

/** A 当日の動き keeps its times and roles, on the same day of the new event (day 2 stays day 2). */
export function moveCopy(t: Task, from: FEvent, start: string, end: string) {
  const d = addDays(start, dayDiff(from.start_date, t.plan_date!));
  return {
    title: t.title, note: t.note, kind: 'task' as const,
    plan_date: d > end ? end : d, plan_start: t.plan_start, plan_end: t.plan_end,
    roles: [...t.roles], place: t.place, items: t.items,
  };
}
