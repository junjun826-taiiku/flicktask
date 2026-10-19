<script lang="ts">
  import { fly, slide, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store } from './lib/store.svelte';
  import { toasts } from './lib/toast.svelte';
  import { vibrate } from './lib/motion';
  import { shortLabel, today } from './lib/dates';
  import type { AiSuggestion } from './lib/store.svelte';
  import { stripBullet } from './lib/bullets';
  import { sheet } from './lib/sheet.svelte';

  let host: HTMLDivElement;
  let el: HTMLTextAreaElement | null = null;
  let text = $state('');
  let thinking = $state(false);
  let pulse = $state(0);
  let suggestions = $state<(AiSuggestion & { on: boolean })[] | null>(null);
  let recovered = $state(0);
  let rest = $state<string[]>([]);

  /** Take over the boot skeleton's textarea so nothing typed before load is lost (value, caret, focus). */
  export function adopt() {
    const boot = document.getElementById('boot-memo') as HTMLTextAreaElement;
    const hadFocus = document.activeElement === boot || document.activeElement === document.body;
    const { selectionStart, selectionEnd } = boot;
    host.prepend(boot);
    (window as any).__ftAdopted = true;
    el = boot;
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeydown);
    text = el.value;
    grow();
    if (hadFocus) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  function grow() {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }
  function onInput() {
    text = el!.value;
    grow();
  }
  function setText(v: string) {
    el!.value = v;
    text = v;
    grow();
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  }

  function submit() {
    // one task per line, list markers (・ - 1. ① [ ] …) removed
    const lines = text.split('\n').map(stripBullet).filter(Boolean);
    if (!lines.length) return;
    // keep the memo's order: the first line ends up on top
    const base = Date.now();
    if (store.pane === 'schedule') {
      // schedule mode: calendar-only entries for today (all-day); time can be set from the toast
      const added = lines.map((l, i) => store.add(l, base + lines.length - 1 - i, { kind: 'event', plan_date: today() }));
      const first = added[0];
      toasts.show(
        lines.length > 1 ? `今日の予定に${lines.length}件追加しました` : '今日の予定に追加しました',
        lines.length === 1 && first ? { label: '日時を設定', run: () => sheet.edit(first.id) } : undefined,
      );
    } else lines.forEach((l, i) => store.add(l, base + lines.length - 1 - i));
    setText('');
    pulse++;
    vibrate(8);
    el?.focus();
  }

  async function ai() {
    if (!text.trim() || thinking) return;
    if (!store.user) {
      toasts.show('AIはログイン後に使えます', { label: 'ログイン', run: () => (location.href = '/auth/google') });
      return;
    }
    thinking = true;
    try {
      const r = await store.aiSplit(text);
      if (!r.tasks.length) toasts.show('タスクが見つかりませんでした');
      else {
        suggestions = r.tasks.map((t) => ({ ...t, on: true }));
        recovered = r.recovered;
        rest = r.rest;
      }
    } catch {
      toasts.show('AIに接続できませんでした');
    } finally {
      thinking = false;
    }
  }

  function acceptSuggestions() {
    const picked = $state.snapshot(suggestions!).filter((s) => s.on);
    suggestions = null;
    // anything past the 30-task cap goes back into the memo box, ready for another pass
    setText(rest.map((t) => `・${t}`).join('\n'));
    if (rest.length) toasts.show(`残り${rest.length}件をメモ欄に戻しました`);
    rest = [];
    const base = Date.now();
    // stagger so each card drops in one after another (last one on top)
    picked
      .reverse()
      .forEach(({ title, due_date, due_time }, i) => setTimeout(() => store.add(title, base + i, { due_date, due_time }), i * 90));
    vibrate(12);
  }
</script>

<section class="composer glass" class:thinking class:has-text={text.trim().length > 0} data-testid="composer">
  <div bind:this={host} class="memo-host"></div>
  {#key pulse}
    <span class="send-ripple" class:go={pulse > 0} aria-hidden="true"></span>
  {/key}
  <div class="composer-actions">
    <!-- where Enter sends the memo; follows the visible pane, tap to flip -->
    <button
      class="target-chip"
      class:event={store.pane === 'schedule'}
      onclick={() => (store.pane = store.pane === 'tasks' ? 'schedule' : 'tasks')}
      aria-label="追加先: {store.pane === 'tasks' ? 'タスク' : '予定'}（タップで切り替え）"
      data-testid="composer-target"
    >
      {#key store.pane}
        <span in:fly={{ y: 8, duration: 260, easing: backOut }}>→ {store.pane === 'tasks' ? 'タスク' : '予定'}</span>
      {/key}
    </button>
    <button
      class="icon-btn ai"
      class:busy={thinking}
      onclick={ai}
      disabled={!text.trim()}
      aria-label="AIでタスクに分解"
      title="AIでタスクに分解"
      data-testid="ai-button"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" opacity=".7" />
      </svg>
    </button>
    <button class="icon-btn send" onclick={submit} disabled={!text.trim()} aria-label="追加" data-testid="add-button">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>

  {#if suggestions}
    <div class="suggest" transition:slide={{ duration: 380, easing: cubicOut }} data-testid="ai-suggestions">
      <ul>
        {#each suggestions as s, i}
          <li in:fly={{ y: 10, delay: i * 60, duration: 420, easing: backOut }}>
            <button class="chip" class:off={!s.on} class:recovered={s.recovered} onclick={() => (s.on = !s.on)} aria-pressed={s.on}>
              <span class="tick" aria-hidden="true">
                {#if s.on}<svg viewBox="0 0 16 16" in:scale={{ duration: 260, easing: backOut }}><path d="M3.5 8.5l3 3 6-7" /></svg>{/if}
              </span>
              {s.title}
            </button>
            {#if s.due_date}
              <span class="chip due-chip ai-due" class:off={!s.on} data-testid="ai-due" in:scale={{ start: 0.6, duration: 320, delay: 120 + i * 60, easing: backOut }}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 2.5h7.5L10 5.2l1.5 2.8H4" /></svg>
                {shortLabel(s.due_date, s.due_time)}
                <button class="ai-due-x" onclick={() => ((s.due_date = null), (s.due_time = null))} aria-label="期限を外す" data-testid="ai-due-remove">×</button>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
      {#if recovered || rest.length}
        <div class="suggest-notes" in:fly={{ y: 6, duration: 320, delay: 200 }}>
          {#if recovered}
            <p data-testid="ai-recovered">AIが拾えなかった{recovered}件を、そのまま候補に入れました</p>
          {/if}
          {#if rest.length}
            <p data-testid="ai-overflow">一度に分解できるのは30件までです。残り{rest.length}件は追加後にメモ欄へ戻します</p>
          {/if}
        </div>
      {/if}
      <div class="suggest-actions">
        <button class="ghost" onclick={() => ((suggestions = null), (rest = []))}>閉じる</button>
        <button class="primary" onclick={acceptSuggestions} disabled={!suggestions.some((s) => s.on)} data-testid="ai-accept">
          {suggestions.filter((s) => s.on).length}件を追加
        </button>
      </div>
    </div>
  {/if}
</section>
