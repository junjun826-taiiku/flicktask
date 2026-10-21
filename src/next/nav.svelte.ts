// Routes:
//   /                        home
//   /events/:id              an event ("other" = tasks with no event); ?tab=prep|day|sched|memo
//   /calendar?m=&d=          month view (d = the day listed on the right)
//   /events/:id/live         当日モード (its own shell, see main.ts)
// Links inside the app are plain <a href>; clicks on in-app paths are handled here without a page load.
export type NxRoute = { name: 'home' } | { name: 'event'; id: string; tab: string } | { name: 'calendar'; month: string; day: string | null };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Addresses from before the redesign (and the /next preview) still land somewhere sensible. */
function legacy(path: string, search: string): string | null {
  if (path === '/next' || path.startsWith('/next/')) return (path.slice(5) || '/') + search;
  if (path === '/events' || path === '/events/') return '/';
  const day = path.match(/^\/calendar\/(\d{4}-\d{2}-\d{2})\/?$/);
  if (day) return `/calendar?m=${day[1].slice(0, 7)}-01&d=${day[1]}`;
  return null;
}

function parse(): NxRoute {
  const moved = legacy(location.pathname, location.search);
  if (moved) history.replaceState(history.state, '', moved);
  const path = location.pathname;
  const q = new URLSearchParams(location.search);
  if (/^\/calendar\/?$/.test(path)) {
    const d = q.get('d');
    const m = q.get('m');
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return { name: 'calendar', month: m && YMD.test(m) ? `${m.slice(0, 7)}-01` : d && YMD.test(d) ? `${d.slice(0, 7)}-01` : thisMonth, day: d && YMD.test(d) ? d : null };
  }
  const m = path.match(/^\/events\/([^/]+)\/?$/);
  if (m) return { name: 'event', id: decodeURIComponent(m[1]), tab: q.get('tab') ?? 'prep' };
  return { name: 'home' };
}
/** Paths this app handles itself (当日モード is a separate page). */
const inApp = (href: string) => href === '/' || href.startsWith('/?') || href.startsWith('/calendar') || (href.startsWith('/events/') && !/\/live\/?(\?|$)/.test(href));

class Nav {
  route = $state<NxRoute>(parse());
  /** phone: the mini calendar is folded away behind a header button */
  calOpen = $state(false);
  /** the event editor: an event id, "new", or closed */
  editing = $state<string | null>(null);
  constructor() {
    addEventListener('popstate', () => (this.route = parse()));
  }
  go(url: string) {
    if (url === location.pathname + location.search) return;
    history.pushState({}, '', url);
    this.route = parse();
    scrollTo({ top: 0 });
  }
  /** Delegate clicks on in-app links. */
  click = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href || a.target || !inApp(href)) return;
    e.preventDefault();
    this.go(href);
  };
}
export const nav = new Nav();

/** 当日モード is a separate page: remember where to come back to. */
export function rememberReturn() {
  try {
    sessionStorage.setItem('ft.liveReturn', location.pathname + location.search);
  } catch {}
}
