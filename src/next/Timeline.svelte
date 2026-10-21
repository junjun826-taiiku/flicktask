<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { today as todayFn } from '../lib/dates';
  import { timeline, TIMELINE_DAYS } from './home';

  const today = todayFn();
  const tl = $derived(timeline(store.tasks, store.activeEvents, today));
  const pct = (i: number) => `${(Math.max(0, Math.min(TIMELINE_DAYS, i)) / TIMELINE_DAYS) * 100}%`;
  const weeks = Array.from({ length: Math.floor((TIMELINE_DAYS - 1) / 7) }, (_, i) => (i + 1) * 7);
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
</script>

<section class="nx-panel tl" aria-label="これからの流れ" data-testid="nx-timeline">
  <div class="head">
    <h2>これからの流れ</h2>
    <span class="sub">全イベント・3か月</span>
    <span class="legend" aria-hidden="true">
      <span><i class="due"></i>締切</span>
      <span><i class="over"></i>期限切れ</span>
      <span><i class="main"></i>本番</span>
    </span>
  </div>
  {#if tl.rows.length === 0}
    <p class="empty">進行中のイベントはありません</p>
  {:else}
    <div class="grid">
      <span></span>
      <div class="months">
        <span style="left:0">{Number(tl.from.slice(5, 7))}月</span>
        {#each tl.months as m}<span class="tick" style="left:{pct(m.at)}">{m.label}</span>{/each}
      </div>
    </div>
    <div class="rows">
      <div class="overlay" aria-hidden="true">
        {#each weeks as w}<i class="week" style="left:{pct(w)}"></i>{/each}
        <i class="now" style="left:{pct(tl.today)}"><span>今日</span></i>
      </div>
      {#each tl.rows as r (r.event.id)}
        <a class="row" href="/next/events/{r.event.id}" data-testid="nx-tl-row">
          <span class="name"><i style="background:{r.color}"></i>{r.event.name}</span>
          <span class="track">
            <i class="line" style="left:{pct(tl.today)}; width:calc({pct(r.start)} - {pct(tl.today)}); background:{r.color}"></i>
            {#each r.dues as x (x.task.id)}
              <i class="dot" class:over={x.over} style="left:{pct(x.at)}" title="{x.task.title}（{md(x.task.due_date ?? x.task.plan_date ?? '')}）" data-testid="nx-tl-due"></i>
            {/each}
            {#if r.start >= TIMELINE_DAYS}
              <span class="later" style="color:{r.color}">{md(r.event.start_date)} →</span>
            {:else}
              <span class="mark" style="left:{pct(r.start)}; width:max(14px, calc({pct(r.end + 1)} - {pct(r.start)})); background:{r.color}; --c:{r.color}" title="本番 {md(r.event.start_date)}"></span>
            {/if}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .tl { padding: 18px 20px 24px; }
  .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 14px; margin-bottom: 14px; }
  h2 { margin: 0; font-size: 16px; font-weight: 800; }
  .sub { font-size: 12px; color: var(--sub); }
  .legend { margin-left: auto; display: flex; gap: 14px; font-size: 11.5px; color: var(--sub); }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--sub); }
  .legend i.over { background: var(--over); }
  .legend i.main { width: 12px; border-radius: 3px; }
  .empty { margin: 0; color: var(--sub); font-size: 13px; }
  .grid, .row { display: grid; grid-template-columns: 150px minmax(0, 1fr); column-gap: 14px; }
  .months { position: relative; height: 20px; }
  .months span { position: absolute; top: 0; font-size: 11.5px; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .months .tick { padding-left: 6px; border-left: 1px solid var(--line); height: 18px; }
  .rows { position: relative; }
  .overlay { position: absolute; inset: 0 0 0 164px; pointer-events: none; }
  .week { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--week); }
  .now { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--accent); z-index: 2; }
  .now span { position: absolute; bottom: -17px; left: -12px; font-size: 10.5px; font-weight: 800; font-style: normal; color: var(--accent); }
  .row { align-items: center; height: 34px; border-radius: 8px; }
  .row:hover .name { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
  .name { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name i { flex: none; width: 8px; height: 8px; border-radius: 50%; }
  .track { position: relative; height: 34px; }
  .line { position: absolute; top: 16px; height: 2px; opacity: 0.35; }
  .dot { position: absolute; top: 12px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--sub); box-shadow: 0 0 0 3px var(--ring); z-index: 1; }
  .dot.over { background: var(--over); }
  .mark { position: absolute; top: 8px; height: 18px; border-radius: 5px; box-shadow: 0 6px 14px -6px var(--c); }
  .later { position: absolute; top: 8px; right: 0; height: 18px; padding: 0 8px; border-radius: 6px; display: flex; align-items: center; font-size: 11px; font-weight: 800; background: var(--chip); }
  @media (max-width: 760px) {
    /* phone: scroll the time axis sideways, names stay readable */
    .tl { overflow-x: auto; }
    .grid, .rows { min-width: 640px; }
    .grid, .row { grid-template-columns: 110px minmax(0, 1fr); }
    .overlay { left: 124px; }
    .legend { display: none; }
  }
</style>
