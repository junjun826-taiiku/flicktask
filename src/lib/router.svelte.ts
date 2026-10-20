// Minimal History-API router:
//   "/"                          memo + lists
//   "/calendar?m=YYYY-MM-01"     month          "/calendar/YYYY-MM-DD"  day
//   "/events"                    イベント一覧    "/events/:id?tab=…"     イベント詳細
//   "/events/:id/live"           当日モード
// history.state.depth counts screens pushed by the app, so in-app Back pops real history entries
// (the OS/browser back gesture then behaves the same), and a deep link falls back to the parent screen.
import { isValidYmd, monthOf, today } from './dates';

export type EventTab = 'prep' | 'day' | 'sched';
export type Route =
  | { name: 'home' }
  | { name: 'month'; month: string }
  | { name: 'day'; date: string }
  | { name: 'events' }
  | { name: 'event'; id: string; tab: EventTab }
  | { name: 'live'; id: string };

function parse(): Route {
  const p = location.pathname;
  const q = new URLSearchParams(location.search);
  const ev = p.match(/^\/events(?:\/([^/]+)(\/live)?)?\/?$/);
  if (ev) {
    if (!ev[1]) return { name: 'events' };
    const id = decodeURIComponent(ev[1]);
    if (ev[2]) return { name: 'live', id };
    const tab = q.get('tab');
    return { name: 'event', id, tab: tab === 'day' || tab === 'sched' ? tab : 'prep' };
  }
  const m = p.match(/^\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
  if (!m) return { name: 'home' };
  if (m[1] && isValidYmd(m[1])) return { name: 'day', date: m[1] };
  const mq = q.get('m');
  return { name: 'month', month: isValidYmd(mq) ? monthOf(mq) : monthOf(today()) };
}

const depth = () => (history.state?.depth as number) ?? 0;
/** How deep a screen sits; decides slide direction on Back/Forward. */
const rank = (r: Route) => ({ home: 0, month: 1, events: 1, day: 2, event: 2, live: 3 })[r.name];
/** Where a deep-linked screen's own Back button goes when there is no app history to pop. */
function parentUrl(r: Route, month: string) {
  if (r.name === 'day') return `/calendar?m=${month}`;
  if (r.name === 'event') return '/events';
  if (r.name === 'live') return `/events/${encodeURIComponent(r.id)}?tab=day`;
  return '/';
}

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
  openEvents() {
    this.#set('/events', 1, 'push');
  }
  openEvent(id: string, tab: EventTab = 'prep') {
    this.#set(`/events/${encodeURIComponent(id)}${tab === 'prep' ? '' : `?tab=${tab}`}`, 1, 'push');
  }
  /** Switching tabs replaces the entry (Back leaves the event rather than stepping through tabs). */
  setEventTab(id: string, tab: EventTab) {
    this.#set(`/events/${encodeURIComponent(id)}${tab === 'prep' ? '' : `?tab=${tab}`}`, 1, 'replace');
  }
  openLive(id: string) {
    this.#set(`/events/${encodeURIComponent(id)}/live`, 1, 'push');
  }
  back() {
    if (depth() > 0) return history.back();
    // deep-linked: replace with the parent screen
    this.#set(parentUrl(this.route, this.month), -1, 'replace');
  }
  /** Leave whatever overlay is open and return to the memo screen. */
  home() {
    if (depth() > 0) return history.go(-depth());
    this.#set('/', -1, 'replace');
  }
}

export const router = new Router();
