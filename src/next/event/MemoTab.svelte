<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { store, COLOR_HEX, type FEvent } from '../../lib/store.svelte';
  import { nav } from '../nav.svelte';
  import { linkify, parseMemo, previousOf, toggleCheck } from './memo';

  let { event }: { event: FEvent } = $props();
  let editing = $state(false);
  let text = $state(event.note);
  let el = $state<HTMLTextAreaElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // follow changes from other devices while not typing here
  $effect(() => {
    const n = event.note;
    if (!editing) text = n;
  });
  function save() {
    clearTimeout(timer);
    if (text !== event.note) store.updateEvent(event.id, { note: text });
  }
  function input() {
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  }
  onDestroy(save);
  async function edit() {
    editing = true;
    await tick();
    el?.focus();
  }
  function done() {
    save();
    editing = false;
  }
  /** Insert a line mark at the start of the current line. */
  function mark(prefix: string) {
    if (!el) return;
    const pos = el.selectionStart;
    const start = text.lastIndexOf('\n', pos - 1) + 1;
    text = text.slice(0, start) + prefix + text.slice(start);
    input();
    tick().then(() => {
      el!.focus();
      el!.selectionStart = el!.selectionEnd = pos + prefix.length;
    });
  }
  function check(line: number) {
    text = toggleCheck(text, line);
    save();
  }
  const lines = $derived(parseMemo(text));
  const prev = $derived(previousOf(event, store.events));
  const prevLines = $derived(prev ? parseMemo(prev.note).filter((l) => l.kind !== 'gap').slice(0, 14) : []);
  const openCount = (n: string) => store.tasks.filter((t) => !t.deleted && t.event_id === event.id && t.kind === 'task' && t.status !== 'done' && t.assignees.includes(n)).length;
</script>

{#snippet rendered(ls: ReturnType<typeof parseMemo>, interactive: boolean)}
  {#each ls as l}
    {#if l.kind === 'h'}
      <h3>{l.text}</h3>
    {:else if l.kind === 'li'}
      <p class="li">{#each linkify(l.text) as part}{#if part.href}<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>{:else}{part.text}{/if}{/each}</p>
    {:else if l.kind === 'check'}
      <label class="ck" class:done={l.done}>
        <input type="checkbox" checked={l.done} disabled={!interactive} onchange={() => check(l.line)} data-testid="nx-memo-check" />
        <span>{l.text}</span>
      </label>
    {:else if l.kind === 'p'}
      <p>{#each linkify(l.text) as part}{#if part.href}<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>{:else}{part.text}{/if}{/each}</p>
    {:else}
      <div class="gap"></div>
    {/if}
  {/each}
{/snippet}

<div class="cols">
  <section class="nx-panel memo-panel" data-testid="nx-memo">
    <div class="head">
      <h2>メモ</h2>
      <span class="sub">自動で保存・幹部の端末すべてに反映</span>
      {#if editing}
        <button class="btn primary" onclick={done} data-testid="nx-memo-done">完了</button>
      {:else}
        <button class="btn nx-chip" onclick={edit} data-testid="nx-memo-edit">編集</button>
      {/if}
    </div>
    {#if editing}
      <div class="tools nx-chip" role="toolbar" aria-label="書式">
        <button onclick={() => mark('## ')}>見出し</button>
        <button onclick={() => mark('・')}>・ 箇条書き</button>
        <button onclick={() => mark('☐ ')}>☐ チェック</button>
      </div>
      <textarea bind:this={el} bind:value={text} oninput={input} onblur={save} placeholder={'## 連絡事項\n・会場の鍵は当日 11:00 に学生課で受け取る\n☐ 提案の担当者を確定する'} aria-label="メモ" data-testid="nx-memo-text"></textarea>
      <p class="help">「## 」で見出し、「・」で箇条書き、「☐ 」でチェック。URL はリンクになります。</p>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="view" ondblclick={edit} data-testid="nx-memo-view">
        {#if text.trim()}
          {@render rendered(lines, true)}
        {:else}
          <p class="empty">連絡事項、決まったこと、来年への申し送りなど。当日モードの「終了」で書いた申し送りもここに入ります。</p>
        {/if}
      </div>
    {/if}
  </section>

  <div class="side">
    <section class="nx-panel box" data-testid="nx-memo-prev">
      <div class="bh"><h2>昨年の申し送り</h2>{#if prev}<span>{prev.name}</span>{/if}</div>
      {#if prev && prevLines.length}
        <div class="prev">{@render rendered(prevLines, false)}</div>
        <a class="btn nx-chip" href="/next/events/{prev.id}?tab=memo">{prev.name}を開く</a>
      {:else if prev}
        <p class="empty">{prev.name}にはメモがありません</p>
      {:else}
        <p class="empty">前の年の同じ名前のイベントがあると、ここにそのメモが出ます。</p>
      {/if}
    </section>
    <section class="nx-panel box">
      <div class="bh"><h2>イベント担当</h2><button class="edit" onclick={() => (nav.editing = event.id)}>編集</button></div>
      {#if event.members.length}
        <div class="people">
          {#each event.members as m (m.name)}
            <span class="p nx-chip"><i style="background:{COLOR_HEX[m.color]}">{m.name[0]}</i>{m.name}<small>{openCount(m.name)}件</small></span>
          {/each}
        </div>
      {:else}
        <p class="empty">まだ登録されていません</p>
      {/if}
    </section>
  </div>
</div>

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
  .memo-panel { flex: 999 1 480px; min-width: 0; padding: 18px 20px; }
  .side { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 16px; font-weight: 800; }
  .sub { font-size: 12px; color: var(--muted); }
  .btn { height: 34px; padding: 0 14px; border-radius: 10px; display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 700; }
  .head .btn { margin-left: auto; }
  .btn.primary { color: var(--bg); background: var(--text); font-weight: 800; }
  .tools { display: flex; gap: 4px; padding: 4px; border-radius: 10px; margin-bottom: 10px; width: fit-content; }
  .tools button { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--sub); }
  .tools button:hover { background: var(--hi); color: var(--text); }
  textarea { width: 100%; min-height: 380px; resize: vertical; padding: 16px 18px; border-radius: 14px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: 500 14px/1.75 var(--font); outline: 0; }
  textarea:focus { border-color: var(--accent); }
  .help { margin: 8px 2px 0; font-size: 11.5px; color: var(--muted); }
  .view { min-height: 380px; padding: 16px 18px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); font-size: 14px; line-height: 1.75; }
  .view :global(h3), .prev :global(h3) { margin: 10px 0 4px; font-size: 15px; font-weight: 800; }
  .view :global(h3:first-child), .prev :global(h3:first-child) { margin-top: 0; }
  .view :global(p), .prev :global(p) { margin: 0; overflow-wrap: anywhere; }
  .view :global(.li), .prev :global(.li) { padding-left: 1.1em; text-indent: -0.8em; }
  .view :global(.li)::before, .prev :global(.li)::before { content: '・'; }
  .view :global(a) { color: var(--accent); }
  .view :global(.gap) { height: 10px; }
  .ck { display: flex; align-items: flex-start; gap: 8px; }
  .ck input { margin-top: 6px; accent-color: #2fbf7f; }
  .ck.done span { color: var(--muted); text-decoration: line-through; }
  .empty { margin: 0; font-size: 13px; color: var(--muted); }
  .box { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .bh { width: 100%; display: flex; align-items: baseline; gap: 8px; }
  .bh h2 { font-size: 14px; }
  .bh span { font-size: 11.5px; color: var(--muted); }
  .bh .edit { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--sub); }
  .prev { width: 100%; font-size: 13px; line-height: 1.65; color: var(--sub); }
  .people { display: flex; flex-wrap: wrap; gap: 8px; }
  .p { height: 32px; padding: 0 12px 0 4px; border-radius: 999px; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; }
  .p i { width: 24px; height: 24px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 800; color: #fff; }
  .p small { font-size: 11px; color: var(--muted); }
</style>
