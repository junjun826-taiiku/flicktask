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
  /** The イベント this belongs to, if any. */
  event_id: string | null;
  /** 当日の担当 (role names of the event); empty = everyone. */
  roles: string[];
  place: string;
  /** 持ち物, free text. */
  items: string;
  /** 準備: names of the イベント担当 working on it. */
  assignees: string[];
  /** 予定: one tag (MTG / 読み合わせ / … ), '' = none. */
  tag: string;
};
export type Kind = 'task' | 'event';

/** 15 colours shared by events, roles and people (the first 7 are the original set, so old data stays valid). */
export const COLORS = ['blue', 'orange', 'violet', 'pink', 'green', 'teal', 'gray', 'red', 'yellow', 'brown', 'lime', 'sky', 'magenta', 'indigo', 'coral'] as const;
export type Color = (typeof COLORS)[number];
export const COLOR_HEX: Record<Color, string> = {
  blue: '#5b8def',
  orange: '#f0a43a',
  violet: '#8b6cf6',
  pink: '#e8609a',
  green: '#3cb371',
  teal: '#2fb5aa',
  gray: '#7a8699',
  red: '#e5534b',
  yellow: '#d4b106',
  brown: '#b07a4a',
  lime: '#7cc04a',
  sky: '#20a4d6',
  magenta: '#c560e0',
  indigo: '#4f6bd8',
  coral: '#ff8a5c',
};
export const COLOR_NAME: Record<Color, string> = {
  blue: '青', orange: 'オレンジ', violet: '紫', pink: 'ピンク', green: '緑', teal: '青緑', gray: 'グレー',
  red: '赤', yellow: '黄', brown: '茶', lime: '黄緑', sky: '水色', magenta: 'マゼンタ', indigo: '藍', coral: 'コーラル',
};
/** Built-in 予定 tags; an event can add its own. */
export const BUILTIN_TAGS = ['MTG', '読み合わせ', '幹部読み合わせ'] as const;
export type Role = { name: string; color: Color };
/** イベント担当: a person who runs the preparation (any number per event). */
export type Member = { name: string; color: Color };
/** イベント = 大会・行事. (A calendar-only Task with kind 'event' is a 予定 — a different thing.) */
export type FEvent = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  place: string;
  color: Color;
  roles: Role[];
  members: Member[];
  /** custom 予定 tags */
  tags: string[];
  /** メモ (連絡事項・来年への申し送り) */
  note: string;
  closed: boolean;
  created_at: number;
  updated_at: number;
  deleted: boolean;
};
export type EventDetails = Pick<FEvent, 'name' | 'start_date' | 'end_date' | 'place' | 'color' | 'roles' | 'note' | 'closed'> &
  Partial<Pick<FEvent, 'members' | 'tags'>>;

export type AiSuggestion = { title: string; due_date: string | null; due_time: string | null; recovered?: boolean };
/** recovered: list items the model skipped, added back as-is. rest: what didn't fit under the 30-task cap. */
export type AiSplit = { tasks: AiSuggestion[]; recovered: number; overflow: number; rest: string[] };
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export type Details = Pick<
  Task,
  'title' | 'note' | 'due_date' | 'due_time' | 'plan_date' | 'plan_start' | 'plan_end' | 'plan_end_date' | 'status' | 'kind' | 'event_id' | 'roles' | 'place' | 'items' | 'assignees' | 'tag'
>;

const EMPTY_DETAILS = {
  note: '',
  due_date: null,
  due_time: null,
  plan_date: null,
  plan_start: null,
  plan_end: null,
  plan_end_date: null,
  kind: 'task' as Kind,
  event_id: null,
  roles: [] as string[],
  place: '',
  items: '',
  assignees: [] as string[],
  tag: '',
};
/** Tasks saved before newer fields existed (or coming from an older server) get them filled in. */
const normalize = (t: any): Task => ({
  ...EMPTY_DETAILS,
  ...t,
  note: t.note ?? '',
  kind: t.kind === 'event' ? 'event' : 'task',
  event_id: t.event_id ?? null,
  roles: Array.isArray(t.roles) ? t.roles : [],
  place: t.place ?? '',
  items: t.items ?? '',
  assignees: Array.isArray(t.assignees) ? t.assignees : [],
  tag: typeof t.tag === 'string' ? t.tag : '',
});
const normalizeEvent = (e: any): FEvent => ({
  place: '',
  color: 'blue',
  note: '',
  ...e,
  roles: Array.isArray(e.roles) ? e.roles : [],
  members: Array.isArray(e.members) ? e.members : [],
  tags: Array.isArray(e.tags) ? e.tags : [],
  closed: !!e.closed,
  deleted: !!e.deleted,
});
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
const EVENTS_KEY = 'ft.events.v1';
const DIRTY_EVENTS_KEY = 'ft.dirtyEvents.v1';
const EVENT_FILTER_KEY = 'ft.eventFilter.v1';

/** The device keeps a working set, not the whole history: unfinished work plus roughly the last 60 days. */
const WINDOW_DAYS = 60;
/** Deleted items stay on the device briefly so 元に戻す still works, then disappear. */
const TOMBSTONE_KEEP_MS = 10 * 60 * 1000;
const windowFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Same rule as the server's working-set query, plus recent tombstones. Items of a running イベント always stay. */
function inWindow(t: Task, from: string, now: number, activeEvents: Set<string>) {
  if (t.deleted) return t.updated_at > now - TOMBSTONE_KEEP_MS;
  if (t.event_id && activeEvents.has(t.event_id)) return true;
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

/** Task order: by date (期限, else やる日), earliest on top, then time; undated ones last, newest first. */
const dateKey = (t: Task) => {
  const d = t.due_date ?? t.plan_date;
  return d ? `${d} ${t.due_date ? (t.due_time ?? '99:99') : (t.plan_start ?? '99:99')}` : null;
};
function byDate(a: Task, b: Task) {
  const ka = dateKey(a);
  const kb = dateKey(b);
  if (ka && kb) return ka < kb ? -1 : ka > kb ? 1 : b.created_at - a.created_at;
  if (ka || kb) return ka ? -1 : 1;
  return b.created_at - a.created_at;
}

class Store {
  tasks = $state<Task[]>(load<any[]>(TASKS_KEY, []).map(normalize));
  events = $state<FEvent[]>(load<any[]>(EVENTS_KEY, []).map(normalizeEvent));
  user = $state<User | null>(null);
  ready = $state(false);
  syncing = $state(false);
  filter = $state<Filter>('all');
  /** Home screen narrowed to one イベント (per device). null = everything. */
  eventFilter = $state<string | null>(load<string | null>(EVENT_FILTER_KEY, null));
  dirty = new Set<string>(load<string[]>(DIRTY_KEY, []));
  dirtyEvents = new Set<string>(load<string[]>(DIRTY_EVENTS_KEY, []));
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Events that exist (not deleted), soonest first. */
  liveEvents = $derived(this.events.filter((e) => !e.deleted).sort((a, b) => a.start_date.localeCompare(b.start_date)));
  /** Still running (not closed) — shown in the home switcher and kept on the device with all their items. */
  activeEvents = $derived(this.liveEvents.filter((e) => !e.closed));
  #activeIds = $derived(new Set(this.activeEvents.map((e) => e.id)));
  /** The event the home screen is narrowed to, if it still exists. */
  currentEvent = $derived(this.liveEvents.find((e) => e.id === this.eventFilter) ?? null);
  #inScope = (t: Task) => !this.currentEvent || t.event_id === this.currentEvent.id;

  visible = $derived(
    this.tasks
      .filter((t) => !t.deleted && t.kind === 'task' && this.#inScope(t) && (this.filter === 'all' || t.status === this.filter))
      .sort(byDate),
  );
  counts = $derived.by(() => {
    const c = { all: 0, todo: 0, doing: 0, done: 0 };
    for (const t of this.tasks) if (!t.deleted && t.kind === 'task' && this.#inScope(t)) (c.all++, c[t.status]++);
    return c;
  });
  /** Calendar-only entries that end today or later, in date/time order (all-day first within a day). */
  upcoming = $derived.by(() => {
    const today = localToday();
    return this.tasks
      .filter((t) => !t.deleted && t.kind === 'event' && this.#inScope(t) && t.plan_date && (t.plan_end_date ?? t.plan_date) >= today)
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
    const active = this.#activeIds;
    const expired = (t: Task) => t.deleted && !this.dirty.has(t.id) && !inWindow(t, from, now, active);
    // forget expired tombstones in memory too (they're already synced)
    if (this.tasks.some(expired)) this.tasks = this.tasks.filter((t) => !expired(t));
    if (this.events.some((e) => e.deleted && !this.dirtyEvents.has(e.id) && e.updated_at < now - TOMBSTONE_KEEP_MS))
      this.events = this.events.filter((e) => !(e.deleted && !this.dirtyEvents.has(e.id) && e.updated_at < now - TOMBSTONE_KEEP_MS));
    try {
      // only the working set (and anything not yet synced) is stored on the device
      const keep = this.tasks.filter((t) => this.dirty.has(t.id) || inWindow(t, from, now, active));
      localStorage.setItem(TASKS_KEY, JSON.stringify(keep));
      localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.dirty]));
      localStorage.setItem(EVENTS_KEY, JSON.stringify(this.events));
      localStorage.setItem(DIRTY_EVENTS_KEY, JSON.stringify([...this.dirtyEvents]));
      localStorage.setItem(EVENT_FILTER_KEY, JSON.stringify(this.eventFilter));
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

  /** New items land in the event the home screen is narrowed to, unless told otherwise. */
  add(title: string, at = Date.now(), extra: Partial<Details> = {}) {
    const text = title.trim();
    if (!text) return null;
    const task: Task = {
      id: crypto.randomUUID(),
      title: text,
      status: 'todo',
      created_at: at,
      updated_at: at,
      deleted: false,
      ...EMPTY_DETAILS,
      event_id: this.currentEvent?.id ?? null,
      ...extra,
    };
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
    const same = (a: unknown, b: unknown) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b);
    const changed = (Object.keys(patch) as (keyof Details)[]).some((k) => !same(t[k], patch[k]));
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

  // ---------- イベント ----------

  #touchEvent(id: string, patch: Partial<FEvent>) {
    const e = this.events.find((x) => x.id === id);
    if (!e) return;
    Object.assign(e, patch, { updated_at: Math.max(Date.now(), e.updated_at + 1) });
    this.dirtyEvents.add(id);
    this.#persist();
    this.scheduleSync();
  }
  createEvent(d: EventDetails) {
    const now = Date.now();
    const e: FEvent = { id: crypto.randomUUID(), created_at: now, updated_at: now, deleted: false, members: [], tags: [], ...d, name: d.name.trim() };
    if (e.end_date < e.start_date) e.end_date = e.start_date;
    this.events.push(e);
    this.dirtyEvents.add(e.id);
    this.#persist();
    this.scheduleSync();
    return e;
  }
  updateEvent(id: string, patch: Partial<EventDetails>) {
    const e = this.events.find((x) => x.id === id);
    if (!e) return;
    if (patch.name !== undefined && !patch.name.trim()) delete patch.name;
    if (patch.start_date && patch.end_date && patch.end_date < patch.start_date) patch.end_date = patch.start_date;
    const changed = (Object.keys(patch) as (keyof EventDetails)[]).some((k) => JSON.stringify(e[k]) !== JSON.stringify(patch[k]));
    if (changed) this.#touchEvent(id, patch);
  }
  /** Deleting an イベント keeps its tasks; they just stop belonging to it. */
  removeEvent(id: string) {
    this.#touchEvent(id, { deleted: true });
    if (this.eventFilter === id) this.setEventFilter(null);
  }
  restoreEvent(id: string) {
    this.#touchEvent(id, { deleted: false });
  }
  eventById(id: string | null | undefined) {
    return id ? (this.liveEvents.find((e) => e.id === id) ?? null) : null;
  }
  setEventFilter(id: string | null) {
    this.eventFilter = id;
    this.#persist();
  }
  /** A finished イベント's items are not kept on the device; fetch them when its page opens. */
  async loadEventTasks(id: string) {
    if (!this.user || this.#activeIds.has(id)) return;
    const key = `event:${id}`;
    if (this.#loadedRanges.has(key)) return;
    this.#loadedRanges.add(key);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(id)}/tasks`);
      if (res.ok) this.#merge(((await res.json()) as any[]).map(normalize));
    } catch {
      this.#loadedRanges.delete(key);
    }
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
    if (!this.user || (this.dirty.size === 0 && this.dirtyEvents.size === 0)) return;
    const ids = new Set(this.dirty);
    const eids = new Set(this.dirtyEvents);
    const payload = $state.snapshot(this.tasks.filter((t) => ids.has(t.id)));
    const eventPayload = $state.snapshot(this.events.filter((e) => eids.has(e.id)));
    this.syncing = true;
    try {
      const res = await fetch('/api/tasks/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-id': clientId },
        // events first so a new イベント exists before tasks point at it
        body: JSON.stringify({ events: eventPayload, tasks: payload }),
      });
      if (res.status === 401) return this.#signedOut();
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json().catch(() => ({}))) as { stale?: any[]; staleEvents?: any[] };
      // Only clear ids whose version we actually sent.
      for (const t of payload) {
        const cur = this.tasks.find((x) => x.id === t.id);
        if (!cur || cur.updated_at === t.updated_at) this.dirty.delete(t.id);
      }
      for (const e of eventPayload) {
        const cur = this.events.find((x) => x.id === e.id);
        if (!cur || cur.updated_at === e.updated_at) this.dirtyEvents.delete(e.id);
      }
      // the server already had a newer version of these (edited elsewhere meanwhile): take it
      if (body.stale?.length) this.#merge(body.stale.map(normalize));
      if (body.staleEvents?.length) this.#mergeEvents(body.staleEvents.map(normalizeEvent));
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
    const body = (await res.json()) as { tasks: any[]; events?: any[]; cursor: number; reset: boolean };
    const remoteEvents = (body.events ?? []).map(normalizeEvent);
    // events first: whether a task belongs in the working set depends on its event being active
    this.#mergeEvents(remoteEvents);
    const remote = body.tasks.map(normalize);
    this.#merge(remote, true);
    if (body.reset) {
      const seen = new Set(remote.map((r) => r.id));
      const seenEvents = new Set(remoteEvents.map((e) => e.id));
      const from = windowFrom();
      const now = Date.now();
      // gone from the server (or no longer in the working set): drop, unless we have unsynced edits
      this.tasks = this.tasks.filter((t) => seen.has(t.id) || this.dirty.has(t.id) || !inWindow(t, from, now, this.#activeIds));
      this.events = this.events.filter((e) => seenEvents.has(e.id) || this.dirtyEvents.has(e.id));
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
    const now = Date.now();
    const byId = new Map(this.tasks.map((t) => [t.id, t]));
    const drop = new Set<string>();
    for (const r of remote) {
      const local = byId.get(r.id);
      if (local && this.dirty.has(r.id)) continue;
      if (r.deleted) {
        if (local) drop.add(r.id);
      } else if (!local) {
        if (!workingSetOnly || inWindow(r, from, now, this.#activeIds)) this.tasks.push(r);
      } else if (r.updated_at > local.updated_at) {
        // update in place so open cards/sheets keep their identity
        Object.assign(local, r);
      }
    }
    if (drop.size) this.tasks = this.tasks.filter((t) => !drop.has(t.id));
  }

  #mergeEvents(remote: FEvent[]) {
    const byId = new Map(this.events.map((e) => [e.id, e]));
    const drop = new Set<string>();
    for (const r of remote) {
      const local = byId.get(r.id);
      if (local && this.dirtyEvents.has(r.id)) continue;
      if (r.deleted) {
        if (local) drop.add(r.id);
      } else if (!local) this.events.push(r);
      else if (r.updated_at > local.updated_at) Object.assign(local, r);
    }
    if (drop.size) this.events = this.events.filter((e) => !drop.has(e.id));
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
    this.events = [];
    this.dirty.clear();
    this.dirtyEvents.clear();
    this.eventFilter = null;
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
