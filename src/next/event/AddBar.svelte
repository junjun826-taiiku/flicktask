<script lang="ts">
  // Add 準備 tasks: a title (several lines = several tasks, bullets stripped), then optional 締切日・時刻 and 着手目安日
  // that apply to everything added at once. AI splits a memo and picks up deadlines.
  import { slide } from 'svelte/transition';
  import { store, type AiSuggestion, type FEvent } from '../../lib/store.svelte';
  import { stripBullet } from '../../lib/bullets';
  import { today as todayFn } from '../../lib/dates';
  import { toasts } from '../../lib/toast.svelte';

  let { event }: { event: FEvent | null } = $props();
  let text = $state('');
  let due = $state('');
  let time = $state('');
  let start = $state('');
  let el = $state<HTMLTextAreaElement>();
  let busy = $state(false);
  let suggestions = $state<(AiSuggestion & { on: boolean })[]>([]);
  const lines = $derived(text.split('\n').map(stripBullet).filter(Boolean));
  const backwards = $derived(!!due && !!start && start > due);

  function grow() {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }
  function addLines(rows: { title: string; due_date?: string | null; due_time?: string | null }[]) {
    const now = Date.now();
    const start_on = start || null;
    // a start day that has already come means the work is under way
    const status = start_on && start_on <= todayFn() ? ('doing' as const) : ('todo' as const);
    // first line on top
    rows.forEach((l, i) =>
      store.add(l.title, now + rows.length - 1 - i, {
        event_id: event?.id ?? null,
        due_date: l.due_date ?? (due || null),
        due_time: l.due_date ? (l.due_time ?? null) : due ? time || null : null,
        start_on,
        status,
      }),
    );
    if (rows.length > 1 || status === 'doing')
      toasts.show(`${rows.length > 1 ? `${rows.length}件追加しました` : '追加しました'}${status === 'doing' ? '（着手目安日を過ぎているので進行中に）' : ''}`);
    due = time = start = '';
  }
  function submit() {
    if (!lines.length) return el?.focus();
    addLines(lines.map((title) => ({ title })));
    text = '';
    queueMicrotask(grow);
    el?.focus();
  }
  function keydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  }
  async function ai() {
    if (!text.trim() || busy) return;
    if (!store.user) {
      toasts.show('AIはログイン後に使えます');
      return;
    }
    busy = true;
    try {
      const r = await store.aiSplit(text);
      if (!r.tasks.length) toasts.show('タスクが見つかりませんでした');
      suggestions = r.tasks.map((t) => ({ ...t, on: true }));
      if (r.rest.length) toasts.show(`残り${r.rest.length}件は入りきりませんでした`);
    } catch {
      toasts.show('AIに接続できませんでした');
    } finally {
      busy = false;
    }
  }
  function accept() {
    addLines(suggestions.filter((s) => s.on));
    suggestions = [];
    text = '';
    queueMicrotask(grow);
  }
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
</script>

<div class="add nx-chip" data-testid="nx-addform">
  <div class="title-row">
    <span class="plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
    <textarea
      bind:this={el}
      bind:value={text}
      oninput={grow}
      onkeydown={keydown}
      rows="1"
      placeholder={event ? '新しい準備タスク（改行で区切ると、まとめて追加）' : '新しいタスク（改行で区切ると、まとめて追加）'}
      aria-label="タスク名"
      data-testid="nx-add"
    ></textarea>
    <button class="ai" onclick={ai} disabled={busy || !text.trim()} title="メモを貼ると、AIがタスクと締切に分けます" data-testid="nx-ai">{busy ? '分解中…' : 'AIで分解'}</button>
  </div>
  <div class="opts">
    <label class="opt" class:set={!!due}>
      <span>締切日</span>
      <input type="date" bind:value={due} data-testid="nx-add-due" />
    </label>
    <label class="opt" class:set={!!time} class:off={!due}>
      <span>締切時刻</span>
      <input type="time" bind:value={time} disabled={!due} data-testid="nx-add-time" />
    </label>
    <label class="opt" class:set={!!start} class:warn={backwards}>
      <span>着手目安日</span>
      <input type="date" bind:value={start} max={due || undefined} data-testid="nx-add-start" />
    </label>
    <span class="hint">{backwards ? '着手目安日が締切より後になっています' : 'どれも任意です'}</span>
    <button class="go" onclick={submit} disabled={!lines.length} data-testid="nx-add-submit">{lines.length > 1 ? `${lines.length}件追加` : '追加'}</button>
  </div>
  {#if suggestions.length}
    <div class="sugg" transition:slide={{ duration: 220 }} data-testid="nx-ai-suggestions">
      {#each suggestions as s}
        <label class="s">
          <input type="checkbox" bind:checked={s.on} />
          <span class="t">{s.title}</span>
          {#if s.due_date}<span class="d">{md(s.due_date)}{s.due_time ? ` ${s.due_time}` : ''}</span>{/if}
        </label>
      {/each}
      <div class="acts">
        <button class="ghost" onclick={() => (suggestions = [])}>やめる</button>
        <button class="primary" onclick={accept} disabled={!suggestions.some((s) => s.on)} data-testid="nx-ai-accept">{suggestions.filter((s) => s.on).length}件追加</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .add { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 12px 10px 14px; border-radius: 14px; }
  .title-row { display: flex; align-items: flex-start; gap: 10px; }
  .plus { flex: none; width: 26px; height: 26px; margin-top: 2px; border-radius: 8px; display: grid; place-items: center; color: var(--bg); background: var(--text); }
  .plus svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; }
  textarea { flex: 1; min-width: 0; min-height: 30px; resize: none; border: 0; outline: 0; background: transparent; color: var(--text); font: 700 15px/1.6 var(--font); padding: 3px 0; }
  textarea::placeholder { color: var(--muted); font-weight: 600; }
  .ai { flex: none; height: 30px; padding: 0 10px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--sub); border: 1px solid var(--border); }
  .ai:disabled { opacity: 0.45; cursor: default; }
  .opts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border); }
  .opt { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 4px 0 10px; border-radius: 9px; border: 1px dashed var(--border); font-size: 11.5px; font-weight: 700; color: var(--muted); }
  .opt.set { color: var(--sub); border-style: solid; border-color: var(--sub); }
  .opt.off { opacity: 0.45; }
  .opt.warn { border-color: rgba(255, 107, 91, 0.8); }
  .opt input { height: 30px; width: auto; padding: 0 4px; border: 0; outline: 0; background: transparent; color: var(--text); font: 600 12.5px var(--font); color-scheme: inherit; }
  .opt input:disabled { cursor: default; }
  .hint { font-size: 11.5px; color: var(--muted); }
  .opt.warn ~ .hint { color: var(--over-text); }
  .go { margin-left: auto; height: 34px; padding: 0 18px; border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--bg); background: var(--text); }
  .go:disabled { opacity: 0.35; cursor: default; }
  .sugg { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
  .s { display: flex; align-items: center; gap: 10px; min-height: 34px; font-size: 13.5px; }
  .s .t { flex: 1; min-width: 0; }
  .s .d { flex: none; font-size: 11.5px; font-weight: 700; color: var(--sub); padding: 2px 8px; border-radius: 999px; border: 1.3px dashed var(--muted); }
  .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .acts button { height: 32px; padding: 0 14px; border-radius: 9px; font-size: 12.5px; font-weight: 700; }
  .acts .ghost { color: var(--sub); }
  .acts .primary { color: var(--bg); background: var(--text); }
  .acts .primary:disabled { opacity: 0.4; }
  @media (max-width: 760px) {
    .hint { display: none; }
    .go { flex: 1 0 100%; }
  }
</style>
