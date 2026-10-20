<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, COLOR_HEX } from './lib/store.svelte';
  import { router, type EventTab } from './lib/router.svelte';
  import { sheet } from './lib/sheet.svelte';
  import { eventSheet } from './lib/eventSheet.svelte';
  import { collapse } from './lib/motion';
  import { addDays, countdown, rangeLabel, shortLabel, today, weekday } from './lib/dates';
  import { groupPrep, moves, progress, schedules } from './lib/eventView';
  import TaskCard from './TaskCard.svelte';
  import Icon from './Icon.svelte';

  let { id, tab }: { id: string; tab: EventTab } = $props();

  const e = $derived(store.eventById(id));
  $effect(() => void store.loadEventTasks(id)); // finished events: their items come from the server
  const c = $derived(e ? countdown(e.start_date, e.end_date) : null);
  const p = $derived(e ? progress(store.tasks, e) : { done: 0, total: 0 });
  const groups = $derived(e ? groupPrep(store.tasks, e) : []);
  let showDone = $state(false);

  // 当日の動き: one day at a time for multi-day events
  const days = $derived.by(() => {
    if (!e) return [];
    const out: string[] = [];
    for (let d = e.start_date; d <= e.end_date && out.length < 14; d = addDays(d, 1)) out.push(d);
    return out;
  });
  let pickedDay = $state<string | null>(null);
  const day = $derived(pickedDay && days.includes(pickedDay) ? pickedDay : (days.find((d) => d === today()) ?? days[0]));
  let roleFilter = $state<string | null>(null);
  const dayRows = $derived.by(() => {
    if (!e || !day) return [];
    const timed = [...moves(store.tasks, e), ...schedules(store.tasks, e).filter((t) => t.plan_date === day || (t.plan_date! <= day && day <= (t.plan_end_date ?? t.plan_date!)))]
      .filter((t) => t.plan_date === day || t.kind === 'event')
      .filter((t) => !roleFilter || t.kind === 'event' || t.roles.length === 0 || t.roles.includes(roleFilter));
    return timed.sort((a, b) => (a.plan_start ?? '00:00').localeCompare(b.plan_start ?? '00:00') || a.created_at - b.created_at);
  });
  const roleColor = (name: string) => COLOR_HEX[e?.roles.find((r) => r.name === name)?.color ?? 'gray'];
  const evSched = $derived(e ? schedules(store.tasks, e).sort((a, b) => (a.plan_date ?? '').localeCompare(b.plan_date ?? '') || (a.plan_start ?? '').localeCompare(b.plan_start ?? '')) : []);

  const setTab = (t: EventTab) => router.setEventTab(id, t);
</script>

{#if !e}
  <header class="cal-head">
    <button class="nav-btn glass" onclick={() => router.back()} aria-label="戻る"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
    <h1>イベント</h1>
  </header>
  <div class="empty" data-testid="event-missing"><span>このイベントは見つかりません</span></div>
{:else}
  <header class="cal-head">
    <button class="nav-btn glass" onclick={() => router.back()} aria-label="戻る" data-testid="event-back">
      <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <span class="ev-head-title"><i style="background:{COLOR_HEX[e.color]}"></i><span data-testid="event-title">{e.name}</span></span>
    <button class="head-action ghosty" onclick={() => eventSheet.edit(e.id)} data-testid="event-edit">編集</button>
  </header>

  <div class="ev-scroll">
    <div class="ev-hero glass" in:scale={{ start: 0.96, duration: 420, easing: backOut }}>
      <div class="ev-hero-text">
        <span class="ev-sub">{rangeLabel(e.start_date, e.end_date)}</span>
        {#if e.place}<span class="ev-sub">{e.place}</span>{/if}
      </div>
      <div class="ring" style="--p:{p.total ? p.done / p.total : 0}; --c:{COLOR_HEX[e.color]}" data-testid="event-ring">
        <div>
          {#if c?.phase === 'before'}
            <small>あと</small><strong>{c.days}日</strong>
          {:else}
            <strong class="ring-phase">{c?.label}</strong>
          {/if}
          <small>{p.done}/{p.total} 完了</small>
        </div>
      </div>
    </div>

    {#if e.closed}
      <div class="ev-closed glass" data-testid="event-closed">
        <span>このイベントは終了済みです</span>
        <button onclick={() => store.updateEvent(e.id, { closed: false })} data-testid="event-reopen">再開する</button>
      </div>
    {/if}

    <div class="ev-tabs" role="tablist" style="--i:{tab === 'prep' ? 0 : tab === 'day' ? 1 : 2}">
      <span class="ev-tab-thumb" aria-hidden="true"></span>
      <button role="tab" aria-selected={tab === 'prep'} class:active={tab === 'prep'} onclick={() => setTab('prep')} data-testid="tab-prep">準備</button>
      <button role="tab" aria-selected={tab === 'day'} class:active={tab === 'day'} onclick={() => setTab('day')} data-testid="tab-day">当日の動き</button>
      <button role="tab" aria-selected={tab === 'sched'} class:active={tab === 'sched'} onclick={() => setTab('sched')} data-testid="tab-sched">予定</button>
    </div>

    {#key tab}
      <div class="ev-tab-body" in:fly={{ y: 10, duration: 320, easing: cubicOut }}>
        {#if tab === 'prep'}
          <button class="add-row glass" onclick={() => sheet.create({ event_id: e.id })} data-testid="event-add-task">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>準備のタスク
          </button>
          {#each groups.filter((g) => g.key !== 'done') as g (g.key)}
            <section class="prep-group" data-group={g.key} data-testid="prep-group">
              <h3 class:over={g.tone === 'over'} class:during={g.tone === 'event'}>{g.label}</h3>
              {#if g.key === 'after'}<div class="event-rule"><span>本番 {rangeLabel(e.start_date, e.end_date)}</span></div>{/if}
              <ul class="list">
                {#each g.items as t (t.id)}
                  <li animate:flip={{ duration: 360, easing: cubicOut }} in:fly={{ y: -12, duration: 420, easing: backOut }} out:collapse={{ duration: 300 }}>
                    <TaskCard task={t} showEvent={false} />
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
          {@const done = groups.find((g) => g.key === 'done')}
          {#if done}
            <button class="done-toggle" onclick={() => (showDone = !showDone)} aria-expanded={showDone} data-testid="prep-done-toggle">完了 {done.items.length}件 <Icon name={showDone ? 'up' : 'down'} size={14} /></button>
            {#if showDone}
              <ul class="list">
                {#each done.items as t (t.id)}
                  <li animate:flip={{ duration: 360 }} out:collapse={{ duration: 300 }}><TaskCard task={t} showEvent={false} /></li>
                {/each}
              </ul>
            {/if}
          {/if}
          {#if groups.length === 0}
            <div class="empty"><span>準備のタスクなし</span></div>
          {/if}
        {:else if tab === 'day'}
          <div class="day-tools">
            {#if days.length > 1}
              {#each days as d, i}
                <button class="day-pill" class:on={d === day} onclick={() => (pickedDay = d)} data-testid="event-day-pill">{i + 1}日目 {Number(d.slice(5, 7))}/{Number(d.slice(8))}</button>
              {/each}
            {:else}
              <span class="day-pill on">{shortLabel(day!)} {Number(day!.slice(5, 7))}/{Number(day!.slice(8))}({weekday(day!)})</span>
            {/if}
            {#if e.roles.length}
              <select class="role-filter" bind:value={roleFilter} aria-label="担当で絞り込み" data-testid="role-filter">
                <option value={null}>担当：すべて</option>
                {#each e.roles as r}<option value={r.name}>{r.name}</option>{/each}
              </select>
            {/if}
          </div>
          <div class="plan-table glass" data-testid="day-plan">
            <div class="pt-head"><span>時刻</span><span>やること・場所</span><span>担当</span></div>
            {#each dayRows as t (t.id)}
              <button class="pt-row" class:event={t.kind === 'event'} class:done={t.status === 'done' && t.kind === 'task'} onclick={() => sheet.edit(t.id)} animate:flip={{ duration: 300 }} data-testid="plan-row">
                <span class="pt-time">{t.plan_start ?? '終日'}</span>
                <span class="pt-what"><strong>{t.title}</strong>{#if t.place || t.kind === 'event'}<small>{t.kind === 'event' ? '予定' : ''}{t.kind === 'event' && t.place ? '・' : ''}{t.place}</small>{/if}</span>
                <span class="pt-roles">
                  {#if t.roles.length === 0}
                    <i class="role-chip all">全員</i>
                  {:else}
                    {#each t.roles as r}<i class="role-chip" style="--c:{roleColor(r)}">{r}</i>{/each}
                  {/if}
                </span>
              </button>
            {/each}
            {#if dayRows.length === 0}
              <div class="pt-empty">まだ動きがありません</div>
            {/if}
          </div>
          <button class="add-row glass" onclick={() => sheet.create({ event_id: e.id, plan_date: day, plan_start: '09:00', plan_end: '10:00' })} data-testid="event-add-move">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>動きを追加
          </button>
          <button class="live-start" onclick={() => router.openLive(e.id)} data-testid="live-start">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>当日モードを開始
          </button>
        {:else}
          <button class="add-row glass" onclick={() => sheet.create({ kind: 'event', event_id: e.id, plan_date: e.start_date, plan_start: null, plan_end: null })} data-testid="event-add-sched">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>予定
          </button>
          <ul class="list">
            {#each evSched as t (t.id)}
              <li animate:flip={{ duration: 300 }} out:collapse={{ duration: 300 }}>
                <button class="event-card glass" onclick={() => sheet.edit(t.id)} data-testid="event-sched-card">
                  <span class="event-time" class:allday={!t.plan_start}>
                    <strong>{Number(t.plan_date!.slice(5, 7))}/{Number(t.plan_date!.slice(8))}</strong>
                    <span>{t.plan_start ?? '終日'}</span>
                  </span>
                  <span class="event-bar" aria-hidden="true"></span>
                  <span class="event-body"><span class="event-title">{t.title}</span>{#if t.note}<span class="event-note">{t.note}</span>{/if}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if evSched.length === 0}<div class="empty"><span>予定なし</span></div>{/if}
        {/if}
      </div>
    {/key}
  </div>
{/if}
