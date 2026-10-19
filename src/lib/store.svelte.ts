// Local-first task store: every change lands in localStorage immediately, then syncs to the Worker when signed in.

export type Status = 'todo' | 'doing' | 'done';
export type Task = { id: string; title: string; status: Status; created_at: number; updated_at: number; deleted: boolean };
export type User = { id: string; email: string; name: string | null; picture: string | null };
export type Filter = 'all' | Status;

export const STATUS_ORDER: Status[] = ['todo', 'doing', 'done'];
export const STATUS_LABEL: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' };

const TASKS_KEY = 'ft.tasks.v1';
const DIRTY_KEY = 'ft.dirty.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

class Store {
  tasks = $state<Task[]>(load(TASKS_KEY, []));
  user = $state<User | null>(null);
  ready = $state(false);
  syncing = $state(false);
  filter = $state<Filter>('all');
  dirty = new Set<string>(load<string[]>(DIRTY_KEY, []));
  #timer: ReturnType<typeof setTimeout> | undefined;

  visible = $derived(
    this.tasks
      .filter((t) => !t.deleted && (this.filter === 'all' || t.status === this.filter))
      .sort((a, b) => b.created_at - a.created_at),
  );
  counts = $derived.by(() => {
    const c = { all: 0, todo: 0, doing: 0, done: 0 };
    for (const t of this.tasks) if (!t.deleted) (c.all++, c[t.status]++);
    return c;
  });

  #persist() {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(this.tasks));
      localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.dirty]));
    } catch {}
  }

  #touch(id: string, patch: Partial<Task>) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch, { updated_at: Math.max(Date.now(), t.updated_at + 1) });
    this.dirty.add(id);
    this.#persist();
    this.scheduleSync();
  }

  add(title: string, at = Date.now()) {
    const text = title.trim();
    if (!text) return null;
    const task: Task = { id: crypto.randomUUID(), title: text, status: 'todo', created_at: at, updated_at: at, deleted: false };
    this.tasks.unshift(task);
    this.dirty.add(task.id);
    this.#persist();
    this.scheduleSync();
    return task;
  }
  setStatus(id: string, status: Status) {
    this.#touch(id, { status });
  }
  shift(id: string, dir: 1 | -1) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    const i = STATUS_ORDER.indexOf(t.status) + dir;
    if (i >= 0 && i < STATUS_ORDER.length) this.setStatus(id, STATUS_ORDER[i]);
  }
  rename(id: string, title: string) {
    const text = title.trim();
    if (text) this.#touch(id, { title: text });
  }
  remove(id: string) {
    this.#touch(id, { deleted: true });
  }
  restore(id: string) {
    this.#touch(id, { deleted: false });
  }

  /** Consume memos typed into the boot skeleton before the bundle loaded. */
  drainBootQueue() {
    const q = load<{ text: string; at: number }[]>('ft.bootQueue', []);
    localStorage.removeItem('ft.bootQueue');
    for (const item of q) this.add(item.text, item.at);
  }

  scheduleSync(delay = 350) {
    if (!this.user) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.push(), delay);
  }

  async push() {
    if (!this.user || this.dirty.size === 0) return;
    const ids = [...this.dirty];
    const payload = $state.snapshot(this.tasks.filter((t) => ids.includes(t.id)));
    this.syncing = true;
    try {
      const res = await fetch('/api/tasks/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tasks: payload }),
      });
      if (res.status === 401) return this.#signedOut();
      if (!res.ok) throw new Error(String(res.status));
      // Only clear ids whose version we actually sent.
      for (const t of payload) {
        const cur = this.tasks.find((x) => x.id === t.id);
        if (!cur || cur.updated_at === t.updated_at) this.dirty.delete(t.id);
      }
      this.#persist();
    } catch {
      setTimeout(() => this.scheduleSync(0), 3000);
    } finally {
      this.syncing = false;
    }
  }

  async pull() {
    const res = await fetch('/api/tasks');
    if (res.status === 401) return this.#signedOut();
    if (!res.ok) return;
    const remote = (await res.json()) as Task[];
    const byId = new Map(this.tasks.map((t) => [t.id, t]));
    for (const r of remote) {
      const local = byId.get(r.id);
      if (!local || (!this.dirty.has(r.id) && r.updated_at >= local.updated_at)) byId.set(r.id, r);
    }
    this.tasks = [...byId.values()];
    this.#persist();
  }

  async init() {
    this.drainBootQueue();
    try {
      const res = await fetch('/api/me');
      this.user = res.ok ? await res.json() : null;
      if (this.user) {
        await this.push();
        await this.pull();
      }
    } catch {
      // offline: keep working from local data
    }
    this.ready = true;
    addEventListener('online', () => this.scheduleSync(0));
    document.addEventListener('visibilitychange', () => {
      if (!this.user) return;
      if (document.visibilityState === 'hidden') this.push();
      else this.pull();
    });
  }

  #signedOut() {
    this.user = null;
  }

  async logout() {
    await this.push();
    await fetch('/auth/logout', { method: 'POST' });
    this.user = null;
    this.tasks = [];
    this.dirty.clear();
    this.#persist();
  }

  async aiSplit(text: string): Promise<string[]> {
    const res = await fetch('/api/ai/split', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return ((await res.json()) as { tasks: string[] }).tasks;
  }
}

export const store = new Store();
