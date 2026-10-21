<script lang="ts">
  // The new design, built at /next next to the current app until it replaces it.
  import { onMount } from 'svelte';
  import { store, COLOR_HEX } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import { countdown, rangeLabel } from '../lib/dates';
  import { progress } from '../lib/eventView';
  import { theme } from './theme.svelte';

  $effect(() => {
    if (store.user) live.start();
    else live.stop();
  });
  $effect(() => {
    document.body.classList.toggle('light', theme.value === 'light');
  });
  onMount(async () => {
    document.body.classList.add('nx-body', 'ready');
    document.getElementById('boot')?.remove();
    await store.init();
  });

  const todayLabel = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  const running = $derived(store.activeEvents);
  /** tasks that belong to no event live under 「その他」 */
  const otherCount = $derived(store.tasks.filter((t) => !t.deleted && t.kind === 'task' && t.status !== 'done' && !store.eventById(t.event_id)).length);
</script>

<div class="nx" data-theme={theme.value} data-testid="nx">
  <div class="nx-shell">
    <aside class="nx-side" aria-label="イベント">
      <a class="nx-brand" href="/next">
        <span class="nx-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <span>Flick</span>
      </a>
      <span class="nx-label">イベント</span>
      <div class="nx-events" data-testid="nx-events">
        {#each running as e (e.id)}
          {@const c = countdown(e.start_date, e.end_date)}
          {@const p = progress(store.tasks, e)}
          <a class="nx-event" href="/next/events/{e.id}" data-testid="nx-event">
            <span class="nx-event-top">
              <span class="nx-event-name"><i style="background:{COLOR_HEX[e.color]}"></i>{e.name}</span>
              <span class="nx-event-days nx-num">{c.phase === 'before' ? c.days : c.label}{#if c.phase === 'before'}<small>日</small>{/if}</span>
            </span>
            <span class="nx-event-when">{rangeLabel(e.start_date, e.end_date)}{e.place ? `・${e.place}` : ''}</span>
            <span class="nx-event-bar"><i style="width:{p.total ? (p.done / p.total) * 100 : 0}%; background:{COLOR_HEX[e.color]}"></i></span>
          </a>
        {/each}
        <a class="nx-event other" href="/next/events/other" data-testid="nx-other">
          <span class="nx-event-top"><span class="nx-event-name"><i></i>その他</span><span class="nx-event-days nx-num">{otherCount}<small>件</small></span></span>
        </a>
      </div>
    </aside>

    <main class="nx-main">
      <header class="nx-head">
        <div class="nx-today">
          <span class="nx-label">今日</span>
          <h1>{todayLabel}</h1>
        </div>
        <button class="nx-btn nx-chip" onclick={() => theme.toggle()} aria-label="ライトとダークを切り替える" data-testid="nx-theme">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>{theme.value === 'dark' ? 'ダーク' : 'ライト'}
        </button>
        {#if store.user}
          <span class="nx-avatar" title={store.user.email}>{(store.user.name ?? store.user.email)[0]}</span>
        {:else}
          <a class="nx-btn nx-chip" href="/auth/google">ログイン</a>
        {/if}
      </header>
      <section class="nx-panel nx-wip" data-testid="nx-wip">新しいホームを作成中です。今のアプリは <a href="/">こちら</a></section>
    </main>
  </div>
</div>

<style>
  .nx-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 2px; font-family: var(--num); font-size: 17px; font-weight: 700; }
  .nx-logo { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent); }
  .nx-logo svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
  .nx-side > .nx-label { padding: 4px 6px 0; }
  .nx-events { display: flex; flex-direction: column; gap: 8px; }
  .nx-event { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); transition: background 0.2s; }
  .nx-event:hover { background: var(--hi); }
  .nx-event-top { display: flex; align-items: flex-start; gap: 10px; }
  .nx-event-name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-event-name i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .nx-event-days { flex: none; font-size: 20px; font-weight: 700; line-height: 1; }
  .nx-event-days small { font-family: var(--font); font-size: 11px; margin-left: 1px; }
  .nx-event-when { font-size: 11.5px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-event-bar { height: 4px; margin-top: 5px; border-radius: 2px; overflow: hidden; background: var(--track); }
  .nx-event-bar i { display: block; height: 100%; border-radius: 2px; }
  .nx-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 2px 2px 0; }
  .nx-today { display: flex; flex-direction: column; gap: 2px; margin-right: auto; }
  .nx-today h1 { margin: 0; font-size: 26px; font-weight: 800; }
  .nx-btn { height: 38px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
  .nx-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .nx-avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #fff; background: #a64bd6; }
  .nx-wip { padding: 28px; color: var(--sub); font-size: 14px; }
  .nx-wip a { color: var(--accent); }
</style>
