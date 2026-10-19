// Local wall-clock date helpers. Dates are 'YYYY-MM-DD', times 'HH:MM'.

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const isValidYmd = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseYmd(s)) === s;

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
export const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Six Sunday-first weeks covering the month that contains `month` ('YYYY-MM-01'). */
export function monthGrid(month: string): string[] {
  const first = parseYmd(month);
  first.setDate(1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymd(d);
  });
}
export const monthOf = (s: string) => `${s.slice(0, 7)}-01`;
export const addMonths = (month: string, n: number) => {
  const d = parseYmd(month);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return ymd(d);
};

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const weekday = (s: string) => WD[parseYmd(s).getDay()];
export const WEEKDAYS = WD;
export const monthLabel = (month: string) => {
  const d = parseYmd(month);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
};
export const dayLabel = (s: string) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
};
/** Short label for chips: "今日 17:00", "明日", "10/22(木) 9:00". */
export function shortLabel(date: string, time?: string | null) {
  const t = today();
  const day = date === t ? '今日' : date === addDays(t, 1) ? '明日' : date === addDays(t, -1) ? '昨日' : (() => {
    const d = parseYmd(date);
    const md = `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
    return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}/${md}`;
  })();
  return time ? `${day} ${time.replace(/^0/, '')}` : day;
}

/** 'over' when the deadline has passed, 'soon' when it is today, otherwise null. */
export function dueState(date: string | null, time: string | null): 'over' | 'soon' | null {
  if (!date) return null;
  const t = today();
  if (date < t) return 'over';
  if (date > t) return null;
  return time && toMin(time) < nowMin() ? 'over' : 'soon';
}
