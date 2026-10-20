// Local-first task store: every change lands in localStorage immediately, then syncs to the Worker when signed in.
import { stripBullet } from './bullets';
import { clientId } from './client-id';

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
  /** Last day of a multi-day (all-day) entry, inclusive. null = single day. */
  plan_end_date: string | null;
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
export type Details = Pick<Task, 'title' | 'note' | 'due_date' | 'due_time' | 'plan_date' | 'plan_start' | 'plan_end' | 'plan_end_date' | 'status' | 'kind'>;

const EMPTY_DETAILS = { note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null, plan_end_date: null, kind: 'task' as Kind };
/** Tasks saved before details existed (or coming from an older server) get the new fields filled in. */
const normalize = (t: any): Task => ({ ...EMPTY_DETAILS, ...t, note: t.note ?? '', kind: t.kind === 'event' ? 'event' : 'task' });
export type User = { id: string; email: string; name: string | null; picture: string | null };
export type Filter = 'all' | Status;

/** Does this item's scheduled date (or multi-day range) include `date`? */
export const coversDate = (t: Pick<Task, 'plan_date' | 'plan_end_date'>, date: string) =>
  !!t.plan_date && t.plan_date <= date && date <= (t.plan_end_date ?? t.plan_date);

export const STATUS_ORDER: Status[] = ['todo', 'doing', 'done'];
export const STATUS_LABEL: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' };

const TASKS_KEY = 'ft.tasks.v1';
const DIRTY_KEY = 'ft.dirty.v1';
const CURSOR_KEY = 'ft.cursor.v1';

/** The device keeps a working set, not the whole history: unfinished work plus roughly the last 60 days. */
const WINDOW_DAYS = 60;
/** Deleted items stay on the device briefly so 元に戻す still works, then disappear. */
const TOMBSTONE_KEEP_MS = 10 * 60 * 1000;
const windowFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Same rule as the server's working-set query, plus recent tombstones. */
function inWindow(t: Task, from = windowFrom(), now = Date.now()) {
  if (t.deleted) return t.updated_at > now - TOMBSTONE_KEEP_MS;
  if (t.kind === 'event') return (t.plan_end_date ?? t.plan_date ?? '9999-12-31') >= from;
  return (
    t.status !== 'done' ||
    t.updated_at >= now - WINDOW_DAYS * 86_400_000 ||
    (t.plan_end_date ?? t.plan_date ?? '') >= from ||
    (t.due_date ?? '') >= from
  );
}

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
  /** Calendar-only entries that end today or later, in date/time order (all-day first within a day). */
  upcoming = $derived.by(() => {
    const today = localToday();
    return this.tasks
      .filter((t) => !t.deleted && t.kind === 'event' && t.plan_date && (t.plan_end_date ?? t.plan_date) >= today)
      .sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || (a.plan_start ?? '').localeCompare(b.plan_start ?? ''));
  });
  /** Which half of the home screen is showing on phones (both show side by side on wide screens). */
  pane = $state<'tasks' | 'schedule'>('tasks');

  /** Server sync position for this account: { user, cursor }. */
  #cursor = load<{ user: string; cursor: number } | null>(CURSOR_KEY, null);
  #loadedRanges = new Set<string>();

  #persist() {
    const from = windowFrom();
    const now = Date.now();
    // forget expired tombstones in memory too (they're already synced)
    if (this.tasks.some((t) => t.deleted && !this.dirty.has(t.id) && !inWindow(t, from, now)))
      this.tasks = this.tasks.filter((t) => !(t.deleted && !this.dirty.has(t.id) && !inWindow(t, from, now)));
    try {
      // only the working set (and anything not yet synced) is stored on the device
      const keep = this.tasks.filter((t) => this.dirty.has(t.id) || inWindow(t, from, now));
      localStorage.setItem(TASKS_KEY, JSON.stringify(keep));
      localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.dirty]));
      if (this.#cursor) localStorage.setItem(CURSOR_KEY, JSON.stringify(this.#cursor));
      else localStorage.removeItem(CURSOR_KEY);
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
    if (patch.plan_date === null) (patch.plan_start = null), (patch.plan_end = null), (patch.plan_end_date = null);
    // multi-day entries are all-day
    if (patch.plan_end_date && patch.plan_date && patch.plan_end_date > patch.plan_date) (patch.plan_start = null), (patch.plan_end = null);
    else if (patch.plan_end_date !== undefined && (!patch.plan_end_date || patch.plan_end_date <= (patch.plan_date ?? t.plan_date ?? ''))) patch.plan_end_date = null;
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
        headers: { 'content-type': 'application/json', 'x-client-id': clientId },
        body: JSON.stringify({ tasks: payload }),
      });
      if (res.status === 401) return this.#signedOut();
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json().catch(() => ({}))) as { stale?: any[] };
      // Only clear ids whose version we actually sent.
      for (const t of payload) {
        const cur = this.tasks.find((x) => x.id === t.id);
        if (!cur || cur.updated_at === t.updated_at) this.dirty.delete(t.id);
      }
      // the server already had a newer version of these (edited elsewhere meanwhile): take it
      if (body.stale?.length) this.#merge(body.stale.map(normalize));
      this.#persist();
    } catch {
      setTimeout(() => this.scheduleSync(0), 3000);
    } finally {
      this.syncing = false;
    }
  }

  #pulling: Promise<void> | null = null;
  #pullAgain = false;
  /** Fetch the server's copy and merge it in. Calls that arrive mid-pull collapse into one more pull. */
  async pull(): Promise<void> {
    if (this.#pulling) {
      this.#pullAgain = true;
      return this.#pulling;
    }
    this.#pulling = this.#pullOnce().finally(() => {
      this.#pulling = null;
      if (this.#pullAgain) {
        this.#pullAgain = false;
        this.pull();
      }
    });
    return this.#pulling;
  }

  /**
   * Incremental: ask for what changed since our cursor. First time (or after a long absence) the server
   * sends a fresh working set with reset=true, and anything we hold that it didn't mention is dropped.
   */
  async #pullOnce() {
    if (!this.user) return;
    const mine = this.#cursor?.user === this.user.id ? this.#cursor.cursor : 0;
    const url = mine
      ? `/api/tasks/changes?since=${mine}`
      : `/api/tasks/changes?from=${windowFrom()}&cutoff=${Date.now() - WINDOW_DAYS * 86_400_000}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      return; // offline
    }
    if (res.status === 401) return this.#signedOut();
    if (!res.ok) return;
    const body = (await res.json()) as { tasks: any[]; cursor: number; reset: boolean };
    const remote = body.tasks.map(normalize);
    this.#merge(remote, true);
    if (body.reset) {
      const seen = new Set(remote.map((r) => r.id));
      const from = windowFrom();
      // gone from the server (or no longer in the working set): drop, unless we have unsynced edits
      this.tasks = this.tasks.filter((t) => seen.has(t.id) || this.dirty.has(t.id) || !inWindow(t, from));
    }
    this.#cursor = { user: this.user.id, cursor: body.cursor };
    this.#persist();
  }

  /**
   * Last-write-wins merge of server rows; never overwrites unsynced local edits.
   * workingSetOnly: don't bring in items outside the device's working set (sync); calendar ranges pass false.
   */
  #merge(remote: Task[], workingSetOnly = false) {
    const from = windowFrom();
    const byId = new Map(this.tasks.map((t) => [t.id, t]));
    const drop = new Set<string>();
    for (const r of remote) {
      const local = byId.get(r.id);
      if (local && this.dirty.has(r.id)) continue;
      if (r.deleted) {
        if (local) drop.add(r.id);
      } else if (!local) {
        if (!workingSetOnly || inWindow(r, from)) this.tasks.push(r);
      } else if (r.updated_at > local.updated_at) {
        // update in place so open cards/sheets keep their identity
        Object.assign(local, r);
      }
    }
    if (drop.size) this.tasks = this.tasks.filter((t) => !drop.has(t.id));
  }

  /** Calendar months older than the working set are fetched when viewed (not stored on the device). */
  async loadRange(from: string, to: string) {
    // a range that starts inside the working set is already on the device
    if (!this.user || from >= windowFrom()) return;
    const key = `${from}~${to}`;
    if (this.#loadedRanges.has(key)) return;
    this.#loadedRanges.add(key);
    try {
      const res = await fetch(`/api/tasks/range?from=${from}&to=${to}`);
      if (res.ok) this.#merge(((await res.json()) as any[]).map(normalize));
    } catch {
      this.#loadedRanges.delete(key);
    }
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
    // flush pending saves when the app goes to the background (pulling on return is live.svelte.ts's job)
    document.addEventListener('visibilitychange', () => {
      if (this.user && document.visibilityState === 'hidden') this.push();
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
    this.#cursor = null;
    this.#loadedRanges.clear();
    this.#persist();
  }

  /** Download everything the account has as a JSON backup (handled by the browser as a file). */
  exportBackup() {
    location.href = '/api/export';
  }

  /** Restore a backup file into this account. Returns how many were added / merged. */
  async importBackup(file: File): Promise<{ added: number; merged: number }> {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('ファイルを読み込めませんでした');
    }
    await this.push(); // don't let a restore race our own unsynced edits
    const res = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = (await res.json().catch(() => ({}))) as { added?: number; merged?: number; error?: string };
    if (!res.ok) throw new Error(body.error === 'not a Flick backup' ? 'Flickのバックアップファイルではありません' : '読み込みに失敗しました');
    await this.pull();
    return { added: body.added ?? 0, merged: body.merged ?? 0 };
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
