<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { store } from './lib/store.svelte';
  import { router } from './lib/router.svelte';
  import { addMonths, monthGrid, monthLabel, monthOf, today, WEEKDAYS } from './lib/dates';
  import { monthItems } from './lib/calendar';
  import { useSwipe } from './lib/swipe';

  let { month }: { month: string } = $props();

  const days = $derived(monthGrid(month));
  // months older than the device's working set are fetched on demand
  $effect(() => void store.loadRange(days[0], days[days.length - 1]));
  const t = $derived(today());
  // how many items fit in a cell: measured from the row height so phones show 2 and desktops more
  let viewportH = $state(600);
  // cell = 8px padding + 23px date, then 18px per item; a "+n" line takes 14px
  const rowH = $derived((viewportH - 15) / 6);
  const fitAll = $derived(Math.max(1, Math.floor((rowH - 31) / 18)));
  const fitWithMore = $derived(Math.max(1, Math.floor((rowH - 45) / 18)));

  /** where a multi-day bar's name is written: its first day and each week row it wraps onto, across the whole run */
  const barLabels = $derived.by(() => {
    const out: { key: string; title: string; kind: string; color?: string; row: number; col: number; run: number; slot: number }[] = [];
    days.forEach((d, i) => {
      const items = monthItems(store.tasks, d, store.liveEvents);
      const shown = items.length > fitAll ? fitWithMore : fitAll;
      items.slice(0, shown).forEach((it, slot) => {
        if (it.span === 'single' || !(it.span === 'start' || i % 7 === 0)) return;
        let run = 1;
        while ((i + run) % 7 !== 0 && i + run < days.length && days[i + run] <= it.end) run++;
        out.push({ key: `${it.task.id}:${d}`, title: it.task.title, kind: it.kind, color: it.color, row: Math.floor(i / 7), col: i % 7, run, slot });
      });
    });
    return out;
  });

  const page = (n: 1 | -1) => router.setMonth(addMonths(month, n), n);
  const swipe = useSwipe((dir) => page(dir));
</script>

<header class="cal-head">
  <button class="nav-btn glass" onclick={() => router.back()} aria-label="戻る" data-testid="cal-back">
    <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
  </button>
  {#key month}
    <h1 in:fly={{ y: 8 * router.dir, duration: 360, easing: cubicOut }} data-testid="month-title">{monthLabel(month)}</h1>
  {/key}
  <div class="cal-actions glass">
    <button onclick={() => page(-1)} aria-label="前の月" data-testid="month-prev"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
    <button class="today-btn" onclick={() => router.setMonth(monthOf(t), monthOf(t) < month ? -1 : 1)} data-testid="month-today">今日</button>
    <button onclick={() => page(1)} aria-label="次の月" data-testid="month-next"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
  </div>
</header>

<div class="weekdays" aria-hidden="true">
  {#each WEEKDAYS as w, i}<span class:sun={i === 0} class:sat={i === 6}>{w}</span>{/each}
</div>

<div class="month-viewport" bind:clientHeight={viewportH} {...swipe}>
  {#key month}
    <div
      class="month-grid"
      in:fly={{ x: 60 * router.dir, duration: 420, easing: cubicOut }}
      data-testid="month-grid"
    >
      {#each days as d, i (d)}
        {@const items = monthItems(store.tasks, d, store.liveEvents)}
        {@const out = d.slice(0, 7) !== month.slice(0, 7)}
        {@const shown = items.length > fitAll ? fitWithMore : fitAll}
        <button
          class="cell"
          class:out
          class:today={d === t}
          class:sun={i % 7 === 0}
          class:sat={i % 7 === 6}
          style="--d:{i}"
          onclick={() => router.openDay(d)}
          aria-label="{d}{items.length ? `、${items.length}件` : ''}"
          data-date={d}
          data-testid="cell"
        >
          <span class="num">{Number(d.slice(8))}</span>
          {#each items.slice(0, shown) as it}
            <span class="m-item {it.kind}" data-status={it.task.status} data-span={it.span} style={it.color ? `--c:${it.color}` : undefined} data-testid="m-{it.kind}">
              {#if it.kind === 'due'}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 11V1.5h6L7.8 4 9 6.5H3" /></svg>{/if}
              <!-- a multi-day bar is labelled on its first day and where it wraps onto a new week row -->
              <span class:quiet={it.span !== 'single'}>{it.task.title}</span>
            </span>
          {/each}
          {#if items.length > shown}<span class="more" data-testid="m-more">+{items.length - shown}</span>{/if}
        </button>
      {/each}
      {#each barLabels as l (l.key)}
        <span
          class="m-bar-label {l.kind}"
          style="--row:{l.row}; --col:{l.col}; --run:{l.run}; --slot:{l.slot}"
          aria-hidden="true"
          data-testid="m-bar-label">{l.title}</span
        >
      {/each}
    </div>
  {/key}
</div>

<div class="legend" aria-hidden="true">
  <span><i class="lg-event"></i>予定</span>
  <span><i class="lg-plan"></i>やる時間</span>
  <span><i class="lg-due"></i>期限</span>
</div>
