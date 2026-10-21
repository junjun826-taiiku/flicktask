// 当日の動き: rows of one event day, and reading a pasted 運営マニュアル / Excel table.
import type { FEvent, Task } from '../../lib/store.svelte';
import { fromMin, toMin } from '../../lib/dates';
import { isMove } from '../../lib/eventView';

/** Everything with a time on that day: moves (担当がやる) and 予定 (式次第など), by start time. */
export function dayItems(tasks: Task[], e: FEvent, date: string) {
  return tasks
    .filter((t) => !t.deleted && t.event_id === e.id && t.plan_date === date && t.plan_start && (isMove(t, e) || t.kind === 'event'))
    .sort((a, b) => a.plan_start!.localeCompare(b.plan_start!) || (a.plan_end ?? '').localeCompare(b.plan_end ?? '') || a.created_at - b.created_at);
}
/** Role filter: 全員 rows (no role) and 予定 stay visible. */
export const forRole = (role: string | null) => (t: Task) => role === null || t.kind === 'event' || t.roles.length === 0 || t.roles.includes(role);

/** Where a new row starts: right after the last one, else 9:00. */
export function nextSlot(items: Task[]) {
  const last = items.reduce((m, t) => Math.max(m, toMin(t.plan_end ?? t.plan_start!)), -1);
  const start = last < 0 ? 9 * 60 : Math.min(last, 23 * 60);
  return { plan_start: fromMin(start), plan_end: fromMin(Math.min(start + 30, 23 * 60 + 59)) };
}

export type Parsed = { title: string; plan_start: string; plan_end: string | null; roles: string[]; place: string; items: string };
const TIME = /(\d{1,2})[:：時](\d{2})?/;
const pad = (h: string, m?: string) => `${String(Math.min(23, Number(h))).padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
function times(s: string): [string, string | null] | null {
  const parts = s.split(/[-~〜～–—]/).map((x) => x.trim()).filter(Boolean);
  const a = parts[0]?.match(TIME);
  if (!a) return null;
  const b = parts[1]?.match(TIME);
  return [pad(a[1], a[2]), b ? pad(b[1], b[2]) : null];
}
/**
 * One row per line: 時刻 | やること | 担当 | 場所 | 持ち物, separated by tabs (Excel / Word tables) or 2+ spaces.
 * The time may also lead the title ("13:00-13:45 リハーサル"). Unknown roles are dropped; 担当 "全員" means everyone.
 */
export function parseTable(text: string, roleNames: string[]): Parsed[] {
  const out: Parsed[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let cols = line.includes('\t') ? line.split('\t').map((c) => c.trim()) : line.split(/\s{2,}/).map((c) => c.trim());
    if (cols.length === 1) {
      // "13:00-13:45 リハーサル"
      const m = line.match(/^(\S+)\s+(.+)$/);
      if (m && times(m[1])) cols = [m[1], m[2]];
    }
    const t = times(cols[0] ?? '');
    if (!t || !cols[1]) continue; // a header row or a note: skipped
    const roles = (cols[2] ?? '')
      .split(/[、,，・/／\s]+/)
      .map((r) => r.trim())
      .filter((r) => r && roleNames.includes(r));
    out.push({ title: cols[1], plan_start: t[0], plan_end: t[1], roles, place: cols[3] ?? '', items: cols[4] ?? '' });
  }
  return out;
}
