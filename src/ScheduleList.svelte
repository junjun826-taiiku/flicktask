<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store } from './lib/store.svelte';
  import { sheet } from './lib/sheet.svelte';
  import { collapse } from './lib/motion';
  import { dayLabel, shortLabel, today } from './lib/dates';

  // group calendar-only entries by date, today first
  const groups = $derived.by(() => {
    const out: { date: string; items: typeof store.upcoming }[] = [];
    for (const e of store.upcoming) {
      const last = out[out.length - 1];
      if (last?.date === e.plan_date) last.items.push(e);
      else out.push({ date: e.plan_date!, items: [e] });
    }
    return out;
  });

  const heading = (d: string) => {
    const s = shortLabel(d);
    return s === '今日' || s === '明日' ? `${s} ${dayLabel(d)}` : dayLabel(d);
  };

  function add() {
    sheet.create({ kind: 'event', plan_date: today(), plan_start: null, plan_end: null });
  }
</script>

<div class="schedule" data-testid="schedule-list">
  <div class="schedule-head">
    <button class="add-event glass" onclick={add} data-testid="add-event">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      予定
    </button>
  </div>

  {#each groups as g (g.date)}
    <section class="day-group" animate:flip={{ duration: 400, easing: cubicOut }} in:fly={{ y: 16, duration: 460, easing: backOut }} out:collapse={{ duration: 300 }}>
      <h3 class:today={g.date === today()}>{heading(g.date)}</h3>
      <ul>
        {#each g.items as e (e.id)}
          <li animate:flip={{ duration: 400, easing: cubicOut }} in:fly={{ x: 20, duration: 420, easing: backOut }} out:collapse={{ duration: 300 }}>
            <button class="event-card glass" onclick={() => sheet.edit(e.id)} data-testid="event-card">
              <span class="event-time" class:allday={!e.plan_start}>
                {#if e.plan_start}
                  <strong>{e.plan_start}</strong>
                  {#if e.plan_end}<span>{e.plan_end}</span>{/if}
                {:else}
                  <strong>終日</strong>
                {/if}
              </span>
              <span class="event-bar" aria-hidden="true"></span>
              <span class="event-body">
                <span class="event-title" data-testid="event-title">{e.title}</span>
                {#if e.note}<span class="event-note">{e.note}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if store.ready && groups.length === 0}
    <div class="empty" in:scale={{ start: 0.85, duration: 500, delay: 150, easing: backOut }} data-testid="schedule-empty">
      <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <rect x="9" y="11" width="30" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 5" />
        <path d="M9 19h30M17 7v8M31 7v8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      <span>予定なし</span>
    </div>
  {/if}
</div>
