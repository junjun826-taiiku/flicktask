// Minimal History-API router: "/" (memo + list), "/calendar?m=YYYY-MM-01" (month), "/calendar/YYYY-MM-DD" (day).
// history.state.depth counts screens pushed by the app, so in-app Back pops real history entries
// (the OS/browser back gesture then behaves the same), and a deep link falls back to the parent screen.
import { isValidYmd, monthOf, today } from './dates';

export type Route = { name: 'home' } | { name: 'month'; month: string } | { name: 'day'; date: string };

function parse(): Route {
  const m = location.pathname.match(/^\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
  if (!m) return { name: 'home' };
  if (m[1] && isValidYmd(m[1])) return { name: 'day', date: m[1] };
  const q = new URLSearchParams(location.search).get('m');
  return { name: 'month', month: isValidYmd(q) ? monthOf(q) : monthOf(today()) };
}

const depth = () => (history.state?.depth as number) ?? 0;

class Router {
  route = $state<Route>(parse());
  /** +1 when going deeper, -1 when going back or to an earlier date; drives slide direction. */
  dir = $state<1 | -1>(1);
  /** Month the month view shows; kept while visiting a day so Back lands on it. */
  month = $state(monthOf(today()));

  constructor() {
    this.#syncMonth();
    addEventListener('popstate', () => {
      const prev = this.route;
      this.route = parse();
      this.dir = rank(this.route) < rank(prev) ? -1 : 1;
      this.#syncMonth();
    });
  }
  #syncMonth() {
    if (this.route.name === 'month') this.month = this.route.month;
    if (this.route.name === 'day') this.month = monthOf(this.route.date);
  }
  #set(url: string, dir: 1 | -1, mode: 'push' | 'replace') {
    this.dir = dir;
    if (mode === 'push') history.pushState({ depth: depth() + 1 }, '', url);
    else history.replaceState({ depth: depth() }, '', url);
    this.route = parse();
    this.#syncMonth();
  }

  openMonth(month = this.month) {
    this.#set(`/calendar?m=${month}`, 1, 'push');
  }
  openDay(date: string) {
    this.#set(`/calendar/${date}`, 1, 'push');
  }
  /** Paging months/days replaces the entry, so Back still goes up a level instead of through every page. */
  setMonth(month: string, dir: 1 | -1) {
    this.#set(`/calendar?m=${month}`, dir, 'replace');
  }
  setDay(date: string, dir: 1 | -1) {
    this.month = monthOf(date);
    this.#set(`/calendar/${date}`, dir, 'replace');
  }
  back() {
    if (depth() > 0) return history.back();
    // deep-linked: replace with the parent screen
    if (this.route.name === 'day') this.#set(`/calendar?m=${this.month}`, -1, 'replace');
    else this.#set('/', -1, 'replace');
  }
}

const rank = (r: Route) => (r.name === 'home' ? 0 : r.name === 'month' ? 1 : 2);

export const router = new Router();
