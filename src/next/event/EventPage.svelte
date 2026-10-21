<script lang="ts">
  import { store, COLOR_HEX, type FEvent } from '../../lib/store.svelte';
  import { countdown, rangeLabel, today as todayFn } from '../../lib/dates';
  import { progress } from '../../lib/eventView';
  import { aimDate, dayDiff } from '../home';
  import { nav } from '../nav.svelte';
  import { prepOf } from './prep';
  import PrepTab from './PrepTab.svelte';
  import DayTab from './DayTab.svelte';
  import SchedTab from './SchedTab.svelte';
  import MemoTab from './MemoTab.svelte';

  let { id, tab }: { id: string; tab: string } = $props();
  const today = todayFn();
  const isOther = $derived(id === 'other');
  const e = $derived<FEvent | null>(isOther ? null : store.eventById(id));
  $effect(() => void (e && store.loadEventTasks(e.id))); // finished events: their items come from the server

  const c = $derived(e ? countdown(e.start_date, e.end_date) : null);
  const p = $derived(e ? progress(store.tasks, e) : null);
  const TABS = [
    { key: 'prep', label: '準備' },
    { key: 'day', label: '当日の動き' },
    { key: 'sched', label: '予定' },
    { key: 'memo', label: 'メモ' },
  ];
  const current = $derived(isOther ? 'prep' : TABS.some((t) => t.key === tab) ? tab : 'prep');

  // this event's own time axis: today → a few days after the event
  const span = $derived(e ? Math.max(14, dayDiff(today, e.end_date) + 6) : 0);
  const pct = (i: number) => `${(Math.max(0, Math.min(span, i)) / span) * 100}%`;
  const dues = $derived(
    e
      ? prepOf(store.tasks, e, (x) => !!store.eventById(x))
          .filter((t) => t.status !== 'done')
          .map((t) => ({ t, d: aimDate(t, e) }))
          .filter((x): x is { t: (typeof x)['t']; d: string } => !!x.d)
          .map((x) => ({ ...x, at: dayDiff(today, x.d) }))
      : [],
  );
  const weekLines = $derived(e ? Array.from({ length: Math.floor(span / 7) }, (_, i) => (i + 1) * 7 - ((new Date().getDay() + 6) % 7)).filter((x) => x > 0 && x < span) : []);
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
</script>

{#if !isOther && !e}
  <section class="nx-panel missing" data-testid="nx-event-missing">
    <h1>このイベントは見つかりません</h1>
    <a href="/next">ホームに戻る</a>
  </section>
{:else}
  <section class="nx-panel head" data-testid="nx-event-head">
    <div class="row">
      <div class="title">
        <h1 data-testid="nx-event-title"><i style="background:{e ? COLOR_HEX[e.color] : 'var(--muted)'}"></i>{e ? e.name : 'その他'}</h1>
        <span class="sub">
          {#if e}
            {rangeLabel(e.start_date, e.end_date)}{e.place ? `・${e.place}` : ''}{#if e.members.length}　｜　担当　{e.members.map((m) => m.name).join('・')}{/if}
          {:else}
            イベントに入っていないタスク
          {/if}
        </span>
      </div>
      {#if e && c && p}
        <div class="days">
          {#if c.phase === 'before'}
            <small>本番まで</small><b class="nx-num">{c.days}</b><em>日</em>
          {:else}
            <b class="phase">{c.label}</b>
          {/if}
        </div>
        <div class="prog">
          <span>準備 <span class="nx-num">{p.done}/{p.total}</span></span>
          <span class="bar"><i style="width:{p.total ? (p.done / p.total) * 100 : 0}%; background:{COLOR_HEX[e.color]}"></i></span>
        </div>
        <button class="btn nx-chip" onclick={() => (nav.editing = e.id)} data-testid="nx-event-edit">編集</button>
        <a class="btn primary" href="/events/{e.id}/live" data-testid="nx-live-start">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>当日モード
        </a>
      {/if}
    </div>
    {#if e}
      <div class="strip" aria-label="このイベントの流れ">
        {#each weekLines as w}<i class="week" style="left:{pct(w)}"></i>{/each}
        <i class="track"></i>
        {#each dues as x (x.t.id)}
          <i class="dot" class:over={x.at < 0} style="left:{pct(Math.max(0, x.at))}" title="{x.t.title}（{md(x.d)}）" data-testid="nx-strip-due"></i>
        {/each}
        <span class="now">今日 {md(today)}</span>
        <span class="main" style="left:{pct(dayDiff(today, e.start_date))}; background:{COLOR_HEX[e.color]}">本番 {md(e.start_date)}</span>
      </div>
    {/if}
  </section>

  {#if !isOther}
    <div class="tabs" role="tablist">
      {#each TABS as t}
        <a role="tab" class:on={current === t.key} aria-selected={current === t.key} href="/next/events/{id}{t.key === 'prep' ? '' : `?tab=${t.key}`}" data-testid="nx-tab-{t.key}">{t.label}</a>
      {/each}
    </div>
  {/if}

  {#if current === 'prep'}
    <PrepTab event={e} />
  {:else if e && current === 'day'}
    <DayTab event={e} />
  {:else if e && current === 'sched'}
    <SchedTab event={e} />
  {:else if e && current === 'memo'}
    {#key e.id}<MemoTab event={e} />{/key}
  {/if}
{/if}

<style>
  .missing { padding: 24px; }
  .missing h1 { margin: 0 0 10px; font-size: 20px; }
  .missing a { color: var(--accent); }
  .head { padding: 18px 20px 14px; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
  .title { display: flex; flex-direction: column; gap: 4px; margin-right: auto; min-width: 0; }
  h1 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 800; }
  h1 i { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .sub { font-size: 13px; color: var(--sub); }
  .days { display: flex; align-items: baseline; gap: 2px; padding: 0 6px; }
  .days small { font-size: 11px; font-weight: 700; color: var(--muted); margin-right: 6px; }
  .days b { font-size: 30px; font-weight: 700; color: var(--accent); }
  .days b.phase { font-size: 15px; color: #f0a43a; }
  .days em { font-style: normal; font-size: 13px; font-weight: 700; color: var(--accent); }
  .prog { display: flex; flex-direction: column; gap: 4px; width: 120px; font-size: 11px; font-weight: 700; color: var(--muted); }
  .prog .bar { height: 5px; border-radius: 3px; background: var(--track); overflow: hidden; }
  .prog .bar i { display: block; height: 100%; border-radius: 3px; }
  .btn { height: 38px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
  .btn.primary { color: var(--bg); background: var(--text); font-weight: 800; }
  .btn svg { width: 14px; height: 14px; fill: currentColor; }
  .strip { position: relative; height: 36px; margin-top: 14px; }
  .strip .week { position: absolute; top: 8px; bottom: 0; width: 1px; background: var(--week); }
  .strip .track { position: absolute; left: 0; right: 0; top: 18px; height: 2px; border-radius: 1px; background: var(--track); }
  .strip .dot { position: absolute; top: 14px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--sub); box-shadow: 0 0 0 3px var(--ring); }
  .strip .dot.over { background: var(--over); }
  .strip .now { position: absolute; left: 0; top: 0; font-size: 10.5px; font-weight: 800; color: var(--accent); }
  .strip .main { position: absolute; top: 11px; height: 16px; padding: 0 8px; border-radius: 5px; display: flex; align-items: center; font-size: 10.5px; font-weight: 800; color: #111; transform: translateX(-50%); white-space: nowrap; }
  .tabs { display: flex; gap: 4px; padding: 0 4px; overflow-x: auto; }
  .tabs a { flex: none; height: 38px; padding: 0 16px; border-radius: 10px; display: inline-flex; align-items: center; font-size: 14px; font-weight: 800; color: var(--muted); }
  .tabs a.on { color: var(--text); background: var(--hi); }
  .wip { padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; color: var(--sub); }
  .wip p { margin: 0; }
  @media (max-width: 760px) {
    h1 { font-size: 19px; }
    .prog { width: 90px; }
  }
</style>
