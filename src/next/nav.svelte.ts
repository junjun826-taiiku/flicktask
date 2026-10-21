// Routes of the new design (all under /next while it is being built):
//   /next                    home
//   /next/events/:id         an event ("other" = tasks with no event)
//   /next/calendar?m=&d=     month view (d = the day listed on the right)
// Links inside the app are plain <a href>; clicks on /next/… are handled here without a page load.
export type NxRoute = { name: 'home' } | { name: 'event'; id: string; tab: string } | { name: 'calendar'; month: string; day: string | null };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
function parse(): NxRoute {
  if (/^\/next\/calendar\/?$/.test(location.pathname)) {
    const q = new URLSearchParams(location.search);
    const d = q.get('d');
    const m = q.get('m');
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return { name: 'calendar', month: m && YMD.test(m) ? `${m.slice(0, 7)}-01` : d && YMD.test(d) ? `${d.slice(0, 7)}-01` : thisMonth, day: d && YMD.test(d) ? d : null };
  }
  const m = location.pathname.match(/^\/next\/events\/([^/]+)\/?$/);
  if (m) return { name: 'event', id: decodeURIComponent(m[1]), tab: new URLSearchParams(location.search).get('tab') ?? 'prep' };
  return { name: 'home' };
}

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
    if (!a || !href || a.target || !(href === '/next' || href.startsWith('/next/') || href.startsWith('/next?'))) return;
    e.preventDefault();
    this.go(href);
  };
}
export const nav = new Nav();

/** 当日モード is still the current app's screen: remember where to come back to. */
export function rememberReturn() {
  try {
    sessionStorage.setItem('ft.liveReturn', location.pathname + location.search);
  } catch {}
}
