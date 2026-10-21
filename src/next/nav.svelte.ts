// Routes of the new design (all under /next while it is being built):
//   /next                    home
//   /next/events/:id         an event ("other" = tasks with no event)
// Links inside the app are plain <a href>; clicks on /next/… are handled here without a page load.
export type NxRoute = { name: 'home' } | { name: 'event'; id: string; tab: string };

function parse(): NxRoute {
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
