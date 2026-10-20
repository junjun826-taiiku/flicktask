<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, STATUS_LABEL, COLOR_HEX } from './lib/store.svelte';
  import { router } from './lib/router.svelte';
  import { sheet } from './lib/sheet.svelte';
  import { addDays, dayLabel, fromMin, nowMin, today } from './lib/dates';
  import { vibrate } from './lib/motion';
  import type { PlanBlock } from './lib/calendar';
  import { allDay, layoutBlocks, timedDeadlines } from './lib/calendar';
  import { useSwipe } from './lib/swipe';

  let { date }: { date: string } = $props();

  const H = 56; // px per hour
  /** a block shorter than this shows title and time on one line */
  const MIN_BLOCK = 24;
  const blocks = $derived(layoutBlocks(store.tasks, date, Math.ceil((MIN_BLOCK / H) * 60)));
  const dues = $derived(timedDeadlines(store.tasks, date));
  const top = $derived(allDay(store.tasks, date));
  // イベント held on this day (大会・行事)
  const meets = $derived(store.liveEvents.filter((e) => e.start_date <= date && date <= e.end_date));
  const isToday = $derived(date === today());
  $effect(() => void store.loadRange(date, date)); // older days come from the server on demand
  let now = $state(nowMin());
  let scroller = $state<HTMLDivElement>();

  const page = (n: 1 | -1) => router.setDay(addDays(date, n), n);
  const swipe = useSwipe((dir) => page(dir));

  onMount(() => {
    const id = setInterval(() => (now = nowMin()), 60_000);
    return () => clearInterval(id);
  });

  // Once a press-and-hold has turned into a drag, stop the timeline from scrolling under the finger.
  // This listener has to exist before the touch starts: Chrome decides at touchstart whether
  // touchmove can be cancelled, so adding it mid-gesture would be too late.
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const stop = (e: TouchEvent) => drag?.active && e.cancelable && e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  });

  // Scroll to "now" (today) or the first thing on the day, else 8:00 — only when the date changes,
  // not whenever a task changes (e.g. right after dragging a block).
  $effect(() => {
    date;
    untrack(() => tick().then(() => {
      if (!scroller) return;
      const first = Math.min(...blocks.map((b) => b.start), ...dues.map((d) => d.at), Infinity);
      const target = isToday ? now - 90 : Number.isFinite(first) ? first - 45 : 8 * 60;
      scroller.scrollTo({ top: Math.max(0, (target / 60) * H), behavior: 'instant' as ScrollBehavior });
    }));
  });

  // ---------- drag a block to move it, or its bottom edge to resize ----------
  // Mouse: starts after a few px of movement. Touch/pen: press and hold (like Google Calendar),
  // so an ordinary swipe over a block still scrolls the timeline.
  type Drag = { id: string; mode: 'move' | 'resize'; y0: number; s0: number; e0: number; start: number; end: number; active: boolean };
  let drag = $state<Drag | null>(null);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let justDragged = false;
  const SNAP = 15;
  const snap = (m: number) => Math.round(m / SNAP) * SNAP;

  function press(e: PointerEvent, b: PlanBlock, mode: Drag['mode']) {
    if (e.button !== 0) return;
    e.stopPropagation(); // keep the day-swipe handler out of it
    drag = { id: b.task.id, mode, y0: e.clientY, s0: b.start, e0: b.end, start: b.start, end: b.end, active: false };
    const x0 = e.clientX;
    if (e.pointerType !== 'mouse') {
      holdTimer = setTimeout(() => {
        if (!drag) return;
        drag.active = true;
        vibrate(12);
      }, 300);
    }
    const move = (ev: PointerEvent) => {
      if (!drag) return;
      const dy = ev.clientY - drag.y0;
      if (!drag.active) {
        if (ev.pointerType === 'mouse' && Math.abs(dy) > 4) drag.active = true;
        else if (Math.hypot(dy, ev.clientX - x0) > 8) return end(); // finger moved first: it's a scroll
        else return;
      }
      autoScroll(ev.clientY);
      const delta = snap(((dy + scrolled) / H) * 60);
      if (drag.mode === 'move') {
        const len = drag.e0 - drag.s0;
        drag.start = Math.max(0, Math.min(24 * 60 - len, drag.s0 + delta));
        drag.end = drag.start + len;
      } else {
        drag.end = Math.max(drag.s0 + SNAP, Math.min(24 * 60, drag.e0 + delta));
      }
    };
    const up = () => {
      if (drag?.active && (drag.start !== drag.s0 || drag.end !== drag.e0)) {
        store.update(drag.id, { plan_start: fromMin(drag.start), plan_end: fromMin(Math.min(drag.end, 24 * 60 - 1)) });
        vibrate(8);
      }
      if (drag?.active) {
        justDragged = true;
        setTimeout(() => (justDragged = false), 0);
      }
      end();
    };
    const end = () => {
      clearTimeout(holdTimer);
      cancelAnimationFrame(scrollRaf);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', end);
      drag = null;
      scrolled = 0;
    };
    let scrolled = 0;
    let scrollRaf = 0;
    const autoScroll = (y: number) => {
      cancelAnimationFrame(scrollRaf);
      const r = scroller!.getBoundingClientRect();
      const v = y < r.top + 40 ? -8 : y > r.bottom - 40 ? 8 : 0;
      if (!v) return;
      const step = () => {
        const before = scroller!.scrollTop;
        scroller!.scrollTop += v;
        scrolled += scroller!.scrollTop - before;
        scrollRaf = requestAnimationFrame(step);
      };
      scrollRaf = requestAnimationFrame(step);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', end);
  }

  /** Position for a block, following the drag while it is being moved. */
  const pos = (b: PlanBlock) => (drag?.active && drag.id === b.task.id ? { start: drag.start, end: drag.end } : b);

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
    {#if top.plans.length || top.dues.length || meets.length}
      <div class="allday" data-testid="allday">
        <span class="allday-label">終日</span>
        <div class="allday-items">
          {#each meets as m (m.id)}
            <button class="ad-meet" style="--c:{COLOR_HEX[m.color]}" onclick={() => router.openEvent(m.id)} data-testid="allday-meet">{m.name}</button>
          {/each}
          {#each top.plans as t (t.id)}
            <button class="ad-plan" class:event={t.kind === 'event'} data-status={t.status} onclick={() => sheet.edit(t.id)} data-testid="allday-plan" in:scale={{ start: 0.8, duration: 380, easing: backOut }}>
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
            {@const p = pos(b)}
            {@const dragging = drag?.active && drag.id === b.task.id}
            <button
              class="block"
              class:dragging
              class:short={((p.end - p.start) / 60) * H < 40}
              class:narrow={b.span / b.cols < 0.34}
              data-status={b.task.status}
              data-kind={b.task.kind}
              style="top:{(p.start / 60) * H}px; height:{Math.max(((p.end - p.start) / 60) * H - 2, MIN_BLOCK)}px; --lines:{Math.max(1, Math.floor((((p.end - p.start) / 60) * H - 10) / 14))}; left:calc({(b.col / b.cols) * 100}% + 2px); width:calc({(100 * b.span) / b.cols}% - 4px)"
              onpointerdown={(e) => press(e, b, 'move')}
              onclick={(e) => (e.stopPropagation(), !justDragged && sheet.edit(b.task.id))}
              in:scale={{ start: 0.85, duration: 420, delay: i * 40, easing: backOut }}
              aria-label="{b.task.title} {b.task.plan_start}–{b.task.plan_end ?? ''}（{b.task.kind === 'event' ? '予定' : STATUS_LABEL[b.task.status]}）"
              data-testid="block"
            >
              <strong>{b.task.title}</strong>
              <span>{dragging ? `${fromMin(p.start)}–${fromMin(Math.min(p.end, 1439))}` : `${b.task.plan_start}${b.task.plan_end ? `–${b.task.plan_end}` : ''}`}</span>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="resize" onpointerdown={(e) => press(e, b, 'resize')} aria-hidden="true" data-testid="block-resize"></span>
              {#if dragging}
                <span class="drag-time" in:scale={{ start: 0.7, duration: 200, easing: backOut }} data-testid="drag-time">{fromMin(p.start)}</span>
              {/if}
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
