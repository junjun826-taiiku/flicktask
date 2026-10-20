<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, COLOR_HEX } from './lib/store.svelte';
  import { router } from './lib/router.svelte';
  import { eventSheet } from './lib/eventSheet.svelte';
  import { countdown, dueState, rangeLabel, shortLabel, today } from './lib/dates';
  import { nextUp, progress, targetDate } from './lib/eventView';

  const t0 = $derived(today());
  // running first (soonest on top); finished ones fold away at the bottom
  const running = $derived(store.liveEvents.filter((e) => !e.closed && e.end_date >= t0));
  const finished = $derived(store.liveEvents.filter((e) => e.closed || e.end_date < t0).reverse());
  let showFinished = $state(false);
</script>

<header class="cal-head">
  <button class="nav-btn glass" onclick={() => router.back()} aria-label="戻る" data-testid="events-back">
    <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
  </button>
  <h1>イベント</h1>
  <button class="head-action" onclick={() => eventSheet.create()} data-testid="event-create">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>作成
  </button>
</header>

<div class="ev-scroll">
  {#each running as e, i (e.id)}
    {@const p = progress(store.tasks, e)}
    {@const c = countdown(e.start_date, e.end_date)}
    {@const next = nextUp(store.tasks, e)}
    <button class="ev-card glass" onclick={() => router.openEvent(e.id)} in:fly={{ y: 18, duration: 460, delay: i * 50, easing: backOut }} data-testid="meet-card">
      <span class="ev-top">
        <span class="ev-name-block">
          <span class="ev-name"><i style="background:{COLOR_HEX[e.color]}"></i>{e.name}</span>
          <span class="ev-sub">{rangeLabel(e.start_date, e.end_date)}{e.place ? `・${e.place}` : ''}</span>
        </span>
        <span class="ev-count" class:live={c.phase !== 'before'}>
          {#if c.phase === 'before'}
            <small>本番まで</small><strong data-testid="event-days">{c.days}日</strong>
          {:else}
            <strong data-testid="event-days">{c.label}</strong>
          {/if}
        </span>
      </span>
      <span class="ev-progress">
        <span class="ev-progress-label"><span>準備</span><span data-testid="event-progress">{p.done} / {p.total} 完了</span></span>
        <span class="bar"><i style="width:{p.total ? (p.done / p.total) * 100 : 0}%; background:{COLOR_HEX[e.color]}"></i></span>
      </span>
      {#if next}
        <span class="ev-next">
          <span class="chip due-chip" data-due={dueState(targetDate(next), next.due_time)}>{shortLabel(targetDate(next)!, next.due_time)}</span>
          <span>{next.title}</span>
        </span>
      {/if}
    </button>
  {/each}

  {#if store.ready && running.length === 0}
    <div class="empty" data-testid="events-empty">
      <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M12 42V8M12 8h22l-4 8 4 8H12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" /></svg>
      <span>イベントなし</span>
    </div>
  {/if}

  {#if finished.length}
    <button class="ev-finished glass" onclick={() => (showFinished = !showFinished)} aria-expanded={showFinished} data-testid="events-finished">
      <span>終了したイベント</span><span>{finished.length}件 {showFinished ? '▴' : '▾'}</span>
    </button>
    {#if showFinished}
      <div transition:slide={{ duration: 300, easing: cubicOut }}>
        {#each finished as e (e.id)}
          <button class="ev-row" onclick={() => router.openEvent(e.id)} data-testid="finished-event">
            <i style="background:{COLOR_HEX[e.color]}"></i>
            <span>{e.name}</span>
            <small>{rangeLabel(e.start_date, e.end_date)}</small>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
