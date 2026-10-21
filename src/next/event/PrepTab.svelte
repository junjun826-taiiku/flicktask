<script lang="ts">
  import { store, COLOR_HEX, type FEvent } from '../../lib/store.svelte';
  import { forMember, NOBODY, prepOf } from './prep';
  import AddBar from './AddBar.svelte';
  import Board from './Board.svelte';
  import MemberTimeline from './MemberTimeline.svelte';
  import TaskPanel from './TaskPanel.svelte';

  let { event }: { event: FEvent | null } = $props();
  const VIEW_KEY = 'ft.prepView.v1';
  let view = $state<'board' | 'timeline'>(loadView());
  function loadView(): 'board' | 'timeline' {
    try {
      return localStorage.getItem(VIEW_KEY) === 'timeline' ? 'timeline' : 'board';
    } catch {
      return 'board';
    }
  }
  function setView(v: 'board' | 'timeline') {
    view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }
  let who = $state<string | null>(null);
  let selected = $state<string | null>(null);

  const members = $derived(event?.members ?? []);
  const all = $derived(prepOf(store.tasks, event, (id) => !!store.eventById(id)));
  const shown = $derived(all.filter(forMember(who)));
  const canTimeline = $derived(!!event);
  const effectiveView = $derived(canTimeline ? view : 'board');
  // a filter for someone who was removed from the event falls back to everyone
  $effect(() => {
    if (who && who !== NOBODY && !members.some((m) => m.name === who)) who = null;
  });
</script>

<section class="nx-panel prep" data-testid="nx-prep">
  <div class="tools">
    <AddBar {event} />
    {#if canTimeline}
      <div class="seg nx-chip" role="group" aria-label="表示">
        <button class:on={effectiveView === 'board'} aria-pressed={effectiveView === 'board'} onclick={() => setView('board')} data-testid="nx-view-board">状態別</button>
        <button class:on={effectiveView === 'timeline'} aria-pressed={effectiveView === 'timeline'} onclick={() => setView('timeline')} data-testid="nx-view-timeline">担当別タイムライン</button>
      </div>
    {/if}
  </div>
  {#if members.length}
    <div class="who" role="group" aria-label="担当で絞り込み" data-testid="nx-who">
      <button class:on={who === null} aria-pressed={who === null} onclick={() => (who = null)}>全員</button>
      {#each members as m (m.name)}
        <button class:on={who === m.name} aria-pressed={who === m.name} onclick={() => (who = m.name)}><i style="background:{COLOR_HEX[m.color]}">{m.name[0]}</i>{m.name}</button>
      {/each}
      <button class:on={who === NOBODY} aria-pressed={who === NOBODY} onclick={() => (who = NOBODY)}>担当なし</button>
    </div>
  {/if}

  {#if effectiveView === 'board'}
    <Board tasks={shown} {event} {selected} open={(id) => (selected = id)} />
  {:else}
    <MemberTimeline tasks={all} {event} {who} {selected} open={(id) => (selected = id)} />
  {/if}
</section>

{#if selected}
  <TaskPanel id={selected} {event} close={() => (selected = null)} />
{/if}

<style>
  .prep { padding: 16px 18px 18px; }
  .tools { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
  .seg { display: flex; padding: 3px; border-radius: 10px; }
  .seg button { height: 34px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; font-weight: 700; color: var(--sub); white-space: nowrap; }
  .seg button.on { color: var(--text); background: var(--hi); }
  .who { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; }
  .who button { height: 32px; padding: 0 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--sub); background: var(--chip); }
  .who button i { width: 20px; height: 20px; margin-left: -6px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; font-size: 10px; font-weight: 800; color: #fff; }
  .who button.on { color: var(--bg); background: var(--text); }
</style>
