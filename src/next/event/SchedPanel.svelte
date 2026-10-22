<script lang="ts">
  // Edit one 予定 of the event, with its tag picked from the list (or a new tag made here).
  // With no event it edits a 予定 of 「その他」 (added from the calendar); a new tag is then kept on that 予定 only.
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { store, BUILTIN_TAGS, type FEvent } from '../../lib/store.svelte';
  import { toasts } from '../../lib/toast.svelte';
  import { tagColor } from '../home';

  let { id, event, tags, close }: { id: string; event: FEvent | null; tags: string[]; close: () => void } = $props();
  const t = $derived(store.tasks.find((x) => x.id === id && !x.deleted) ?? null);
  $effect(() => {
    if (!t) close();
  });
  let titleEl = $state<HTMLTextAreaElement>();
  let making = $state(false);
  let newTag = $state('');
  function saveTitle() {
    const v = titleEl?.value.trim();
    if (t && v && v !== t.title) store.update(t.id, { title: v });
    else if (titleEl && t) titleEl.value = t.title;
  }
  function makeTag() {
    const v = newTag.trim().slice(0, 30);
    if (!v || !t) return;
    if (event && !tags.includes(v)) store.updateEvent(event.id, { tags: [...event.tags, v] });
    store.update(t.id, { tag: v });
    newTag = '';
    making = false;
  }
  function remove() {
    if (!t) return;
    const tid = t.id, title = t.title;
    store.remove(tid);
    close();
    toasts.show(`「${title}」を削除しました`, { label: '元に戻す', run: () => store.restore(tid) });
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

{#if t}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={close} transition:fade={{ duration: 180 }}></div>
  <aside class="panel" role="dialog" aria-modal="true" aria-label="予定の編集" transition:fly={{ x: 420, duration: 300, easing: cubicOut, opacity: 1 }} data-testid="nx-sched-panel">
    <div class="top">
      <span class="ctx">{event?.name ?? 'その他'}・予定</span>
      <button class="x nx-chip" onclick={close} aria-label="閉じる" data-testid="nx-sched-panel-close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    <textarea class="title" bind:this={titleEl} value={t.title} rows="2" onblur={saveTitle} onkeydown={(e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), titleEl?.blur())} aria-label="タイトル" data-testid="nx-sched-panel-title"></textarea>

    <div class="f">
      <span class="l">タグ</span>
      <div class="tags">
        {#each !event && t.tag && !tags.includes(t.tag) ? [...tags, t.tag] : tags as g}
          {@const on = t.tag === g}
          <button class:on aria-pressed={on} style="--c:{tagColor(g)}" onclick={() => store.update(t.id, { tag: on ? '' : g })} data-testid="nx-sched-panel-tag"><i></i>{g}{#if event && !BUILTIN_TAGS.includes(g as never)}<small>（このイベント）</small>{/if}</button>
        {/each}
        {#if making}
          <input class="newtag" bind:value={newTag} placeholder="新しいタグ" maxlength="30" onkeydown={(e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), makeTag())} onblur={makeTag} aria-label="新しいタグ" data-testid="nx-sched-panel-newtag" />
        {:else}
          <button class="make" onclick={() => (making = true)} data-testid="nx-sched-panel-make">＋ タグを作る</button>
        {/if}
      </div>
    </div>

    <div class="three">
      <label class="f"><span class="l">日付</span><input type="date" value={t.plan_date ?? ''} onchange={(e) => e.currentTarget.value && store.update(t.id, { plan_date: e.currentTarget.value })} data-testid="nx-sched-panel-date" /></label>
      <label class="f"><span class="l">開始</span><input type="time" value={t.plan_start ?? ''} onchange={(e) => store.update(t.id, { plan_start: e.currentTarget.value || null, ...(e.currentTarget.value ? {} : { plan_end: null }) })} data-testid="nx-sched-panel-start" /></label>
      <label class="f"><span class="l">終了</span><input type="time" value={t.plan_end ?? ''} disabled={!t.plan_start} onchange={(e) => store.update(t.id, { plan_end: e.currentTarget.value || null })} /></label>
    </div>
    <label class="f"><span class="l">場所・参加</span><input value={t.place} onchange={(e) => store.update(t.id, { place: e.currentTarget.value.trim() })} placeholder="幹部全員・2号館3階など" data-testid="nx-sched-panel-place" /></label>
    <label class="f grow">
      <span class="l">メモ</span>
      <textarea class="memo-field" value={t.note} onblur={(e) => store.update(t.id, { note: e.currentTarget.value })} placeholder="議題、持ち物など"></textarea>
    </label>
    <div class="acts">
      <button class="nx-chip del" onclick={remove} data-testid="nx-sched-panel-delete">削除</button>
      <button class="ok" onclick={close}>閉じる</button>
    </div>
  </aside>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.35); }
  .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: 440px; max-width: 100%; padding: 22px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;
    background: var(--drawer); border-left: 1px solid var(--border); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: -30px 0 60px -20px rgba(0, 0, 0, 0.6); }
  .top { display: flex; align-items: center; gap: 8px; }
  .ctx { font-size: 12px; font-weight: 700; color: var(--muted); }
  .x { margin-left: auto; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; }
  .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
  .title { resize: none; border: 0; outline: 0; background: transparent; color: var(--text); font: 800 21px/1.35 var(--font); padding: 0; }
  .title:focus { box-shadow: 0 2px 0 var(--accent); }
  .f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .f.grow { flex: 1; }
  .l { font-size: 12px; font-weight: 700; color: var(--muted); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tags button { height: 32px; padding: 0 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--sub); border: 1px solid var(--border); }
  .tags button i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .tags button small { font-size: 10.5px; color: var(--muted); }
  .tags button.on { color: var(--text); border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
  .tags .make { color: var(--muted); border-style: dashed; }
  .newtag { width: 140px; height: 32px; }
  .three { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 10px; }
  input { height: 40px; width: 100%; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 600 13.5px var(--font); outline: 0; color-scheme: inherit; }
  input:disabled { opacity: 0.45; }
  input:focus, .memo-field:focus { border-color: var(--accent); }
  .memo-field { flex: 1; min-height: 90px; resize: none; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 500 13.5px/1.6 var(--font); outline: 0; }
  .acts { display: flex; gap: 8px; }
  .acts button { height: 40px; padding: 0 14px; border-radius: 12px; font-size: 13px; font-weight: 700; }
  .del { color: var(--over-text); }
  .ok { margin-left: auto; color: var(--bg); background: var(--text); font-weight: 800; }
</style>
