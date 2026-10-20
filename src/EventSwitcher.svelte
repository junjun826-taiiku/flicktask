<script lang="ts">
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { store, COLOR_HEX } from './lib/store.svelte';
  import { eventSheet } from './lib/eventSheet.svelte';
  import { router } from './lib/router.svelte';
  import { countdown, today } from './lib/dates';

  // running events only; finished ones live in the イベント list
  const running = $derived(store.activeEvents.filter((e) => e.end_date >= today()));
</script>

<div class="ev-switch" role="tablist" aria-label="イベント" data-testid="event-switcher">
  <button role="tab" class="ev-chip" class:on={!store.currentEvent} aria-selected={!store.currentEvent} onclick={() => store.setEventFilter(null)} data-testid="event-chip-all">すべて</button>
  {#each running as e (e.id)}
    {@const c = countdown(e.start_date, e.end_date)}
    {@const on = store.currentEvent?.id === e.id}
    <button
      role="tab"
      class="ev-chip"
      class:on
      aria-selected={on}
      onclick={() => (on ? router.openEvent(e.id) : store.setEventFilter(e.id))}
      title={on ? 'もう一度タップでイベントを開く' : e.name}
      animate:flip={{ duration: 300 }}
      in:scale={{ start: 0.7, duration: 380, easing: backOut }}
      data-testid="event-chip"
    >
      <i style="background:{COLOR_HEX[e.color]}"></i>{e.name}<small class:live={c.phase !== 'before'}>{c.label}</small>
    </button>
  {/each}
  <button class="ev-chip add" onclick={() => eventSheet.create()} aria-label="イベントを作成" data-testid="event-chip-add">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{running.length ? '' : 'イベント'}
  </button>
</div>
