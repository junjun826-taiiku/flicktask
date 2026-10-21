<script lang="ts">
  // The app: sidebar of events + home / event / month screens.
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { store } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import { toasts } from '../lib/toast.svelte';
  import { theme } from './theme.svelte';
  import { nav } from './nav.svelte';
  import Sidebar from './Sidebar.svelte';
  import Timeline from './Timeline.svelte';
  import WeekTasks from './WeekTasks.svelte';
  import Upcoming from './Upcoming.svelte';
  import EventPage from './event/EventPage.svelte';
  import EventEditor from './event/EventEditor.svelte';
  import MonthPage from './MonthPage.svelte';
  import AccountMenu from './AccountMenu.svelte';

  $effect(() => {
    if (store.user) live.start();
    else live.stop();
  });
  $effect(() => {
    document.body.classList.toggle('light', theme.value === 'light');
  });
  onMount(async () => {
    document.body.classList.add('nx-body');
    document.getElementById('boot')?.remove();
    await store.init();
    document.body.classList.add('ready');
  });

  const todayLabel = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="nx" data-theme={theme.value} data-testid="nx" onclick={nav.click}>
  <div class="nx-shell">
    <Sidebar />

    <main class="nx-main">
      <header class="head" class:on-event={nav.route.name === "event"}>
        <div class="today">
          <span class="nx-label">今日{#if store.user}<i class="sync" class:on={store.syncing} class:off={live.status !== 'on'} title={live.status === 'on' ? 'リアルタイム同期中' : '再接続中'} data-live={live.status} data-testid="sync-dot"></i>{/if}</span>
          <h1>{todayLabel}</h1>
        </div>
        <button class="btn nx-chip cal-toggle" onclick={() => (nav.calOpen = !nav.calOpen)} aria-expanded={nav.calOpen} aria-label="カレンダー" data-testid="nx-cal-toggle">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8.5 3v4M15.5 3v4" /></svg>
        </button>
        <button class="btn nx-chip" onclick={() => theme.toggle()} aria-label="ライトとダークを切り替える" data-testid="nx-theme">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg><span class="label">{theme.value === 'dark' ? 'ダーク' : 'ライト'}</span>
        </button>
        <AccountMenu />
      </header>

      {#if nav.route.name === 'home'}
        <Timeline />
        <div class="lower">
          <div class="week-col"><WeekTasks /></div>
          <div class="up-col"><Upcoming /></div>
        </div>
      {:else if nav.route.name === "calendar"}
        <MonthPage month={nav.route.month} day={nav.route.day} />
      {:else}
        {#key nav.route.id}<EventPage id={nav.route.id} tab={nav.route.tab} />{/key}
      {/if}
    </main>
  </div>

  {#if nav.editing}{#key nav.editing}<EventEditor id={nav.editing} />{/key}{/if}

  <div class="toasts" aria-live="polite">
    {#each toasts.items as t (t.id)}
      <div class="toast" animate:flip={{ duration: 300 }} in:fly={{ y: 30, duration: 360 }} out:fly={{ y: 16, duration: 200 }} data-testid="nx-toast">
        <span>{t.text}</span>
        {#if t.action}
          <button onclick={() => (t.action!.run(), toasts.dismiss(t.id))}>{t.action.label}</button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 2px 2px 0; }
  .today { display: flex; flex-direction: column; gap: 2px; margin-right: auto; }
  .today h1 { margin: 0; font-size: 26px; font-weight: 800; }
  .btn { height: 38px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
  .btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .cal-toggle { display: none; }
  .sync { display: inline-block; width: 7px; height: 7px; margin-left: 8px; border-radius: 50%; background: #2fbf7f; vertical-align: middle; transition: background 0.3s; }
  .sync.off { background: var(--muted); }
  .sync.on { background: var(--accent); }
  .avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #fff; background: #a64bd6; }
  .lower { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
  .week-col { flex: 999 1 460px; min-width: 0; }
  .up-col { flex: 1 1 260px; min-width: 0; }
  .wip { padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
  .wip h2 { margin: 0; font-size: 20px; }
  .wip p { margin: 0; color: var(--sub); font-size: 14px; }
  .toasts { position: fixed; left: 0; right: 0; bottom: 20px; z-index: 80; display: grid; justify-items: center; gap: 8px; pointer-events: none; padding: 0 16px; }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 14px; padding: 10px 12px 10px 16px; border-radius: 14px; font-size: 13.5px; font-weight: 600; color: var(--text); background: var(--drawer); border: 1px solid var(--border); box-shadow: 0 20px 40px -16px rgba(0, 0, 0, 0.6); }
  .toast button { height: 30px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; font-weight: 800; background: var(--chip); }
  @media (max-width: 760px) {
    .today h1 { font-size: 20px; }
    .head.on-event .today { visibility: hidden; height: 0; }
    .head.on-event { margin-bottom: -6px; }
    .cal-toggle { display: inline-flex; padding: 0 11px; }
    .btn .label { display: none; }
    .btn:has(.label) { padding: 0 11px; }
  }
</style>
