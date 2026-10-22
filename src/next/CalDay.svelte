<script lang="ts">
  // One day of the month view, laid out like Google Calendar: 終日 on top, then the hours.
  // Clicking an empty time (or 「＋ 予定」) adds a 予定 of 「その他」 there; it opens in the 予定 panel.
  // Each event's own timetable (当日の動き) is left out by the caller, so it never mixes in here.
  import { onMount, tick, untrack } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, BUILTIN_TAGS, COLOR_HEX, type Task } from '../lib/store.svelte';
  import { addDays, fromMin, nowMin, today as todayFn, weekday } from '../lib/dates';
  import { allDay, layoutBlocks, timedDeadlines, type MonthItem } from '../lib/calendar';
  import SchedPanel from './event/SchedPanel.svelte';
  import { nav } from './nav.svelte';

  let { day, tasks, close, go, hrefOf, colorOf }: {
    day: string;
    tasks: Task[];
    close: () => void;
    go: (d: string) => void;
    hrefOf: (it: MonthItem) => string;
    colorOf: (it: MonthItem) => string;
  } = $props();

  const H = 44; // px per hour
  const MIN_BLOCK = 22;
  const blocks = $derived(layoutBlocks(tasks, day, Math.ceil((MIN_BLOCK / H) * 60)));
  const dues = $derived(timedDeadlines(tasks, day));
  const top = $derived(allDay(tasks, day));
  const meets = $derived(store.liveEvents.filter((e) => e.start_date <= day && day <= e.end_date));
  const isToday = $derived(day === todayFn());
  let now = $state(nowMin());
  let scroller = $state<HTMLDivElement>();
  let selected = $state<string | null>(null);
  let dir = $state(1);

  onMount(() => {
    const id = setInterval(() => (now = nowMin()), 60_000);
    return () => clearInterval(id);
  });

  // when the day changes: scroll to now (today), else the first thing on the day, else 8:00
  $effect(() => {
    day;
    untrack(() =>
      tick().then(() => {
        if (!scroller) return;
        const first = Math.min(...blocks.map((b) => b.start), ...dues.map((d) => d.at), Infinity);
        const target = isToday ? now - 90 : Number.isFinite(first) ? first - 45 : 8 * 60;
        scroller.scrollTo({ top: Math.max(0, (target / 60) * H), behavior: 'instant' as ScrollBehavior });
      }),
    );
  });

  const step = (n: 1 | -1) => ((dir = n), go(addDays(day, n)));
  const item = (t: Task, kind: MonthItem['kind']): MonthItem => ({ task: t, kind, time: null, span: 'single', end: day });
  /** a 予定 of 「その他」 is edited right here; anything else opens where it lives */
  function open(t: Task, kind: MonthItem['kind']) {
    if (t.kind === 'event' && !t.event_id) selected = t.id;
    else nav.go(hrefOf(item(t, kind)));
  }
  function add(start: number | null) {
    const at = start ?? (isToday ? Math.min(Math.ceil((now + 1) / 60) * 60, 23 * 60) : 10 * 60);
    const t = store.add('新しい予定', Date.now(), { kind: 'event', event_id: null, plan_date: day, plan_start: fromMin(at), plan_end: fromMin(Math.min(at + 60, 23 * 60 + 59)) });
    if (t) selected = t.id;
  }
  function addAt(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    add(Math.min(Math.floor(((e.clientY - r.top) / H) * 2) * 30, 23 * 60)); // snap to 30 min
  }
  const label = (t: Task) => (t.event_id ? store.eventById(t.event_id)?.name ?? '' : 'その他');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !selected && close()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={close} transition:fade={{ duration: 160 }}></div>
<aside class="daypanel" role="dialog" aria-modal="true" aria-label="{Number(day.slice(5, 7))}月{Number(day.slice(8))}日" transition:fly={{ x: 440, duration: 280, easing: cubicOut, opacity: 1 }} data-testid="nx-month-day">
  <div class="dh">
    <h2 class:today={isToday}>{Number(day.slice(5, 7))}月{Number(day.slice(8))}日（{weekday(day)}）</h2>
    <div class="step nx-chip">
      <button onclick={() => step(-1)} aria-label="前の日" data-testid="nx-day-prev"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <button onclick={() => step(1)} aria-label="次の日" data-testid="nx-day-next"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
    <button class="x nx-chip" onclick={close} aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
  </div>
  <button class="add" onclick={() => add(null)} data-testid="nx-day-add">＋ 予定を追加</button>

  {#key day}
    <div class="body" in:fly={{ x: 40 * dir, duration: 300, easing: cubicOut }}>
      {#if meets.length || top.plans.length || top.dues.length}
        <div class="allday" data-testid="nx-day-allday">
          <span class="lab">終日</span>
          <div class="ads">
            {#each meets as m (m.id)}
              <a class="ad meet" href="/events/{m.id}" style="--c:{COLOR_HEX[m.color]}" data-testid="nx-month-day-item">{m.name}</a>
            {/each}
            {#each top.plans as t (t.id)}
              {@const k = t.kind === 'event' ? 'event' : 'plan'}
              <button class="ad {k}" style="--c:{colorOf(item(t, k))}" onclick={() => open(t, k)} data-testid="nx-month-day-item">{t.title}<small>{label(t)}</small></button>
            {/each}
            {#each top.dues as t (t.id)}
              <button class="ad due" onclick={() => open(t, 'due')} data-testid="nx-month-day-item">締切・{t.title}<small>{label(t)}</small></button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="scroll" bind:this={scroller} data-testid="nx-day-timeline">
        <div class="tl" style="height:{24 * H}px">
          {#each Array.from({ length: 24 }, (_, h) => h) as h}
            <div class="hour" style="top:{h * H}px"><span class="nx-num">{h === 0 ? '' : `${h}:00`}</span></div>
          {/each}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="lanes" onclick={addAt} data-testid="nx-day-lanes">
            {#each blocks as b, i (b.task.id)}
              {@const k = b.task.kind === 'event' ? 'event' : 'plan'}
              {@const px = ((b.end - b.start) / 60) * H}
              <button
                class="block {k}"
                class:short={px < 36}
                style="top:{(b.start / 60) * H}px; height:{Math.max(px - 2, MIN_BLOCK)}px; left:calc({(b.col / b.cols) * 100}% + 2px); width:calc({(100 * b.span) / b.cols}% - 4px); --c:{colorOf(item(b.task, k))}"
                onclick={(e) => (e.stopPropagation(), open(b.task, k))}
                in:scale={{ start: 0.9, duration: 360, delay: i * 30, easing: backOut }}
                data-testid="nx-day-block"
              >
                <strong>{b.task.title}</strong>
                <span class="nx-num">{b.task.plan_start}{b.task.plan_end ? `–${b.task.plan_end}` : ''}{label(b.task) ? `・${label(b.task)}` : ''}</span>
              </button>
            {/each}
            {#each dues as d (d.task.id)}
              <button class="deadline" style="top:{(d.at / 60) * H}px" onclick={(e) => (e.stopPropagation(), open(d.task, 'due'))} data-testid="nx-day-due">
                <span class="nx-num">{d.task.due_time}</span> 締切・{d.task.title}
              </button>
            {/each}
            {#if isToday}
              <div class="now" style="top:{(now / 60) * H}px" aria-hidden="true"><i></i></div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/key}
</aside>

{#if selected}
  <SchedPanel id={selected} event={null} tags={[...BUILTIN_TAGS]} close={() => (selected = null)} />
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.3); }
  .daypanel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: 440px; max-width: 100%; padding: 20px 20px 0; display: flex; flex-direction: column; gap: 10px;
    background: var(--drawer); border-left: 1px solid var(--border); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: -30px 0 60px -20px rgba(0, 0, 0, 0.6); }
  .dh { display: flex; align-items: center; gap: 8px; }
  .dh h2 { margin: 0 auto 0 0; font-size: 19px; font-weight: 800; }
  .dh h2.today { color: var(--accent); }
  .step { display: flex; padding: 3px; border-radius: 11px; }
  .step button { width: 30px; height: 28px; border-radius: 8px; display: grid; place-items: center; }
  .step button:hover { background: var(--hi); }
  .step svg, .x svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .x { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; }
  .add { align-self: flex-start; height: 36px; padding: 0 14px; border-radius: 11px; font-size: 13px; font-weight: 800; color: var(--bg); background: var(--text); }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .allday { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .lab { flex: none; width: 40px; padding-top: 4px; font-size: 11px; font-weight: 700; color: var(--muted); }
  .ads { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .ad { display: flex; align-items: baseline; gap: 8px; min-height: 24px; padding: 3px 8px; border-radius: 6px; text-align: left; font-size: 12.5px; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ad small { font-size: 10.5px; font-weight: 600; opacity: 0.75; }
  .ad.meet { color: #111; background: var(--c); }
  .ad.event { color: var(--text); background: color-mix(in srgb, var(--c) 24%, transparent); box-shadow: inset 3px 0 0 var(--c); }
  .ad.plan { color: #fff; background: color-mix(in srgb, var(--accent) 75%, #000); }
  .ad.due { color: var(--over-text); border: 1px dashed rgba(255, 107, 91, 0.7); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; padding-bottom: 20px; }
  .scroll::-webkit-scrollbar { display: none; }
  .tl { position: relative; margin-top: 8px; }
  .hour { position: absolute; left: 0; right: 0; border-top: 1px solid var(--border); }
  .hour span { position: absolute; top: -8px; left: 0; width: 40px; font-size: 10.5px; font-weight: 600; color: var(--muted); background: var(--drawer); }
  .lanes { position: absolute; top: 0; bottom: 0; left: 48px; right: 0; cursor: cell; }
  .block { position: absolute; z-index: 1; padding: 3px 7px; border-radius: 7px; text-align: left; overflow: hidden; display: flex; flex-direction: column; gap: 1px; cursor: pointer; transition: filter 0.15s; }
  .block:hover { filter: brightness(1.12); }
  .block.event { color: var(--text); background: color-mix(in srgb, var(--c) 28%, var(--drawer)); box-shadow: inset 3px 0 0 var(--c); }
  .block.plan { color: #fff; background: color-mix(in srgb, var(--accent) 75%, #000); }
  .block strong { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block span { font-size: 10.5px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block.short { flex-direction: row; align-items: center; gap: 6px; padding-top: 0; padding-bottom: 0; }
  /* 締切: a dashed line at its time with the label sitting on it */
  .deadline { position: absolute; z-index: 2; left: 0; right: 0; height: 16px; margin-top: -15px; padding: 0 4px; border-bottom: 2px dashed var(--over); text-align: right; font-size: 10.5px; font-weight: 700; line-height: 14px; color: var(--over-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .deadline span { font-weight: 800; }
  .now { position: absolute; z-index: 3; left: -4px; right: 0; height: 2px; background: #ff4d4d; pointer-events: none; }
  .now i { position: absolute; left: -4px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: #ff4d4d; }
  @media (max-width: 760px) {
    .daypanel { width: 100%; padding: 16px 14px 0; }
  }
</style>
