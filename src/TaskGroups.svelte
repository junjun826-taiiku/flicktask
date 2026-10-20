<script lang="ts" module>
  /** newest task seen on this page; module-level so it survives the list being swapped out while an event is selected */
  let newest = -1;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, COLOR_HEX, type FEvent, type Task } from './lib/store.svelte';
  import { collapse } from './lib/motion';
  import { countdown } from './lib/dates';
  import TaskCard from './TaskCard.svelte';
  import Icon from './Icon.svelte';

  /** "すべて" on the home screen: one collapsible section per イベント, then the rest. */
  const OPEN_KEY = 'ft.openGroups.v1';
  const OTHER = '__other';

  function loadOpen(): string[] {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null') ?? [OTHER];
    } catch {
      return [OTHER];
    }
  }
  let open = $state<string[]>(loadOpen());
  function setOpen(key: string, on: boolean) {
    open = on ? [...open.filter((k) => k !== key), key] : open.filter((k) => k !== key);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open));
    } catch {}
  }

  type Group = { key: string; event: FEvent | null; items: Task[] };
  const groups = $derived.by(() => {
    const byEvent = new Map<string, Task[]>();
    const other: Task[] = [];
    for (const t of store.visible) {
      const e = store.eventById(t.event_id);
      if (!e) other.push(t);
      else byEvent.set(e.id, [...(byEvent.get(e.id) ?? []), t]);
    }
    const out: Group[] = store.liveEvents.filter((e) => byEvent.has(e.id)).map((e) => ({ key: e.id, event: e, items: byEvent.get(e.id)! }));
    if (other.length) out.push({ key: OTHER, event: null, items: other });
    return out;
  });
  const openCount = (items: Task[]) => items.filter((t) => t.status !== 'done').length;

  // a task added from the memo field opens its group, so it is never added out of sight
  if (newest < 0) newest = untrack(() => Math.max(0, ...store.tasks.map((t) => t.created_at)));
  $effect(() => {
    const fresh = store.visible.filter((t) => t.created_at > newest);
    if (!fresh.length) return;
    newest = Math.max(...fresh.map((t) => t.created_at));
    untrack(() => {
      for (const t of fresh) {
        const key = store.eventById(t.event_id) ? t.event_id! : OTHER;
        if (!open.includes(key)) setOpen(key, true);
      }
    });
  });
</script>

{#each groups as g, gi (g.key)}
  {@const isOpen = open.includes(g.key)}
  {@const c = g.event ? countdown(g.event.start_date, g.event.end_date) : null}
  <section class="tgroup glass" class:open={isOpen} animate:flip={{ duration: 360, easing: cubicOut }} in:fly|global={{ y: 18, duration: 480, delay: gi * 50, easing: backOut }} data-testid="task-group" data-group={g.key}>
    <button class="tg-head" aria-expanded={isOpen} onclick={() => setOpen(g.key, !isOpen)} data-testid="task-group-head">
      <i class="tg-dot" style="background:{g.event ? COLOR_HEX[g.event.color] : '#adb5bd'}"></i>
      <span class="tg-name">{g.event ? g.event.name : 'その他'}</span>
      {#if c && c.phase !== 'after'}<span class="tg-when" class:hot={c.phase !== 'before' || (c.days ?? 99) <= 7}>{c.label}</span>{/if}
      <span class="tg-count" data-testid="task-group-count">{openCount(g.items)}</span>
      <span class="tg-chev"><Icon name="down" size={16} /></span>
    </button>
    {#if isOpen}
      <div class="tg-body" transition:slide={{ duration: 320, easing: cubicOut }}>
        <ul class="list">
          {#each g.items as task, i (task.id)}
            <li animate:flip={{ duration: 420, easing: cubicOut }} in:fly={{ y: -18, duration: 460, easing: backOut }} out:collapse={{ duration: 360 }}>
              <TaskCard {task} hint={gi === 0 && i === 0} showEvent={false} />
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>
{/each}
