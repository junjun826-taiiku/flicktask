<script lang="ts">
  import { store, COLOR_HEX } from '../lib/store.svelte';
  import { countdown, rangeLabel } from '../lib/dates';
  import { progress } from '../lib/eventView';
  import { nav } from './nav.svelte';
  import MiniCal from './MiniCal.svelte';
  import { byFiscalYear } from './event/carry';

  const running = $derived(store.activeEvents);
  const finished = $derived(store.liveEvents.filter((e) => e.closed));
  const years = $derived(byFiscalYear(finished));
  // 過去資料 opens on the newest 年度; the rest stay folded until clicked
  let showPast = $state(false);
  let openYears = $state<Record<number, boolean>>({});
  const yearOpen = (y: number) => openYears[y] ?? y === years[0]?.year;
  /** tasks that belong to no event live under 「その他」 */
  const otherCount = $derived(store.tasks.filter((t) => !t.deleted && t.kind === 'task' && t.status !== 'done' && !store.eventById(t.event_id)).length);
  const current = $derived(nav.route.name === 'event' ? nav.route.id : null);
</script>

<aside class="nx-side" aria-label="イベント">
  <a class="brand" href="/">
    <img class="logo" src="/icon.svg" alt="" />
    <span class="nx-num">Task本部</span>
  </a>
  <button class="new-phone nx-chip" onclick={() => (nav.editing = "new")} aria-label="新しいイベント" data-testid="nx-new-event-phone">＋ 新規</button>
  <div class="cal-wrap" class:open={nav.calOpen}><MiniCal /></div>
  <div class="head-row"><span class="nx-label head">イベント</span><button class="new nx-chip" onclick={() => (nav.editing = "new")} data-testid="nx-new-event">＋ 新規</button></div>
  <nav class="events" data-testid="nx-events">
    {#each running as e (e.id)}
      {@const c = countdown(e.start_date, e.end_date)}
      {@const p = progress(store.tasks, e)}
      <a class="event" class:on={current === e.id} href="/events/{e.id}" aria-current={current === e.id ? 'page' : undefined} data-testid="nx-event">
        <span class="top">
          <span class="name"><i style="background:{COLOR_HEX[e.color]}"></i>{e.name}</span>
          <span class="days">
            {#if c.phase === 'before'}
              <small>本番まで</small><b class="nx-num" class:soon={(c.days ?? 99) <= 20}>{c.days}</b><em>日</em>
            {:else}
              <b class="phase">{c.label}</b>
            {/if}
          </span>
        </span>
        <span class="when">{rangeLabel(e.start_date, e.end_date)}{e.place ? `・${e.place}` : ''}</span>
        <span class="bar-row">
          <span class="bar"><i style="width:{p.total ? (p.done / p.total) * 100 : 0}%; background:{COLOR_HEX[e.color]}"></i></span>
          <span class="count nx-num">{p.done}/{p.total}</span>
        </span>
      </a>
    {/each}
    <a class="event other" class:on={current === 'other'} href="/events/other" data-testid="nx-other">
      <span class="top"><span class="name"><i></i>その他</span><span class="days"><b class="nx-num">{otherCount}</b><em>件</em></span></span>
      <span class="when">イベントに入っていないタスク</span>
    </a>
  </nav>
  {#if finished.length}
    <button class="past-head" onclick={() => (showPast = !showPast)} aria-expanded={showPast} data-testid="nx-finished">
      <svg class:open={showPast} viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>過去資料<span class="nx-num">{finished.length}</span>
    </button>
    {#if showPast}
      <nav class="past" data-testid="nx-past">
        {#each years as y (y.year)}
          {@const open = yearOpen(y.year)}
          <button class="year" onclick={() => (openYears[y.year] = !open)} aria-expanded={open} data-testid="nx-past-year">
            <svg class:open viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>{y.year}年度<span class="nx-num">{y.events.length}</span>
          </button>
          {#if open}
            {#each y.events as e (e.id)}
              <a class="done-ev" class:on={current === e.id} href="/events/{e.id}" data-testid="nx-finished-event"><i style="background:{COLOR_HEX[e.color]}"></i><span>{e.name}</span><small>{rangeLabel(e.start_date, e.end_date)}</small></a>
            {/each}
          {/if}
        {/each}
      </nav>
    {/if}
  {/if}
  <footer class="legal" data-testid="legal-links"><a href="/privacy">プライバシーポリシー</a><a href="/terms">利用規約</a></footer>
</aside>

<style>
  .new-phone { display: none; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 2px; font-size: 17px; font-weight: 700; }
  .logo { width: 32px; height: 32px; display: block; }
  .head-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 0; }
  .new { height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--sub); }
  .events { display: flex; flex-direction: column; gap: 8px; }
  .event { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); transition: background 0.2s, border-color 0.2s; }
  .event:hover { background: var(--hi); }
  .event.on { background: var(--hi); border-color: var(--text); }
  .top { display: flex; align-items: flex-start; gap: 10px; }
  .name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .days { flex: none; display: flex; align-items: baseline; gap: 1px; line-height: 1; }
  .days small { font-size: 10px; font-weight: 700; color: var(--muted); margin-right: 4px; }
  .days b { font-size: 22px; font-weight: 700; }
  .days b.soon { color: var(--accent); }
  .days b.phase { font-size: 13px; color: #f0a43a; }
  .days em { font-style: normal; font-size: 12px; font-weight: 700; }
  .when { font-size: 11.5px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .bar { flex: 1; height: 4px; border-radius: 2px; overflow: hidden; background: var(--track); }
  .bar i { display: block; height: 100%; border-radius: 2px; }
  .count { font-size: 11px; font-weight: 700; color: var(--sub); }
  .legal { display: flex; gap: 14px; padding: 10px 6px 0; font-size: 11.5px; }
  .legal a { color: var(--muted); }
  .legal a:hover { color: var(--sub); }
  .past-head, .year { display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--muted); text-align: left; }
  .past-head:hover, .year:hover { color: var(--text); }
  .past-head span, .year span { margin-left: auto; font-size: 11px; font-weight: 600; }
  .past-head svg, .year svg { flex: none; width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.2s; }
  .past-head svg.open, .year svg.open { transform: rotate(90deg); }
  .past-head { margin-top: 4px; font-size: 12.5px; color: var(--sub); }
  .past { display: flex; flex-direction: column; gap: 2px; margin-top: -8px; padding-left: 8px; }
  .done-ev { display: flex; align-items: center; gap: 7px; margin-left: 12px; padding: 7px 10px; border-radius: 10px; font-size: 13px; font-weight: 700; color: var(--sub); min-width: 0; }
  .done-ev:hover, .done-ev.on { background: var(--hi); color: var(--text); }
  .done-ev i { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .done-ev span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .done-ev small { flex: none; margin-left: auto; font-size: 11px; font-weight: 500; color: var(--muted); }
  @media (max-width: 760px) {
    /* phone: the event list becomes a row of chips */
    .events { flex-direction: row; overflow-x: auto; margin: 0 -16px; padding: 0 16px 2px; scrollbar-width: none; }
    .event { flex: none; width: 210px; }
    .head-row { display: none; }
    .nx-side { position: relative; }
    .new-phone { display: inline-flex; align-items: center; position: absolute; top: 2px; right: 0; height: 32px; padding: 0 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700; color: var(--sub); }
    .days small { display: none; }
    .cal-wrap { display: none; }
    .cal-wrap.open { display: block; }
  }
</style>
