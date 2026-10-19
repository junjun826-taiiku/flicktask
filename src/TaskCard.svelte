<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { store, STATUS_LABEL, STATUS_ORDER, type Task, type Status } from './lib/store.svelte';
  import { toasts } from './lib/toast.svelte';
  import { vibrate } from './lib/motion';
  import { sheet } from './lib/sheet.svelte';
  import { dueState, shortLabel } from './lib/dates';

  let { task, hint = false }: { task: Task; hint?: boolean } = $props();

  type Action = { kind: 'status'; to: Status } | { kind: 'delete' } | null;

  let surface: HTMLDivElement;
  let dx = $state(0);
  let dragging = $state(false);
  let animating = $state(false);
  let instant = $state(false);
  let settle = $state<0 | 1 | -1>(0);

  let start = { x: 0, y: 0, t: 0 };
  let tracking = false;
  let armed = false;
  let suppressClick = false;

  const idx = $derived(STATUS_ORDER.indexOf(task.status));
  const rightAction: Action = $derived(idx < 2 ? { kind: 'status', to: STATUS_ORDER[idx + 1] } : null);
  const leftAction: Action = $derived(idx > 0 ? { kind: 'status', to: STATUS_ORDER[idx - 1] } : { kind: 'delete' });
  const side = $derived(dx > 0 ? 'right' : dx < 0 ? 'left' : null);
  const action = $derived(side === 'right' ? rightAction : side === 'left' ? leftAction : null);
  const width = () => surface?.offsetWidth ?? 320;
  const threshold = () => Math.min(110, width() * 0.28);
  const progress = $derived(Math.min(1, Math.abs(dx) / threshold()));

  function onDown(e: PointerEvent) {
    if (e.button !== 0 || animating) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now() };
    tracking = true;
    armed = false;
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse' && surface) {
      const r = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${e.clientX - r.left}px`);
      surface.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    if (!tracking) return;
    const ddx = e.clientX - start.x;
    const ddy = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy) * 1.2) {
        dragging = true;
        surface.setPointerCapture(e.pointerId);
      } else if (Math.abs(ddy) > 10) {
        tracking = false;
      }
      return;
    }
    const possible = ddx > 0 ? rightAction : leftAction;
    dx = possible ? ddx : ddx * 0.22; // rubber band when nothing to do on that side
    const isArmed = !!possible && Math.abs(dx) >= threshold();
    if (isArmed !== armed) {
      armed = isArmed;
      if (armed) vibrate(10);
    }
  }

  function onUp(e: PointerEvent) {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const v = (e.clientX - start.x) / Math.max(1, performance.now() - start.t); // px/ms
    const fling = Math.abs(v) > 0.65 && Math.abs(dx) > 36 && Math.sign(v) === Math.sign(dx);
    if (action && (Math.abs(dx) >= threshold() || fling)) commit(action, Math.sign(dx) as 1 | -1);
    else dx = 0;
  }

  function onCancel() {
    tracking = false;
    dragging = false;
    dx = 0;
  }

  async function commit(a: NonNullable<Action>, dir: 1 | -1) {
    animating = true;
    dx = dir * (width() + 60);
    vibrate(14);
    await new Promise((r) => setTimeout(r, 230));
    const id = task.id;
    if (a.kind === 'delete') {
      store.remove(id);
      toasts.show('削除しました', { label: '元に戻す', run: () => store.restore(id) });
    } else {
      const from = task.status;
      store.setStatus(id, a.to);
      if (store.filter !== 'all')
        toasts.show(`${STATUS_LABEL[a.to]}へ移動`, { label: '元に戻す', run: () => store.setStatus(id, from) });
    }
    // If the card is still shown (e.g. "すべて" view), glide it back in from the opposite side.
    instant = true;
    dx = 0;
    settle = 0;
    await tick();
    settle = dir;
    requestAnimationFrame(() => {
      instant = false;
      animating = false;
    });
  }

  function cycle(e: MouseEvent) {
    e.stopPropagation();
    store.setStatus(task.id, task.status === 'done' ? 'todo' : STATUS_ORDER[idx + 1]);
    vibrate(8);
  }

  function openDetail() {
    if (suppressClick) return;
    sheet.edit(task.id);
  }
  const due = $derived(dueState(task.due_date, task.due_time));

  function onKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowRight' && rightAction) commit(rightAction, 1);
    else if (e.key === 'ArrowLeft' && leftAction) commit(leftAction, -1);
    else if (e.key === 'Enter') sheet.edit(task.id);
    else if (e.key === 'Delete' || e.key === 'Backspace') commit({ kind: 'delete' }, -1);
    else return;
    e.preventDefault();
  }

  onMount(() => {
    if (!hint) return;
    let seen = false;
    try {
      seen = !!localStorage.getItem('ft.hinted');
      localStorage.setItem('ft.hinted', '1');
    } catch {}
    if (seen) return;
    // one-time wordless hint: the card peeks right, then left
    const steps: [number, number][] = [[900, 64], [1350, 0], [1700, -64], [2150, 0]];
    for (const [at, x] of steps) setTimeout(() => !dragging && (dx = x), at);
  });

  function actionLabel(a: Action) {
    if (!a) return '';
    return a.kind === 'delete' ? '削除' : STATUS_LABEL[a.to];
  }
</script>

<div
  class="swipe"
  class:active={dragging || dx !== 0}
  data-side={side}
  data-kind={action?.kind === 'delete' ? 'delete' : action ? action.to : 'none'}
  style="--p:{progress}"
>
  <div class="reveal reveal-right" class:armed={side === 'right' && progress >= 1} aria-hidden="true">
    <span class="reveal-icon">
      {#if rightAction?.kind === 'status' && rightAction.to === 'done'}
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      {:else}
        <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
      {/if}
    </span>
    <span class="reveal-text">{actionLabel(rightAction)}</span>
  </div>
  <div class="reveal reveal-left" class:armed={side === 'left' && progress >= 1} aria-hidden="true">
    <span class="reveal-text">{actionLabel(leftAction)}</span>
    <span class="reveal-icon">
      {#if leftAction?.kind === 'delete'}
        <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
      {:else}
        <svg viewBox="0 0 24 24"><path d="M19 12H6M11 6l-6 6 6 6" /></svg>
      {/if}
    </span>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={surface}
    class="card glass status-{task.status}"
    class:dragging
    class:flying={animating && !instant}
    class:instant
    class:settle-r={settle === 1}
    class:settle-l={settle === -1}
    style="transform: translate3d({dx}px,0,0) rotate({dx * 0.012}deg)"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onCancel}
    onanimationend={() => (settle = 0)}
    onkeydown={onKey}
    tabindex="0"
    role="listitem"
    aria-label="{task.title}（{STATUS_LABEL[task.status]}）"
    data-testid="task-card"
    data-status={task.status}
    data-id={task.id}
  >
    <span class="specular" aria-hidden="true"></span>
    <button class="status-dot" onclick={cycle} aria-label="ステータスを進める" data-testid="status-dot">
      {#key task.status}
        <svg viewBox="0 0 28 28" in:scale={{ start: 0.4, duration: 420, easing: backOut }}>
          {#if task.status === 'todo'}
            <circle cx="14" cy="14" r="10" class="ring" />
          {:else if task.status === 'doing'}
            <circle cx="14" cy="14" r="10" class="ring" />
            <path d="M14 4a10 10 0 0 1 0 20z" class="half" />
          {:else}
            <circle cx="14" cy="14" r="11" class="fill" />
            <path d="M8.5 14.5l3.8 3.8 7.2-8" class="check" />
          {/if}
        </svg>
      {/key}
    </button>

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="body" onclick={openDetail} data-testid="task-open">
      <span class="title" data-testid="task-title">{task.title}</span>
      {#if task.due_date || task.plan_date || task.note}
        <span class="meta">
          {#if task.plan_date}
            <span class="chip plan-chip" data-testid="chip-plan">
              <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2.5" /></svg>
              {shortLabel(task.plan_date, task.plan_start)}{task.plan_end ? `–${task.plan_end.replace(/^0/, '')}` : ''}
            </span>
          {/if}
          {#if task.due_date}
            <span class="chip due-chip" data-due={due} data-testid="chip-due">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 2.5h7.5L10 5.2l1.5 2.8H4" /></svg>
              {shortLabel(task.due_date, task.due_time)}
            </span>
          {/if}
          {#if task.note}
            <span class="chip note-chip" aria-label="メモあり" data-testid="chip-note">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" /></svg>
            </span>
          {/if}
        </span>
      {/if}
    </div>

    <span class="badge" data-status={task.status}>{STATUS_LABEL[task.status]}</span>
  </div>
</div>
