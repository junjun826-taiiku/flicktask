<script lang="ts">
  // Add 準備 tasks: Enter adds one per line (bullets stripped); AI splits a memo and picks up deadlines.
  import { slide } from 'svelte/transition';
  import { store, type AiSuggestion, type FEvent } from '../../lib/store.svelte';
  import { stripBullet } from '../../lib/bullets';
  import { toasts } from '../../lib/toast.svelte';

  let { event }: { event: FEvent | null } = $props();
  let text = $state('');
  let el = $state<HTMLTextAreaElement>();
  let busy = $state(false);
  let suggestions = $state<(AiSuggestion & { on: boolean })[]>([]);

  function grow() {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }
  function addLines(lines: { title: string; due_date?: string | null; due_time?: string | null }[]) {
    const now = Date.now();
    // first line on top
    lines.forEach((l, i) => store.add(l.title, now + lines.length - 1 - i, { event_id: event?.id ?? null, due_date: l.due_date ?? null, due_time: l.due_time ?? null }));
    if (lines.length > 1) toasts.show(`${lines.length}件追加しました`);
  }
  function submit() {
    const lines = text.split('\n').map(stripBullet).filter(Boolean);
    if (!lines.length) return;
    addLines(lines.map((title) => ({ title })));
    text = '';
    queueMicrotask(grow);
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

<div class="add">
  <label class="field nx-chip">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    <textarea
      bind:this={el}
      bind:value={text}
      oninput={grow}
      onkeydown={keydown}
      rows="1"
      placeholder={event ? '準備のタスクを追加（Enter で追加・箇条書きはまとめて）' : 'タスクを追加'}
      aria-label="準備のタスクを追加"
      data-testid="nx-add"
    ></textarea>
    <button class="ai" onclick={ai} disabled={busy || !text.trim()} data-testid="nx-ai">{busy ? '分解中…' : 'AIで分解'}</button>
  </label>
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
  .add { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .field { min-height: 42px; padding: 8px 8px 8px 12px; border-radius: 12px; display: flex; align-items: flex-start; gap: 8px; }
  .field svg { flex: none; width: 16px; height: 16px; margin-top: 5px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
  textarea { flex: 1; min-width: 0; min-height: 26px; resize: none; border: 0; outline: 0; background: transparent; color: var(--text); font: 500 14px/1.6 var(--font); padding: 2px 0; }
  textarea::placeholder { color: var(--muted); }
  .ai { flex: none; height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--sub); border: 1px solid var(--border); }
  .ai:disabled { opacity: 0.45; cursor: default; }
  .sugg { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
  .s { display: flex; align-items: center; gap: 10px; min-height: 34px; font-size: 13.5px; }
  .s .t { flex: 1; min-width: 0; }
  .s .d { flex: none; font-size: 11.5px; font-weight: 700; color: var(--sub); padding: 2px 8px; border-radius: 999px; border: 1.3px dashed var(--muted); }
  .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .acts button { height: 32px; padding: 0 14px; border-radius: 9px; font-size: 12.5px; font-weight: 700; }
  .acts .ghost { color: var(--sub); }
  .acts .primary { color: var(--bg); background: var(--text); }
  .acts .primary:disabled { opacity: 0.4; }
</style>
