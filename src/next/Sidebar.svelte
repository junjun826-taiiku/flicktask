<script lang="ts">
  import { store, COLOR_HEX } from '../lib/store.svelte';
  import { countdown, rangeLabel } from '../lib/dates';
  import { progress } from '../lib/eventView';
  import { nav } from './nav.svelte';
  import MiniCal from './MiniCal.svelte';

  const running = $derived(store.activeEvents);
  const finished = $derived(store.liveEvents.filter((e) => e.closed).length);
  /** tasks that belong to no event live under 「その他」 */
  const otherCount = $derived(store.tasks.filter((t) => !t.deleted && t.kind === 'task' && t.status !== 'done' && !store.eventById(t.event_id)).length);
  const current = $derived(nav.route.name === 'event' ? nav.route.id : null);
</script>

<aside class="nx-side" aria-label="イベント">
  <a class="brand" href="/next">
    <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
    <span class="nx-num">Flick</span>
  </a>
  <div class="cal-wrap" class:open={nav.calOpen}><MiniCal /></div>
  <div class="head-row"><span class="nx-label head">イベント</span><button class="new nx-chip" onclick={() => (nav.editing = "new")} data-testid="nx-new-event">＋ 新規</button></div>
  <nav class="events" data-testid="nx-events">
    {#each running as e (e.id)}
      {@const c = countdown(e.start_date, e.end_date)}
      {@const p = progress(store.tasks, e)}
      <a class="event" class:on={current === e.id} href="/next/events/{e.id}" aria-current={current === e.id ? 'page' : undefined} data-testid="nx-event">
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
    <a class="event other" class:on={current === 'other'} href="/next/events/other" data-testid="nx-other">
      <span class="top"><span class="name"><i></i>その他</span><span class="days"><b class="nx-num">{otherCount}</b><em>件</em></span></span>
      <span class="when">イベントに入っていないタスク</span>
    </a>
  </nav>
  {#if finished}<a class="finished" href="/events">終了したイベント　{finished}</a>{/if}
</aside>

<style>
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 2px; font-size: 17px; font-weight: 700; }
  .logo { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent); }
  .logo svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
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
  .finished { padding: 6px; font-size: 12px; font-weight: 700; color: var(--muted); }
  @media (max-width: 760px) {
    /* phone: the event list becomes a row of chips */
    .events { flex-direction: row; overflow-x: auto; margin: 0 -16px; padding: 0 16px 2px; scrollbar-width: none; }
    .event { flex: none; width: 210px; }
    .head-row .head { visibility: hidden; }
    .days small { display: none; }
    .cal-wrap { display: none; }
    .cal-wrap.open { display: block; }
  }
</style>
