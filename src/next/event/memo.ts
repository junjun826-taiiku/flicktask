// メモ: plain text with a few line marks, shown formatted.
//   "## 見出し"  heading      "・ / - 項目"  bullet      "☐ / ☑ 項目" ("[ ]" / "[x]")  checkbox      URLs become links
import type { FEvent } from '../../lib/store.svelte';

export type MemoLine =
  | { kind: 'h'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'check'; text: string; done: boolean; line: number }
  | { kind: 'p'; text: string }
  | { kind: 'gap' };

export function parseMemo(src: string): MemoLine[] {
  return src.split('\n').map((raw, line) => {
    const s = raw.trimEnd();
    if (!s.trim()) return { kind: 'gap' };
    let m = s.match(/^#{1,3}\s+(.*)$/);
    if (m) return { kind: 'h', text: m[1] };
    m = s.match(/^\s*(?:☐|\[ \])\s*(.*)$/);
    if (m) return { kind: 'check', text: m[1], done: false, line };
    m = s.match(/^\s*(?:☑|✓|\[x\])\s*(.*)$/i);
    if (m) return { kind: 'check', text: m[1], done: true, line };
    m = s.match(/^\s*(?:・|-|\*|•)\s*(.*)$/);
    if (m) return { kind: 'li', text: m[1] };
    return { kind: 'p', text: s };
  });
}
/** Flip one checkbox line. */
export function toggleCheck(src: string, line: number) {
  const lines = src.split('\n');
  const s = lines[line] ?? '';
  lines[line] = /^\s*(?:☐|\[ \])/.test(s) ? s.replace(/^(\s*)(?:☐|\[ \])/, '$1☑') : s.replace(/^(\s*)(?:☑|✓|\[x\])/i, '$1☐');
  return lines.join('\n');
}
/** Text split into plain parts and links (http/https only). */
export function linkify(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'）)]+/g)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** "2026 OBOG総会" → "OBOG総会": the same event in another year. */
const baseName = (name: string) => name.replace(/^\s*(?:19|20)\d{2}\s*(?:年度?)?\s*/, '').trim();
/** Last year's (the most recent earlier) event with the same name, if any. */
export function previousOf(e: FEvent, events: FEvent[]) {
  const b = baseName(e.name);
  if (!b) return null;
  return events.filter((x) => x.id !== e.id && !x.deleted && x.start_date < e.start_date && baseName(x.name) === b).sort((a, b2) => b2.start_date.localeCompare(a.start_date))[0] ?? null;
}
