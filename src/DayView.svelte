<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, STATUS_LABEL } from './lib/store.svelte';
  import { router } from './lib/router.svelte';
  import { sheet } from './lib/sheet.svelte';
  import { addDays, dayLabel, fromMin, nowMin, today } from './lib/dates';
  import { allDay, layoutBlocks, timedDeadlines } from './lib/calendar';
  import { useSwipe } from './lib/swipe';

  let { date }: { date: string } = $props();

  const H = 56; // px per hour
  const blocks = $derived(layoutBlocks(store.tasks, date));
  const dues = $derived(timedDeadlines(store.tasks, date));
  const top = $derived(allDay(store.tasks, date));
  const isToday = $derived(date === today());
  let now = $state(nowMin());
  let scroller = $state<HTMLDivElement>();

  const page = (n: 1 | -1) => router.setDay(addDays(date, n), n);
  const swipe = useSwipe((dir) => page(dir));

  onMount(() => {
    const id = setInterval(() => (now = nowMin()), 60_000);
    return () => clearInterval(id);
  });

  // Scroll to "now" (today) or the first thing on the day, else 8:00.
  $effect(() => {
    date;
    tick().then(() => {
      if (!scroller) return;
      const first = Math.min(...blocks.map((b) => b.start), ...dues.map((d) => d.at), Infinity);
      const target = isToday ? now - 90 : Number.isFinite(first) ? first - 45 : 8 * 60;
      scroller.scrollTo({ top: Math.max(0, (target / 60) * H), behavior: 'instant' as ScrollBehavior });
    });
  });

  function createAt(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = Math.floor(((e.clientY - rect.top) / H) * 2) * 30; // snap to 30 min
    const start = Math.min(min, 23 * 60);
    sheet.create({ plan_date: date, plan_start: fromMin(start), plan_end: fromMin(Math.min(start + 60, 23 * 60 + 59)) });
  }
</script>

<header class="cal-head">
  <button class="nav-btn glass" onclick={() => router.back()} aria-label="月表示に戻る" data-testid="day-back">
    <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
  </button>
  {#key date}
    <h1 class:is-today={isToday} in:fly={{ y: 8 * router.dir, duration: 360, easing: cubicOut }} data-testid="day-title">{dayLabel(date)}</h1>
  {/key}
  <div class="cal-actions glass">
    <button onclick={() => page(-1)} aria-label="前の日" data-testid="day-prev"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
    <button class="today-btn" onclick={() => router.setDay(today(), today() < date ? -1 : 1)} data-testid="day-today">今日</button>
    <button onclick={() => page(1)} aria-label="次の日" data-testid="day-next"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
  </div>
</header>

{#key date}
  <div class="day" in:fly={{ x: 70 * router.dir, duration: 420, easing: cubicOut }} {...swipe}>
    {#if top.plans.length || top.dues.length}
      <div class="allday" data-testid="allday">
        <span class="allday-label">終日</span>
        <div class="allday-items">
          {#each top.plans as t (t.id)}
            <button class="ad-plan" data-status={t.status} onclick={() => sheet.edit(t.id)} data-testid="allday-plan" in:scale={{ start: 0.8, duration: 380, easing: backOut }}>
              {t.title}
            </button>
          {/each}
          {#each top.dues as t (t.id)}
            <button class="ad-due" class:done={t.status === 'done'} onclick={() => sheet.edit(t.id)} data-testid="allday-due" in:scale={{ start: 0.8, duration: 380, easing: backOut }}>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 11V1.5h6L7.8 4 9 6.5H3" /></svg>
              {t.title}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="timeline-scroll" bind:this={scroller} data-testid="timeline">
      <div class="timeline" style="height:{24 * H}px; --h:{H}px">
        {#each Array.from({ length: 24 }, (_, h) => h) as h}
          <div class="hour" style="top:{h * H}px"><span>{h === 0 ? '' : `${h}:00`}</span></div>
        {/each}

        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lanes" onclick={createAt} data-testid="lanes">
          <!-- やる時間 = filled blocks -->
          {#each blocks as b, i (b.task.id)}
            <button
              class="block"
              data-status={b.task.status}
              style="top:{(b.start / 60) * H}px; height:{Math.max(((b.end - b.start) / 60) * H - 2, 22)}px; left:calc({(b.col / b.cols) * 100}% + 2px); width:calc({100 / b.cols}% - 4px)"
              onclick={(e) => (e.stopPropagation(), sheet.edit(b.task.id))}
              in:scale={{ start: 0.85, duration: 420, delay: i * 40, easing: backOut }}
              aria-label="{b.task.title} {b.task.plan_start}–{b.task.plan_end ?? ''}（{STATUS_LABEL[b.task.status]}）"
              data-testid="block"
            >
              <strong>{b.task.title}</strong>
              <span>{b.task.plan_start}{b.task.plan_end ? `–${b.task.plan_end}` : ''}</span>
            </button>
          {/each}

          <!-- 期限 = dashed line + outlined flag; never a block -->
          {#each dues as d, i (d.task.id)}
            <div class="deadline" class:done={d.task.status === 'done'} style="top:{(d.at / 60) * H}px" data-testid="deadline" in:fly={{ x: -20, duration: 420, delay: 120 + i * 40, easing: cubicOut }}>
              <button class="flag" onclick={(e) => (e.stopPropagation(), sheet.edit(d.task.id))} aria-label="期限 {d.task.due_time} {d.task.title}">
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 11V1.5h6L7.8 4 9 6.5H3" /></svg>
                <span class="flag-time">{d.task.due_time}</span>
                <span class="flag-title">{d.task.title}</span>
              </button>
            </div>
          {/each}

          {#if isToday}
            <div class="now-line" style="top:{(now / 60) * H}px" aria-hidden="true" data-testid="now-line"><i></i></div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/key}
