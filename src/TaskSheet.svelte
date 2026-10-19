<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, STATUS_LABEL, STATUS_ORDER, type Details } from './lib/store.svelte';
  import { sheet } from './lib/sheet.svelte';
  import { toasts } from './lib/toast.svelte';
  import { fromMin, toMin, today } from './lib/dates';
  import { vibrate } from './lib/motion';

  const blank = (): Details => ({ title: '', status: 'todo', note: '', due_date: null, due_time: null, plan_date: null, plan_start: null, plan_end: null });

  let draft = $state<Details>(blank());
  let isNew = $state(false);
  let dy = $state(0);
  let dragging = $state(false);
  let titleEl = $state<HTMLTextAreaElement>();
  let noteEl = $state<HTMLTextAreaElement>();
  let panel = $state<HTMLDivElement>();

  // Load the draft each time the sheet opens.
  $effect(() => {
    if (!sheet.open) return;
    const id = sheet.taskId;
    // untracked: a background sync touching store.tasks must not wipe the user's in-progress edits
    untrack(() => load(id));
  });
  function load(id: string | null) {
    const t = id ? store.tasks.find((x) => x.id === id) : null;
    isNew = !t;
    draft = t
      ? { title: t.title, status: t.status, note: t.note, due_date: t.due_date, due_time: t.due_time, plan_date: t.plan_date, plan_start: t.plan_start, plan_end: t.plan_end }
      : { ...blank(), ...sheet.prefill };
    dy = 0;
    tick().then(() => {
      grow(titleEl);
      grow(noteEl);
      if (isNew) titleEl?.focus();
    });
  }

  function grow(el?: HTMLTextAreaElement) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function close() {
    if (!sheet.open) return;
    const d = $state.snapshot(draft);
    // empty <input type=date|time> yields '' → store null
    for (const k of ['due_date', 'due_time', 'plan_date', 'plan_start', 'plan_end'] as const) if (!d[k]) d[k] = null;
    if (isNew) {
      if (d.title.trim()) {
        const { title, ...rest } = d;
        store.add(title, Date.now(), rest);
        toasts.show('追加しました');
      }
    } else if (sheet.taskId) {
      store.update(sheet.taskId, d);
    }
    sheet.close();
  }

  function remove() {
    const id = sheet.taskId;
    if (!id) return sheet.close();
    sheet.close();
    store.remove(id);
    vibrate(12);
    toasts.show('削除しました', { label: '元に戻す', run: () => store.restore(id) });
  }

  // --- deadline / schedule editing ---
  function setDue(on: boolean) {
    draft.due_date = on ? (draft.plan_date ?? today()) : null;
    if (!on) draft.due_time = null;
  }
  function setPlan(on: boolean) {
    if (!on) {
      draft.plan_date = draft.plan_start = draft.plan_end = null;
      return;
    }
    const start = Math.ceil((new Date().getHours() * 60 + new Date().getMinutes() + 1) / 30) * 30;
    draft.plan_date = draft.due_date ?? today();
    draft.plan_start = fromMin(Math.min(start, 22 * 60));
    draft.plan_end = fromMin(Math.min(start, 22 * 60) + 60);
  }
  // keep the block at least 15 minutes long, preserving its length when the start moves
  let lastStart = $state<string | null>(null);
  $effect(() => {
    const s = draft.plan_start;
    if (!s || !draft.plan_end) return void (lastStart = s);
    if (lastStart && s !== lastStart) {
      const len = Math.max(15, toMin(draft.plan_end) - toMin(lastStart));
      draft.plan_end = fromMin(toMin(s) + len);
    } else if (toMin(draft.plan_end) <= toMin(s)) {
      draft.plan_end = fromMin(toMin(s) + 15);
    }
    lastStart = s;
  });

  // --- drag the grabber down to dismiss ---
  let startY = 0;
  let startT = 0;
  function onDown(e: PointerEvent) {
    dragging = true;
    startY = e.clientY;
    startT = performance.now();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    const d = e.clientY - startY;
    dy = d > 0 ? d : d * 0.2;
  }
  function onUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const v = (e.clientY - startY) / Math.max(1, performance.now() - startT);
    if (dy > 120 || (v > 0.6 && dy > 30)) close();
    else dy = 0;
  }
</script>

<svelte:window onkeydown={(e) => sheet.open && e.key === 'Escape' && close()} />

{#if sheet.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 260 }} onclick={close}></div>
  <div
    bind:this={panel}
    class="sheet glass"
    class:dragging
    style="transform: translate3d(0,{dy}px,0)"
    role="dialog"
    aria-modal="true"
    aria-label={isNew ? '新しいタスク' : 'タスクの詳細'}
    in:fly={{ y: 420, duration: 520, easing: backOut, opacity: 1 }}
    out:fly={{ y: 520, duration: 300, easing: cubicOut, opacity: 1 }}
    data-testid="sheet"
  >
    <div class="grab" onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} aria-hidden="true">
      <span></span>
    </div>

    <div class="sheet-head">
      {#if !isNew}
        <button class="ghost danger" onclick={remove} data-testid="sheet-delete">削除</button>
      {:else}
        <span></span>
      {/if}
      <button class="primary" onclick={close} data-testid="sheet-done">{isNew ? '追加' : '保存'}</button>
    </div>

    <div class="sheet-body">
      <textarea
        bind:this={titleEl}
        bind:value={draft.title}
        oninput={() => grow(titleEl)}
        onkeydown={(e) => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && (e.preventDefault(), noteEl?.focus())}
        class="sheet-title"
        rows="1"
        placeholder="タイトル"
        aria-label="タイトル"
        data-testid="sheet-title"
      ></textarea>

      <div class="status-pick" role="radiogroup" aria-label="ステータス" style="--i:{STATUS_ORDER.indexOf(draft.status)}">
        <span class="status-thumb" data-status={draft.status} aria-hidden="true"></span>
        {#each STATUS_ORDER as s}
          <button role="radio" aria-checked={draft.status === s} class:active={draft.status === s} onclick={() => (draft.status = s)} data-testid="sheet-status-{s}">
            {STATUS_LABEL[s]}
          </button>
        {/each}
      </div>

      <label class="field note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" /></svg>
        <textarea
          bind:this={noteEl}
          bind:value={draft.note}
          oninput={() => grow(noteEl)}
          rows="2"
          placeholder="メモ"
          aria-label="メモ"
          data-testid="sheet-note"
        ></textarea>
      </label>

      <!-- Deadline: drawn as an outline / line everywhere, never as a filled block -->
      <section class="field-group due" class:on={!!draft.due_date}>
        <button class="toggle-row" onclick={() => setDue(!draft.due_date)} aria-pressed={!!draft.due_date} data-testid="sheet-due-toggle">
          <span class="kind-icon due-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" /></svg>
          </span>
          <span class="label">期限</span>
          <span class="switch" aria-hidden="true"><i></i></span>
        </button>
        {#if draft.due_date}
          <div class="inputs" transition:slide={{ duration: 280, easing: cubicOut }}>
            <input type="date" bind:value={draft.due_date} required aria-label="期限の日付" data-testid="sheet-due-date" />
            <input type="time" bind:value={draft.due_time} aria-label="期限の時刻" data-testid="sheet-due-time" />
            {#if draft.due_time}
              <button class="clear" onclick={() => (draft.due_time = null)} aria-label="時刻を外す">×</button>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Scheduled time: drawn as a filled block everywhere -->
      <section class="field-group plan" class:on={!!draft.plan_date}>
        <button class="toggle-row" onclick={() => setPlan(!draft.plan_date)} aria-pressed={!!draft.plan_date} data-testid="sheet-plan-toggle">
          <span class="kind-icon plan-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
          </span>
          <span class="label">やる時間</span>
          <span class="switch" aria-hidden="true"><i></i></span>
        </button>
        {#if draft.plan_date}
          <div class="inputs" transition:slide={{ duration: 280, easing: cubicOut }}>
            <input type="date" bind:value={draft.plan_date} required aria-label="やる日" data-testid="sheet-plan-date" />
            <input type="time" bind:value={draft.plan_start} aria-label="開始時刻" data-testid="sheet-plan-start" />
            <span class="dash">–</span>
            <input type="time" bind:value={draft.plan_end} aria-label="終了時刻" data-testid="sheet-plan-end" />
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}
