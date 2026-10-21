<script lang="ts">
  // Status columns. PC: drag a card to another column. Phone: one column at a time, flick a card to move it.
  // Keyboard: ← / → on a focused card moves it, Enter opens it.
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import { store, STATUS_ORDER, type FEvent, type Status, type Task } from '../../lib/store.svelte';
  import { addDays, today as todayFn, weekday } from '../../lib/dates';
  import { toasts } from '../../lib/toast.svelte';
  import { aimDate } from '../home';
  import { byAim, memberColor, STATUS_COLUMNS } from './prep';

  let { tasks, event, selected, open }: { tasks: Task[]; event: FEvent | null; selected: string | null; open: (id: string) => void } = $props();
  const today = todayFn();
  let phoneCol = $state<Status>('todo');
  let dropOn = $state<Status | null>(null);
  let dragging = $state<string | null>(null);

  const columns = $derived(STATUS_COLUMNS.map((c) => ({ ...c, items: tasks.filter((t) => t.status === c.status).sort(byAim(event)) })));
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
  function due(t: Task) {
    const d = aimDate(t, event);
    if (!d) return { text: '日付なし', over: false };
    const over = d < today && t.status !== 'done';
    return { text: over ? `期限切れ ${md(d)}` : d === today ? '今日' : d === addDays(today, 1) ? '明日' : `${md(d)}(${weekday(d)})`, over };
  }
  function move(t: Task, to: Status) {
    if (t.status === to) return;
    const from = t.status;
    store.setStatus(t.id, to);
    if (to === 'done') toasts.show(`「${t.title}」完了`, { label: '元に戻す', run: () => store.setStatus(t.id, from) });
  }
  function shift(t: Task, dir: 1 | -1) {
    const i = STATUS_ORDER.indexOf(t.status) + dir;
    if (i >= 0 && i < STATUS_ORDER.length) move(t, STATUS_ORDER[i]);
  }

  // phone flick
  /** a flick ends with a click event; it must not also open the card */
  let justSwiped = false;
  let sx = 0, sy = 0, dx = $state(0), swiping = $state<string | null>(null), axisLocked: 'x' | 'y' | null = null;
  function down(e: PointerEvent, t: Task) {
    if (e.pointerType === 'mouse') return;
    swiping = t.id;
    sx = e.clientX;
    sy = e.clientY;
    dx = 0;
    axisLocked = null;
  }
  function moveP(e: PointerEvent) {
    if (!swiping) return;
    const x = e.clientX - sx, y = e.clientY - sy;
    if (!axisLocked && Math.hypot(x, y) > 8) axisLocked = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
    if (axisLocked === 'x') dx = x;
  }
  function up(t: Task) {
    if (swiping !== t.id) return;
    if (axisLocked === 'x') justSwiped = true;
    if (axisLocked === 'x' && Math.abs(dx) > 90) shift(t, dx > 0 ? 1 : -1);
    swiping = null;
    dx = 0;
  }
</script>

<div class="phone-seg nx-chip" role="group" aria-label="状態">
  {#each columns as c}
    <button class:on={phoneCol === c.status} aria-pressed={phoneCol === c.status} onclick={() => (phoneCol = c.status)} data-testid="nx-col-pick-{c.status}">{c.label} <span class="nx-num">{c.items.length}</span></button>
  {/each}
</div>

<div class="board">
  {#each columns as c (c.status)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="col"
      class:phone-on={phoneCol === c.status}
      class:drop={dropOn === c.status}
      ondragover={(e) => (e.preventDefault(), (dropOn = c.status))}
      ondragleave={() => dropOn === c.status && (dropOn = null)}
      ondrop={(e) => {
        e.preventDefault();
        dropOn = null;
        const t = tasks.find((x) => x.id === e.dataTransfer?.getData('text/plain'));
        if (t) move(t, c.status);
      }}
      data-testid="nx-col-{c.status}"
    >
      <div class="col-head">
        <i class="ic {c.status}"></i>
        <span>{c.label}</span>
        <span class="n nx-num">{c.items.length}</span>
      </div>
      <div class="cards">
        {#each c.items as t (t.id)}
          {@const d = due(t)}
          <div
            class="card"
            class:sel={selected === t.id}
            class:ghost={dragging === t.id}
            class:done={t.status === 'done'}
            role="button"
            tabindex="0"
            draggable="true"
            ondragstart={(e) => {
              e.dataTransfer?.setData('text/plain', t.id);
              dragging = t.id;
            }}
            ondragend={() => ((dragging = null), (dropOn = null))}
            onclick={() => (justSwiped ? (justSwiped = false) : open(t.id))}
            onkeydown={(e) => {
              if (e.key === 'Enter') open(t.id);
              else if (e.key === 'ArrowRight') shift(t, 1);
              else if (e.key === 'ArrowLeft') shift(t, -1);
            }}
            onpointerdown={(e) => down(e, t)}
            onpointermove={moveP}
            onpointerup={() => up(t)}
            onpointercancel={() => ((swiping = null), (dx = 0))}
            style={swiping === t.id && dx ? `transform: translateX(${dx}px) rotate(${dx * 0.02}deg)` : ''}
            animate:flip={{ duration: 280 }}
            in:fade={{ duration: 180 }}
            aria-label="{t.title}（{c.label}）"
            data-testid="nx-card"
          >
            <span class="t">{t.title}</span>
            <span class="meta">
              <span class="due" class:over={d.over}>{d.text}</span>
              {#if t.note}<span class="note" title="メモあり">メモ</span>{/if}
              <span class="people">
                {#each t.assignees as n}<span class="av" style="background:{memberColor(event, n)}" title={n}>{n[0]}</span>{/each}
              </span>
            </span>
          </div>
        {/each}
        {#if c.items.length === 0}<p class="empty">なし</p>{/if}
      </div>
    </div>
  {/each}
</div>
<p class="hint">カードをドラッグして列を移すと状態が変わります。各列の中は締切順です。</p>

<style>
  .phone-seg { display: none; }
  .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .col { min-width: 0; padding: 10px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); transition: border-color 0.15s, background 0.15s; }
  .col.drop { border-color: var(--accent); background: var(--hi); }
  .col-head { display: flex; align-items: center; gap: 8px; padding: 2px 4px 8px; font-size: 13px; font-weight: 800; }
  .col-head .n { font-size: 12px; color: var(--muted); }
  .ic { width: 12px; height: 12px; border-radius: 50%; }
  .ic.todo { border: 2px solid var(--muted); }
  .ic.doing { border: 2px solid var(--accent); background: linear-gradient(90deg, transparent 50%, var(--accent) 50%); }
  .ic.done { background: #2fbf7f; }
  .cards { display: flex; flex-direction: column; gap: 8px; min-height: 40px; }
  .card { text-align: left; padding: 11px 12px; border-radius: 12px; background: var(--panel); border: 1px solid var(--border); cursor: grab; user-select: none; -webkit-user-select: none; touch-action: pan-y; transition: border-color 0.15s, opacity 0.15s; }
  .card:hover { border-color: var(--sub); }
  .card.sel { border-color: var(--text); }
  .card.ghost { opacity: 0.4; }
  .card.done .t { color: var(--muted); text-decoration: line-through; }
  .t { display: block; font-size: 13.5px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
  .meta { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .due { height: 22px; padding: 0 8px; border-radius: 999px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; color: var(--sub); border: 1.3px dashed var(--muted); white-space: nowrap; }
  .due.over { color: var(--over-text); border-color: rgba(255, 107, 91, 0.8); }
  .note { font-size: 10.5px; font-weight: 700; color: var(--muted); padding: 1px 6px; border-radius: 6px; background: var(--chip); }
  .people { margin-left: auto; display: flex; }
  .av { width: 22px; height: 22px; margin-left: -5px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 10.5px; font-weight: 800; color: #fff; box-shadow: 0 0 0 2px var(--ring); }
  .empty { margin: 4px; font-size: 12px; color: var(--muted); }
  .hint { margin: 12px 4px 0; font-size: 11.5px; color: var(--muted); }
  @media (max-width: 760px) {
    .phone-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 3px; border-radius: 12px; margin-bottom: 10px; }
    .phone-seg button { height: 36px; border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--sub); }
    .phone-seg button.on { color: var(--text); background: var(--hi); }
    .board { grid-template-columns: minmax(0, 1fr); }
    .col { display: none; padding: 0; background: none; border: 0; }
    .col.phone-on { display: block; }
    .col-head { display: none; }
    .card { cursor: default; }
    .hint { font-size: 0; }
    .hint::after { content: '右にフリックで次の状態、左で前の状態'; font-size: 11.5px; }
  }
</style>
