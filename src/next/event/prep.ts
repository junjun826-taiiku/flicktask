// 準備 tab: which tasks, in what order, and how the member timeline packs them.
import { COLOR_HEX, type Color, type FEvent, type Member, type Status, type Task } from '../../lib/store.svelte';
import { addDays } from '../../lib/dates';
import { isMove } from '../../lib/eventView';
import { aimDate, dayDiff } from '../home';

/** 準備 tasks of an event (day-of moves and 予定 live in other tabs); null = 「その他」 (no event). */
export function prepOf(tasks: Task[], e: FEvent | null, eventExists: (id: string | null) => boolean) {
  return tasks.filter((t) => !t.deleted && t.kind === 'task' && (e ? t.event_id === e.id && !isMove(t, e) : !eventExists(t.event_id)));
}
/** Soonest first; undated last (newest first among them). */
export function byAim(e: FEvent | null) {
  return (a: Task, b: Task) => {
    const x = aimDate(a, e), y = aimDate(b, e);
    if (x && y) return x.localeCompare(y) || (a.due_time ?? '99').localeCompare(b.due_time ?? '99') || a.created_at - b.created_at;
    if (x || y) return x ? -1 : 1;
    return b.created_at - a.created_at;
  };
}
export const NOBODY = '__nobody';
/** Filter by member: null = everyone, NOBODY = tasks with no one assigned. */
export const forMember = (who: string | null) => (t: Task) => (who === null ? true : who === NOBODY ? t.assignees.length === 0 : t.assignees.includes(who));

export const STATUS_COLUMNS: { status: Status; label: string }[] = [
  { status: 'todo', label: '未着手' },
  { status: 'doing', label: '進行中' },
  { status: 'done', label: '完了' },
];

export const memberColor = (e: FEvent | null, name: string) => COLOR_HEX[(e?.members.find((m) => m.name === name)?.color ?? 'gray') as Color];

// ---------- member timeline ----------
/** A pill runs from today to its deadline. In a row, the next one starts where the previous ends
 *  (one after another, like a queue); only when that leaves it too short does it take a new row. */
export const MIN_PILL_DAYS = 4;
/** At least this many px per day, so a pill keeps its title readable; a long run-up scrolls sideways. */
export const DAY_PX = 18;
export type Pill = { task: Task; end: number; start: number; row: number; over: boolean };
export type Lane = { key: string; name: string; color: string | null; pills: Pill[]; rows: number; open: number };
/** Axis: a week before today → a little after the event (or 6 weeks for 「その他」). */
export function axis(e: FEvent | null, today: string) {
  const from = addDays(today, -7);
  const to = e ? addDays(e.end_date > today ? e.end_date : today, 9) : addDays(today, 42);
  return { from, days: dayDiff(from, to) + 1 };
}
export function lanes(tasks: Task[], e: FEvent | null, members: Member[], today: string, from: string): Lane[] {
  const keys: { key: string; name: string; color: string | null }[] = [
    ...members.map((m) => ({ key: m.name, name: m.name, color: COLOR_HEX[m.color] })),
    { key: NOBODY, name: '担当なし', color: null },
  ];
  return keys
    .map(({ key, name, color }) => {
      const mine = tasks
        .filter(forMember(key))
        .map((t) => ({ t, d: aimDate(t, e) }))
        .filter((x): x is { t: Task; d: string } => !!x.d && (x.d >= from || x.t.status !== 'done')) // done before the axis starts: nothing to draw; still open: pinned to the left edge
        .sort((a, b) => a.d.localeCompare(b.d));
      const now = dayDiff(from, today);
      const rowEnds: number[] = [];
      const pills = mine.map(({ t, d }) => {
        const end = Math.max(MIN_PILL_DAYS, dayDiff(from, d) + 1);
        // from today; a deadline that is (nearly) here or past still gets a short pill ending on it
        const base = Math.max(0, Math.min(now, end - MIN_PILL_DAYS));
        let row = rowEnds.findIndex((x) => end - Math.max(base, x) >= MIN_PILL_DAYS);
        if (row < 0) (row = rowEnds.length), rowEnds.push(base);
        const start = Math.max(base, rowEnds[row]);
        rowEnds[row] = end;
        return { task: t, end, start, row, over: d < today && t.status !== 'done' };
      });
      return { key, name, color, pills, rows: Math.max(1, rowEnds.length), open: tasks.filter(forMember(key)).filter((t) => t.status !== 'done').length };
    })
    .filter((l) => l.key !== NOBODY || l.pills.length || l.open);
}
