<script lang="ts">
  // Month view of the new design. Multi-day bars run across each week row as one piece; tapping a day lists it.
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { store, type Task } from '../lib/store.svelte';
  import { addMonths, monthGrid, monthOf, today as todayFn, weekday } from '../lib/dates';
  import { monthItems, type MonthItem } from '../lib/calendar';
  import { tagColor } from './home';
  import { nav } from './nav.svelte';

  let { month, day }: { month: string; day: string | null } = $props();
  const today = todayFn();
  const days = $derived(monthGrid(month));
  $effect(() => void store.loadRange(days[0], days[days.length - 1]));
  const SLOTS = 4; // items per day cell (bars included); the rest is "+n"
  const weeks = $derived(Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7)));
  /** the event's own timetable (当日の動き and its 予定) lives in the event; the month shows the event itself */
  const onTimetable = (t: Task) => {
    const e = store.eventById(t.event_id);
    return !!e && !!t.plan_date && !!t.plan_start && t.plan_date >= e.start_date && t.plan_date <= e.end_date;
  };
  const monthTasks = $derived(store.tasks.filter((t) => !onTimetable(t)));
  const itemsOf = $derived(new Map(days.map((d) => [d, monthItems(monthTasks, d, store.liveEvents)])));

  /** bars: one piece per week row from its first day there to its last */
  function bars(week: string[]) {
    const out: { key: string; item: MonthItem; col: number; run: number; slot: number; head: boolean; tail: boolean }[] = [];
    week.forEach((d, col) => {
      (itemsOf.get(d) ?? []).slice(0, SLOTS).forEach((it, slot) => {
        if (it.span === 'single' || !(it.span === 'start' || col === 0)) return;
        let run = 1;
        while (col + run < 7 && week[col + run] <= it.end) run++;
        out.push({ key: `${it.task.id}:${d}`, item: it, col, run, slot, head: it.span === 'start', tail: week[col + run - 1] === it.end });
      });
    });
    return out;
  }
  const title = $derived(`${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`);
  const go = (m: string) => nav.go(`/next/calendar?m=${m}`);
  const openDay = (d: string) => nav.go(`/next/calendar?m=${month}&d=${d}`);
  const closeDay = () => nav.go(`/next/calendar?m=${month}`);

  // ---------- the day list ----------
  const dayList = $derived(day ? (itemsOf.get(day) ?? monthItems(monthTasks, day, store.liveEvents)) : []);
  const kindLabel = { meet: 'イベント', event: '予定', plan: 'やる時間', due: '締切' } as const;
  function hrefOf(it: MonthItem) {
    if (it.kind === 'meet') return `/next/events/${it.task.id.slice(5)}`;
    const t = it.task as Task;
    const e = store.eventById(t.event_id);
    if (!e) return '/next/events/other';
    if (it.kind === 'event') return `/next/events/${e.id}?tab=sched`;
    if (t.plan_date && t.plan_start && t.plan_date >= e.start_date && t.plan_date <= e.end_date) return `/next/events/${e.id}?tab=day`;
    return `/next/events/${e.id}`;
  }
  const colorOf = (it: MonthItem) =>
    it.kind === 'meet' ? it.color! : it.kind === 'event' ? (it.task.tag ? tagColor(it.task.tag) : 'var(--event)') : it.kind === 'due' ? 'var(--over)' : 'var(--accent)';
</script>

<section class="nx-panel month" data-testid="nx-month">
  <div class="head">
    <h1 data-testid="nx-month-title">{title}</h1>
    <div class="nav nx-chip">
      <button onclick={() => go(addMonths(month, -1))} aria-label="前の月" data-testid="nx-month-prev"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <button class="t" onclick={() => go(monthOf(today))}>今日</button>
      <button onclick={() => go(addMonths(month, 1))} aria-label="次の月" data-testid="nx-month-next"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
  </div>
  <div class="wd" aria-hidden="true"><span class="sun">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span class="sat">土</span></div>
  <div class="weeks">
    {#each weeks as week (week[0])}
      <div class="week">
        {#each week as d, col (d)}
          {@const list = itemsOf.get(d) ?? []}
          <button
            class="cell"
            class:out={d.slice(0, 7) !== month.slice(0, 7)}
            class:today={d === today}
            class:sel={d === day}
            class:sun={col === 0}
            class:sat={col === 6}
            onclick={() => openDay(d)}
            aria-label="{Number(d.slice(5, 7))}月{Number(d.slice(8))}日{list.length ? `、${list.length}件` : ''}"
            data-date={d}
            data-testid="nx-month-cell"
          >
            <span class="num nx-num">{Number(d.slice(8))}</span>
            {#each list.slice(0, SLOTS) as it, slot}
              {#if it.span === 'single'}
                <span class="chip {it.kind}" style="top:{28 + slot * 19}px; --c:{colorOf(it)}" data-testid="nx-month-item">{it.time ? `${it.time} ` : ''}{it.task.title}</span>
              {/if}
            {/each}
            {#if list.length > SLOTS}<span class="more" style="top:{28 + SLOTS * 19}px">+{list.length - SLOTS}</span>{/if}
          </button>
        {/each}
        {#each bars(week) as b (b.key)}
          <span class="bar {b.item.kind}" class:head={b.head} class:tail={b.tail} style="left:calc({(b.col / 7) * 100}% + {b.head ? 4 : 0}px); width:calc({(b.run / 7) * 100}% - {(b.head ? 4 : 0) + (b.tail ? 4 : 0)}px); top:{28 + b.slot * 19}px; --c:{colorOf(b.item)}" data-testid="nx-month-bar">{b.item.task.title}</span>
        {/each}
      </div>
    {/each}
  </div>
  <div class="legend" aria-hidden="true">
    <span><i class="meet"></i>イベント</span><span><i class="event"></i>予定</span><span><i class="plan"></i>やる時間</span><span><i class="due"></i>締切</span>
  </div>
</section>

{#if day}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={closeDay} transition:fade={{ duration: 160 }}></div>
  <aside class="daypanel" role="dialog" aria-modal="true" aria-label="{Number(day.slice(5, 7))}月{Number(day.slice(8))}日" transition:fly={{ x: 380, duration: 280, easing: cubicOut, opacity: 1 }} data-testid="nx-month-day">
    <div class="dh">
      <h2>{Number(day.slice(5, 7))}月{Number(day.slice(8))}日（{weekday(day)}）</h2>
      <button class="x nx-chip" onclick={closeDay} aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    {#if dayList.length === 0}
      <p class="empty">この日の予定・締切はありません</p>
    {:else}
      {#each dayList as it (it.task.id + it.kind)}
        <a class="it" href={hrefOf(it)} data-testid="nx-month-day-item">
          <i style="background:{colorOf(it)}"></i>
          <span class="tm nx-num">{it.time ?? (it.kind === 'meet' ? '' : '終日')}</span>
          <span class="b"><b>{it.task.title}</b><small>{kindLabel[it.kind]}{it.kind !== 'meet' && store.eventById(it.task.event_id) ? `・${store.eventById(it.task.event_id)!.name}` : ''}</small></span>
        </a>
      {/each}
    {/if}
    <a class="old" href="/calendar/{day}">時間割で見る（ドラッグで動かす）</a>
  </aside>
{/if}

<style>
  .month { padding: 16px 18px; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  h1 { margin: 0 auto 0 0; font-size: 22px; font-weight: 800; }
  .nav { display: flex; align-items: center; padding: 3px; border-radius: 12px; }
  .nav button { height: 32px; min-width: 32px; padding: 0 8px; border-radius: 9px; display: grid; place-items: center; font-size: 12.5px; font-weight: 700; }
  .nav button:hover { background: var(--hi); }
  .nav svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .wd { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; font-size: 11.5px; font-weight: 700; color: var(--muted); margin-bottom: 4px; }
  .wd .sun { color: #ff7a7a; }
  .wd .sat { color: var(--accent); }
  .weeks { display: flex; flex-direction: column; gap: 3px; }
  .week { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
  .cell { position: relative; height: 112px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); text-align: left; overflow: hidden; transition: background 0.15s; }
  .cell:hover { background: var(--hi); }
  .cell.sel { border-color: var(--text); }
  .cell.out { opacity: 0.4; }
  .num { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  .cell.sun .num { color: #ff7a7a; }
  .cell.sat .num { color: var(--accent); }
  .cell.today .num { color: var(--on-accent); background: var(--accent); }
  .chip { position: absolute; left: 3px; right: 3px; height: 17px; padding: 0 5px; border-radius: 5px; font-size: 10.5px; font-weight: 700; line-height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip.event { color: var(--text); background: color-mix(in srgb, var(--c) 22%, transparent); box-shadow: inset 2px 0 0 var(--c); }
  .chip.plan { color: #fff; background: color-mix(in srgb, var(--accent) 75%, #000); }
  .chip.due { color: var(--over-text); border: 1px dashed rgba(255, 107, 91, 0.7); line-height: 15px; }
  .chip.meet { color: #111; background: var(--c); }
  .more { position: absolute; left: 6px; font-size: 10.5px; font-weight: 700; color: var(--muted); }
  .bar { position: absolute; z-index: 2; height: 17px; padding: 0 6px; font-size: 10.5px; font-weight: 800; line-height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; color: #111; background: var(--c); }
  .bar.event { color: var(--text); background: color-mix(in srgb, var(--c) 30%, var(--bg)); }
  .bar.head { border-top-left-radius: 5px; border-bottom-left-radius: 5px; }
  .bar.tail { border-top-right-radius: 5px; border-bottom-right-radius: 5px; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-top: 10px; font-size: 11.5px; color: var(--sub); }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 14px; height: 9px; border-radius: 3px; }
  .legend i.meet { background: #f0a43a; }
  .legend i.event { background: color-mix(in srgb, var(--event) 40%, transparent); box-shadow: inset 2px 0 0 var(--event); }
  .legend i.plan { background: color-mix(in srgb, var(--accent) 75%, #000); }
  .legend i.due { border: 1px dashed var(--over); }
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.3); }
  .daypanel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: 380px; max-width: 100%; padding: 20px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto;
    background: var(--drawer); border-left: 1px solid var(--border); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: -30px 0 60px -20px rgba(0, 0, 0, 0.6); }
  .dh { display: flex; align-items: center; margin-bottom: 8px; }
  .dh h2 { margin: 0 auto 0 0; font-size: 19px; font-weight: 800; }
  .x { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; }
  .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
  .it { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
  .it:hover { border-color: var(--sub); }
  .it i { flex: none; width: 4px; align-self: stretch; border-radius: 2px; }
  .tm { flex: none; width: 42px; font-size: 12.5px; font-weight: 600; color: var(--sub); }
  .b { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .b b { font-size: 13.5px; }
  .b small { font-size: 11.5px; color: var(--muted); }
  .old { margin-top: 10px; font-size: 12px; font-weight: 700; color: var(--sub); }
  @media (max-width: 760px) {
    .month { padding: 12px 10px; }
    .chip, .bar { font-size: 9.5px; padding: 0 3px; }
  }
</style>
