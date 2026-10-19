// Local-first task store: every change lands in localStorage immediately, then syncs to the Worker when signed in.
import { stripBullet } from './bullets';

export type Status = 'todo' | 'doing' | 'done';
export type Task = {
  id: string;
  title: string;
  status: Status;
  created_at: number;
  updated_at: number;
  deleted: boolean;
  note: string;
  /** Deadline, local wall-clock. due_time null = end of that day. */
  due_date: string | null;
  due_time: string | null;
  /** Scheduled work block, local wall-clock 'YYYY-MM-DD' + 'HH:MM'. */
  plan_date: string | null;
  plan_start: string | null;
  plan_end: string | null;
  /** 'task' = to-do with a status; 'event' = calendar-only schedule entry (never in the task list). */
  kind: Kind;
};
export type Kind = 'task' | 'event';
export type AiSuggestion = { title: string; due_date: string | null; due_time: string | null; recovered?: boolean };
/** recovered: list items the model skipped, added back as-is. rest: what didn't fit under the 30-task cap. */
export type AiSplit = { tasks: AiSuggestion[]; recovered: number; overflow: number; rest: string[] };
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export type Details = Pick<Task, 'title' | 'note' | 'due_date' | 'due_time' | 'plan_date' | 'plan_start' | 'plan_end' | 'status' | 'kind'>;

const EMPTY_DETAILS = { note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, kind: 'task' as Kind };
/** Tasks saved before details existed (or coming from an older server) get the new fields filled in. */
const normalize = (t: any): Task => ({ ...EMPTY_DETAILS, ...t, note: t.note ?? '', kind: t.kind === 'event' ? 'event' : 'task' });
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
  tasks = $state<Task[]>(load<any[]>(TASKS_KEY, []).map(normalize));
  user = $state<User | null>(null);
  ready = $state(false);
  syncing = $state(false);
  filter = $state<Filter>('all');
  dirty = new Set<string>(load<string[]>(DIRTY_KEY, []));
  #timer: ReturnType<typeof setTimeout> | undefined;

  visible = $derived(
    this.tasks
      .filter((t) => !t.deleted && t.kind === 'task' && (this.filter === 'all' || t.status === this.filter))
      .sort((a, b) => b.created_at - a.created_at),
  );
  counts = $derived.by(() => {
    const c = { all: 0, todo: 0, doing: 0, done: 0 };
    for (const t of this.tasks) if (!t.deleted && t.kind === 'task') (c.all++, c[t.status]++);
    return c;
  });
  /** Calendar-only entries from today on, in date/time order (all-day first within a day). */
  upcoming = $derived.by(() => {
    const today = localToday();
    return this.tasks
      .filter((t) => !t.deleted && t.kind === 'event' && t.plan_date && t.plan_date >= today)
      .sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || (a.plan_start ?? '').localeCompare(b.plan_start ?? ''));
  });
  /** Which half of the home screen is showing on phones (both show side by side on wide screens). */
  pane = $state<'tasks' | 'schedule'>('tasks');

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

  add(title: string, at = Date.now(), extra: Partial<Details> = {}) {
    const text = title.trim();
    if (!text) return null;
    const task: Task = { id: crypto.randomUUID(), title: text, status: 'todo', created_at: at, updated_at: at, deleted: false, ...EMPTY_DETAILS, ...extra };
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
  /** Save the detail sheet. Only writes when something actually changed. */
  update(id: string, patch: Partial<Details>) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    if (patch.title !== undefined && !patch.title.trim()) delete patch.title;
    if (patch.due_date === null) patch.due_time = null;
    if (patch.plan_date === null) (patch.plan_start = null), (patch.plan_end = null);
    const changed = (Object.keys(patch) as (keyof Details)[]).some((k) => t[k] !== patch[k]);
    if (changed) this.#touch(id, patch);
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
    // same rules as Enter in the composer: one task per line, list markers removed, first line on top
    for (const item of q) {
      const lines = item.text.split('\n').map(stripBullet).filter(Boolean);
      lines.forEach((l, i) => this.add(l, item.at + lines.length - 1 - i));
    }
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
    const remote = ((await res.json()) as any[]).map(normalize);
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

  /** AI split. Sends the local date so "明日" / "金曜" resolve in the user's time zone. */
  async aiSplit(text: string): Promise<AiSplit> {
    const res = await fetch('/api/ai/split', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, today: localToday() }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as Partial<AiSplit>;
    return { tasks: j.tasks ?? [], recovered: j.recovered ?? 0, overflow: j.overflow ?? 0, rest: j.rest ?? [] };
  }
}

export const store = new Store();
