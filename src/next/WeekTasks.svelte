<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { store, COLOR_HEX, type Task, type FEvent } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import { addDays, daysUntil, today as todayFn, weekday } from '../lib/dates';
  import { byEvent, monthAhead, soonLabel, startingSoon, SOON_DAYS, upcomingTasks, type WeekItem } from './home';

  // やること: overdue and the coming month, grouped by event (v2: everyone starts on イベント別 again).
  // Each event folds up; opened, it shows 締切が1か月以内 and 着手目安日が1週間以内の未着手.
  const KEY = 'ft.weekMode.v2';
  const today = todayFn();
  const until = monthAhead(today);
  let mode = $state<'event' | 'due'>(load());
  function load(): 'event' | 'due' {
    try {
      return localStorage.getItem(KEY) === 'due' ? 'due' : 'event';
    } catch {
      return 'event';
    }
  }
  function setMode(m: 'event' | 'due') {
    mode = m;
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  }

  const items = $derived(upcomingTasks(store.tasks, (id) => store.eventById(id), today, until));
  const soon = $derived(startingSoon(store.tasks, (id) => store.eventById(id), today));
  const groups = $derived(byEvent(items, store.activeEvents, soon));

  // which groups are open, remembered on this device (all folded at first)
  const OPEN_KEY = 'ft.weekOpen.v1';
  let open = $state<Record<string, boolean>>(loadOpen());
  function loadOpen(): Record<string, boolean> {
    try {
      return Object.fromEntries((JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[]).map((k) => [k, true]));
    } catch {
      return {};
    }
  }
  function toggle(key: string) {
    open[key] = !open[key];
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(Object.keys(open).filter((k) => open[k])));
    } catch {}
  }
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
  const dueLabel = (x: WeekItem) => (x.over ? `期限切れ ${md(x.date)}` : x.date === today ? '今日' : x.date === addDays(today, 1) ? '明日' : `${md(x.date)}(${weekday(x.date)})`);
  const memberColor = (e: FEvent | null, name: string) => COLOR_HEX[e?.members.find((m) => m.name === name)?.color ?? 'gray'];

  function done(t: Task) {
    const prev = t.status;
    store.setStatus(t.id, 'done');
    toasts.show(`「${t.title}」完了`, { label: '元に戻す', run: () => store.setStatus(t.id, prev) });
  }
</script>

{#snippet row(x: WeekItem, showEvent: boolean, starting = false)}
  <div class="row" out:fade={{ duration: 200 }} data-testid={starting ? 'nx-week-soon-row' : 'nx-week-row'}>
    <button class="check" onclick={() => done(x.task)} aria-label="「{x.task.title}」を完了にする" data-testid="nx-week-check"></button>
    <span class="title">{x.task.title}</span>
    {#if x.task.assignees.length}
      <span class="people">
        {#each x.task.assignees as n}<span class="av" style="background:{memberColor(x.event, n)}" title={n}>{n[0]}</span>{/each}
      </span>
    {/if}
    {#if showEvent}
      <span class="tag"><i style="background:{x.event ? COLOR_HEX[x.event.color] : 'var(--muted)'}"></i>{x.event?.name ?? 'その他'}</span>
    {/if}
    {#if starting}
      <span class="soon" class:over={x.over}>{soonLabel(x.date, today)}</span>
      {#if x.task.due_date}<span class="due" title="締切">締切 {md(x.task.due_date)}</span>{/if}
    {:else}
      <span class="due" class:over={x.over}>{dueLabel(x)}</span>
    {/if}
  </div>
{/snippet}

<section class="nx-panel week" aria-label="やること" data-testid="nx-week">
  <div class="head">
    <h2>やること</h2>
    <span class="sub">期限切れと{md(until)}（{weekday(until)}）まで</span>
    <div class="seg nx-chip" role="group" aria-label="並べ方">
      <button class:on={mode === 'event'} aria-pressed={mode === 'event'} onclick={() => setMode('event')} data-testid="nx-week-by-event">イベント別</button>
      <button class:on={mode === 'due'} aria-pressed={mode === 'due'} onclick={() => setMode('due')} data-testid="nx-week-by-due">締切順</button>
    </div>
  </div>
  {#if mode === 'event' ? groups.length === 0 : items.length === 0}
    <p class="empty" data-testid="nx-week-empty">1か月以内の締切はありません</p>
  {:else if mode === 'event'}
    <div class="groups">
      {#each groups as g (g.key)}
        {@const color = g.event ? COLOR_HEX[g.event.color] : 'var(--muted)'}
        {@const over = g.items.filter((x) => x.over).length}
        <div class="group" class:open={open[g.key]} style="--c:{color}" data-testid="nx-week-group">
          <div class="ghead">
            <button class="gtoggle" onclick={() => toggle(g.key)} aria-expanded={!!open[g.key]} data-testid="nx-week-group-toggle">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              <span class="gname" style="color:{color}">{g.event?.name ?? 'その他'}</span>
              {#if g.event}<small>本番まで {Math.max(0, daysUntil(g.event.start_date))}日</small>{/if}
              <span class="counts">
                {#if g.items.length}<b>締切 {g.items.length}件</b>{/if}
                {#if over}<b class="over">期限切れ {over}</b>{/if}
                {#if g.soon.length}<b class="soon-n">もうすぐ着手 {g.soon.length}件</b>{/if}
              </span>
            </button>
          </div>
          {#if open[g.key]}
            <div class="gbody" transition:slide={{ duration: 220 }}>
              {#if g.items.length}
                <div class="sect" data-testid="nx-week-due-list">
                  <span class="sh">締切が1か月以内</span>
                  {#each g.items as x (x.task.id)}{@render row(x, false)}{/each}
                </div>
              {/if}
              {#if g.soon.length}
                <div class="sect" data-testid="nx-week-soon-list">
                  <span class="sh">着手目安日が{SOON_DAYS === 7 ? '1週間' : `${SOON_DAYS}日`}以内の未着手</span>
                  {#each g.soon as x (x.task.id)}{@render row(x, false, true)}{/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="flat">
      {#each items as x (x.task.id)}{@render row(x, true)}{/each}
    </div>
  {/if}
</section>

<style>
  .week { padding: 18px 20px; min-width: 0; }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 16px; font-weight: 800; }
  .sub { font-size: 12px; color: var(--sub); }
  .seg { margin-left: auto; display: flex; padding: 3px; border-radius: 10px; }
  .seg button { height: 28px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--sub); }
  .seg button.on { color: var(--text); background: var(--hi); }
  .empty { margin: 0; padding: 10px 4px; font-size: 13px; color: var(--sub); }
  .groups { display: flex; flex-direction: column; gap: 8px; }
  .group { padding: 4px 10px 4px 12px; border-radius: 12px; background: var(--card); box-shadow: inset 3px 0 0 var(--c); }
  .ghead { display: flex; align-items: center; gap: 8px; }
  .gtoggle { flex: 1; min-width: 0; min-height: 44px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; text-align: left; font-size: 13.5px; font-weight: 800; }
  .gtoggle svg { flex: none; width: 13px; height: 13px; fill: none; stroke: var(--muted); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.2s; }
  .group.open .gtoggle svg { transform: rotate(90deg); }
  .gtoggle small { font-size: 11.5px; font-weight: 500; color: var(--muted); }
  .counts { display: inline-flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  .counts b { height: 22px; padding: 0 8px; border-radius: 999px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; color: var(--sub); background: var(--chip); }
  .counts b.over { color: var(--over-text); background: rgba(255, 107, 91, 0.12); }
  .counts b.soon-n { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .gbody { display: flex; flex-direction: column; gap: 6px; padding: 0 0 6px 21px; }
  .sh { display: block; padding: 6px 0 2px; font-size: 11.5px; font-weight: 800; color: var(--muted); }
  .sect .row:last-child { border-bottom: 0; }
  .soon { flex: none; height: 24px; padding: 0 9px; border-radius: 999px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .soon.over { color: var(--over-text); background: rgba(255, 107, 91, 0.12); }
  .row { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 4px; border-bottom: 1px solid var(--line); }
  .group .row:last-child { border-bottom: 0; }
  .check { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--muted); transition: background 0.2s, border-color 0.2s; }
  .check:hover { border-color: #2fbf7f; background: rgba(47, 191, 127, 0.15); }
  .title { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
  .people { flex: none; display: flex; }
  .av { width: 22px; height: 22px; margin-left: -5px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 10.5px; font-weight: 800; color: #fff; box-shadow: 0 0 0 2px var(--ring); }
  .tag { flex: none; max-width: 170px; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag i { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .due { flex: none; height: 24px; padding: 0 9px; border-radius: 999px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; color: var(--sub); border: 1.4px dashed var(--muted); }
  .due.over { color: var(--over-text); border-color: rgba(255, 107, 91, 0.75); }
  @media (max-width: 760px) {
    .tag { display: none; }
  }
</style>
