<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store } from './lib/store.svelte';
  import { toasts } from './lib/toast.svelte';
  import { collapse } from './lib/motion';
  import Composer from './Composer.svelte';
  import Segmented from './Segmented.svelte';
  import TaskCard from './TaskCard.svelte';
  import Account from './Account.svelte';
  import TaskSheet from './TaskSheet.svelte';
  import CalendarScreen from './CalendarScreen.svelte';
  import { router } from './lib/router.svelte';
  import ScheduleList from './ScheduleList.svelte';

  let composer: Composer;
  let firstPaintDone = $state(false);

  const today = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());

  onMount(async () => {
    if (new URLSearchParams(location.search).get('login') === 'failed') {
      history.replaceState(null, '', '/');
      toasts.show('ログインに失敗しました');
    }
    await store.init();
    composer.adopt();
    requestAnimationFrame(() => {
      document.body.classList.add('ready');
      setTimeout(() => (firstPaintDone = true), 500);
    });
  });
</script>

<div class="shell" class:entered={store.ready}>
  <header class="topbar">
    <div class="date">
      <span>{today}</span>
      {#if store.user}
        <span class="sync" class:on={store.syncing} aria-label={store.syncing ? '同期中' : '同期済み'} data-testid="sync-dot"></span>
      {/if}
    </div>
    <div class="top-actions">
      {#if store.ready}
        <button class="cal-btn glass" onclick={() => router.openMonth()} aria-label="カレンダー" data-testid="open-calendar" in:scale|global={{ start: 0.6, duration: 450, easing: backOut }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8.5 3v4M15.5 3v4" /></svg>
          <span>{new Date().getDate()}</span>
        </button>
      {/if}
      <Account />
    </div>
  </header>

  <Composer bind:this={composer} />

  <div class="pane-switch glass" role="tablist" aria-label="表示" style="--i:{store.pane === 'tasks' ? 0 : 1}">
    <span class="pane-thumb" aria-hidden="true"></span>
    <button role="tab" aria-selected={store.pane === 'tasks'} class:active={store.pane === 'tasks'} onclick={() => (store.pane = 'tasks')} data-testid="pane-tasks">
      タスク <span class="count">{store.counts.all}</span>
    </button>
    <button role="tab" aria-selected={store.pane === 'schedule'} class:active={store.pane === 'schedule'} onclick={() => (store.pane = 'schedule')} data-testid="pane-schedule">
      スケジュール <span class="count">{store.upcoming.length}</span>
    </button>
  </div>

  <div class="panes" data-pane={store.pane}>
  <section class="pane pane-tasks" aria-label="タスク">
  <h2 class="pane-title">タスク</h2>
  <Segmented />

  {#if store.ready}
  <ul class="list" data-testid="task-list">
    {#each store.visible as task, i (task.id)}
      <li
        animate:flip={{ duration: 420, easing: cubicOut }}
        in:fly|global={{ y: firstPaintDone ? -18 : 24, duration: 520, delay: firstPaintDone ? 0 : 60 + i * 45, easing: backOut }}
        out:collapse={{ duration: 360 }}
      >
        <TaskCard {task} hint={i === 0} />
      </li>
    {/each}
  </ul>
  {/if}

  {#if store.ready && store.visible.length === 0}
    <div class="empty" in:scale={{ start: 0.85, duration: 500, delay: 200, easing: backOut }} data-testid="empty">
      <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 6" />
        <path d="M17 24.5l5 5 9-10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>タスクなし</span>
    </div>
  {/if}
  </section>

  <section class="pane pane-schedule" aria-label="スケジュール">
    <h2 class="pane-title">スケジュール</h2>
    <ScheduleList />
  </section>
  </div>
  <footer class="legal" data-testid="legal-links">
    <span>Flick — メモしてフリックで進めるタスク管理</span>
    <a href="/privacy">プライバシーポリシー</a>
    <a href="/terms">利用規約</a>
  </footer>
</div>

{#if store.ready && router.route.name !== 'home'}
  <CalendarScreen />
{/if}

<TaskSheet />

<div class="toasts" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div
      class="toast glass"
      animate:flip={{ duration: 300 }}
      in:fly={{ y: 40, duration: 480, easing: backOut }}
      out:fly={{ y: 20, duration: 220 }}
      data-testid="toast"
    >
      <span>{t.text}</span>
      {#if t.action}
        <button
          onclick={() => {
            t.action!.run();
            toasts.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>
