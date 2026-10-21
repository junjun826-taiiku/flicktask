<script lang="ts">
  import { slide } from 'svelte/transition';
  import { store, COLOR_HEX, type FEvent } from '../../lib/store.svelte';
  import { today as todayFn, weekday } from '../../lib/dates';
  import { eventDays } from '../../lib/liveMode';
  import { toasts } from '../../lib/toast.svelte';
  import { dayItems, forRole, nextSlot, parseTable } from './day';
  import DayBoard from './DayBoard.svelte';
  import DayPanel from './DayPanel.svelte';
  import { rememberReturn } from '../nav.svelte';

  let { event }: { event: FEvent } = $props();
  const days = $derived(eventDays(event));
  const today = todayFn();
  let picked = $state<string | null>(null);
  const day = $derived(picked && days.includes(picked) ? picked : (days.find((d) => d === today) ?? days[0]));
  const VIEW_KEY = 'ft.dayView.v1';
  let view = $state<'table' | 'board'>((() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'table';
    } catch {
      return 'table';
    }
  })());
  function setView(v: 'table' | 'board') {
    view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }
  let role = $state<string | null>(null);
  let selected = $state<string | null>(null);
  let pasteOpen = $state(false);
  let pasteText = $state('');

  const all = $derived(dayItems(store.tasks, event, day));
  const rows = $derived(all.filter(forRole(role)));
  const roleColor = (n: string) => COLOR_HEX[event.roles.find((r) => r.name === n)?.color ?? 'gray'];
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  const preview = $derived(pasteText.trim() ? parseTable(pasteText, event.roles.map((r) => r.name)) : []);

  function addRow() {
    const t = store.add('新しい動き', Date.now(), { event_id: event.id, plan_date: day, ...nextSlot(all), roles: role ? [role] : [] });
    if (t) selected = t.id;
  }
  function importRows() {
    const now = Date.now();
    preview.forEach((r, i) => store.add(r.title, now + i, { event_id: event.id, plan_date: day, plan_start: r.plan_start, plan_end: r.plan_end, roles: r.roles, place: r.place, items: r.items }));
    toasts.show(`${preview.length}件追加しました`);
    pasteText = '';
    pasteOpen = false;
  }
</script>

<section class="nx-panel day" data-testid="nx-day">
  <div class="tools">
    <div class="days" role="tablist" aria-label="日">
      {#each days as d, i}
        <button role="tab" aria-selected={d === day} class:on={d === day} onclick={() => (picked = d)} data-testid="nx-day-pill">
          {days.length > 1 ? `${i + 1}日目 ` : ''}{md(d)}（{weekday(d)}）
        </button>
      {/each}
    </div>
    <div class="seg nx-chip" role="group" aria-label="表示">
      <button class:on={view === 'table'} aria-pressed={view === 'table'} onclick={() => setView('table')} data-testid="nx-day-table">表</button>
      <button class:on={view === 'board'} aria-pressed={view === 'board'} onclick={() => setView('board')} data-testid="nx-day-board">担当別ボード</button>
    </div>
    <span class="count">{all.length}件・{event.roles.length}の担当</span>
    <a class="btn nx-chip" href="/events/{event.id}/live" onclick={rememberReturn} data-testid="nx-day-preview">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>当日モードでプレビュー
    </a>
  </div>
  {#if event.roles.length}
    <div class="roles" role="group" aria-label="担当で絞り込み" data-testid="nx-day-roles">
      <button class:on={role === null} aria-pressed={role === null} onclick={() => (role = null)}>すべて</button>
      {#each event.roles as r (r.name)}
        <button class:on={role === r.name} aria-pressed={role === r.name} onclick={() => (role = r.name)}><i style="background:{COLOR_HEX[r.color]}"></i>{r.name}</button>
      {/each}
    </div>
  {:else}
    <p class="tip">役割（受付・設営など）は、イベントの「編集」で登録できます。</p>
  {/if}

  {#if view === 'table'}
    <div class="scroll">
      <div class="table" role="table" aria-label="当日の動き">
        <div class="tr th" role="row"><span>時刻</span><span>やること</span><span>担当</span><span>場所</span><span>持ち物</span></div>
        {#each rows as t (t.id)}
          <button class="tr" class:sel={selected === t.id} class:ev={t.kind === 'event'} role="row" onclick={() => (selected = t.id)} data-testid="nx-day-row">
            <span class="time nx-num">{t.plan_start}{t.plan_end ? `–${t.plan_end}` : ''}</span>
            <span class="what">
              <i style="background:{t.kind === 'event' ? 'var(--event)' : t.roles.length ? roleColor(t.roles[0]) : 'var(--muted)'}"></i>
              <b>{t.title}</b>
              {#if t.kind === 'event'}<em>予定</em>{/if}
            </span>
            <span class="who">
              {#if t.kind !== 'event'}
                {#if t.roles.length}
                  {#each t.roles as r}<span class="role" style="--c:{roleColor(r)}">{r}</span>{/each}
                {:else}
                  <span class="role all">全員</span>
                {/if}
              {/if}
            </span>
            <span class="sub" class:none={!t.place}>{t.place || '—'}</span>
            <span class="sub items" class:none={!t.items}>{t.items || '—'}</span>
          </button>
        {/each}
        {#if rows.length === 0}<p class="empty">この日の動きはまだありません</p>{/if}
      </div>
    </div>
  {:else}
    <DayBoard items={rows} {event} {selected} open={(id) => (selected = id)} />
  {/if}

  <div class="foot">
    <button class="btn nx-chip" onclick={addRow} data-testid="nx-day-add">＋ 行を追加</button>
    <button class="btn link" onclick={() => (pasteOpen = !pasteOpen)} aria-expanded={pasteOpen} data-testid="nx-day-paste-open">表を貼り付けて追加</button>
  </div>
  {#if pasteOpen}
    <div class="paste" transition:slide={{ duration: 220 }}>
      <textarea bind:value={pasteText} rows="5" placeholder={'Excel や運営マニュアルの表をそのまま貼り付け\n例）13:00-13:45	リハーサル	イベント担当	5号館'} aria-label="表を貼り付け" data-testid="nx-day-paste"></textarea>
      <div class="pacts">
        <span>{preview.length ? `${preview.length}行を読み取りました（時刻・やること・担当・場所・持ち物）` : '時刻で始まる行を読み取ります'}</span>
        <button class="btn primary" disabled={!preview.length} onclick={importRows} data-testid="nx-day-paste-add">{preview.length}件追加</button>
      </div>
    </div>
  {/if}
</section>

{#if selected}
  <DayPanel id={selected} {event} days={days} close={() => (selected = null)} />
{/if}

<style>
  .day { padding: 16px 18px 18px; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
  .days { display: flex; gap: 4px; flex-wrap: wrap; }
  .days button { height: 34px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--sub); background: var(--chip); }
  .days button.on { color: var(--text); background: var(--hi); box-shadow: inset 0 0 0 1px var(--text); }
  .seg { display: flex; padding: 3px; border-radius: 10px; }
  .seg button { height: 28px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; font-weight: 700; color: var(--sub); }
  .seg button.on { color: var(--text); background: var(--hi); }
  .count { margin-left: auto; font-size: 12px; color: var(--muted); }
  .btn { height: 34px; padding: 0 14px; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; }
  .btn svg { width: 13px; height: 13px; fill: currentColor; }
  .btn.link { color: var(--sub); }
  .btn.primary { color: var(--bg); background: var(--text); font-weight: 800; }
  .btn.primary:disabled { opacity: 0.4; }
  .roles { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px; }
  .roles button { height: 30px; padding: 0 11px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--sub); background: var(--chip); }
  .roles button i { width: 7px; height: 7px; border-radius: 50%; }
  .roles button.on { color: var(--bg); background: var(--text); }
  .tip { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
  .scroll { overflow-x: auto; }
  .table { min-width: 760px; }
  .tr { width: 100%; display: grid; grid-template-columns: 110px minmax(0, 2.2fr) minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.9fr); column-gap: 14px; align-items: center; min-height: 46px; padding: 0 8px; text-align: left; border-bottom: 1px solid var(--track); border-radius: 8px; }
  button.tr:hover { background: var(--card); }
  .tr.sel { background: var(--hi) !important; }
  .tr.ev { background: color-mix(in srgb, var(--event) 6%, transparent); }
  .th { min-height: 0; padding-bottom: 8px; font-size: 11.5px; font-weight: 700; color: var(--muted); border-color: var(--border); }
  .time { font-size: 12.5px; font-weight: 600; color: var(--sub); }
  .what { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .what i { flex: none; width: 3px; height: 18px; border-radius: 2px; }
  .what b { font-size: 13.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what em { flex: none; height: 20px; padding: 0 7px; border-radius: 6px; display: inline-flex; align-items: center; font-style: normal; font-size: 11px; font-weight: 700; color: var(--event); background: color-mix(in srgb, var(--event) 14%, transparent); }
  .who { display: flex; flex-wrap: wrap; gap: 4px; }
  .role { height: 22px; padding: 0 8px; border-radius: 6px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .role.all { color: var(--sub); background: var(--chip); }
  .sub { font-size: 12.5px; color: var(--sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { margin: 12px 8px; font-size: 13px; color: var(--muted); }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding-top: 12px; }
  @media (max-width: 760px) {
    .table { min-width: 0; }
    .th { display: none; }
    .tr { grid-template-columns: 86px minmax(0, 1fr); row-gap: 4px; padding: 10px 6px; }
    .who, .sub { grid-column: 2; }
    .sub.none, .who:empty { display: none; }
    .sub.items::before { content: '持ち物：'; }
    .count { display: none; }
  }
  .paste { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .paste textarea { width: 100%; min-height: 110px; resize: vertical; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 500 13px/1.6 var(--font); outline: 0; tab-size: 12; }
  .pacts { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
  .pacts .btn { margin-left: auto; }
</style>
