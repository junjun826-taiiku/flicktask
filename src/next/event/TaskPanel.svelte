<script lang="ts">
  // Right-hand panel for one 準備 task. Every change is saved as it is made.
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { store, COLOR_HEX, STATUS_LABEL, STATUS_ORDER, type FEvent } from '../../lib/store.svelte';
  import { toasts } from '../../lib/toast.svelte';

  let { id, event, close }: { id: string; event: FEvent | null; close: () => void } = $props();
  const t = $derived(store.tasks.find((x) => x.id === id && !x.deleted) ?? null);
  $effect(() => {
    if (!t) close(); // deleted (here or on another device)
  });

  let titleEl = $state<HTMLTextAreaElement>();
  function saveTitle() {
    const v = titleEl?.value.trim();
    if (t && v && v !== t.title) store.update(t.id, { title: v });
    else if (titleEl && t) titleEl.value = t.title;
  }
  function toggleMember(name: string) {
    if (!t) return;
    const on = t.assignees.includes(name);
    store.update(t.id, { assignees: on ? t.assignees.filter((x) => x !== name) : [...t.assignees, name] });
  }
  function remove() {
    if (!t) return;
    const tid = t.id, title = t.title;
    store.remove(tid);
    close();
    toasts.show(`「${title}」を削除しました`, { label: '元に戻す', run: () => store.restore(tid) });
  }
  const keydown = (e: KeyboardEvent) => e.key === 'Escape' && close();
  /** people on the task who are no longer in the event's list still show, so they can be taken off */
  const people = $derived([...(event?.members ?? []).map((m) => ({ name: m.name, color: COLOR_HEX[m.color] })), ...(t?.assignees ?? []).filter((n) => !event?.members.some((m) => m.name === n)).map((n) => ({ name: n, color: COLOR_HEX.gray }))]);
</script>

<svelte:window onkeydown={keydown} />

{#if t}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={close} transition:fade={{ duration: 180 }}></div>
  <aside class="panel" role="dialog" aria-modal="true" aria-label="タスクの詳細" transition:fly={{ x: 420, duration: 300, easing: cubicOut, opacity: 1 }} data-testid="nx-panel">
    <div class="top">
      <span class="ctx">{event?.name ?? 'その他'}・準備</span>
      <button class="x nx-chip" onclick={close} aria-label="閉じる" data-testid="nx-panel-close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    <textarea class="title" bind:this={titleEl} value={t.title} rows="2" onblur={saveTitle} onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && !e.isComposing && (e.preventDefault(), titleEl?.blur())} aria-label="タイトル" data-testid="nx-panel-title"></textarea>

    <div class="f">
      <span class="l">状態</span>
      <div class="seg nx-chip" role="radiogroup" aria-label="状態">
        {#each STATUS_ORDER as s}
          <button role="radio" aria-checked={t.status === s} class:on={t.status === s} onclick={() => store.setStatus(t.id, s)} data-testid="nx-panel-status-{s}">{STATUS_LABEL[s]}</button>
        {/each}
      </div>
    </div>

    <div class="two">
      <label class="f">
        <span class="l">期限</span>
        <input type="date" value={t.due_date ?? ''} onchange={(e) => store.update(t.id, { due_date: e.currentTarget.value || null })} data-testid="nx-panel-due" />
      </label>
      <label class="f">
        <span class="l">時刻</span>
        <input type="time" value={t.due_time ?? ''} disabled={!t.due_date} onchange={(e) => store.update(t.id, { due_time: e.currentTarget.value || null })} data-testid="nx-panel-time" />
      </label>
    </div>

    {#if people.length}
      <div class="f">
        <span class="l">担当</span>
        <div class="people">
          {#each people as p (p.name)}
            {@const on = t.assignees.includes(p.name)}
            <button class:on aria-pressed={on} onclick={() => toggleMember(p.name)} data-testid="nx-panel-member"><i style="background:{p.color}">{p.name[0]}</i>{p.name}</button>
          {/each}
        </div>
      </div>
    {:else if event}
      <p class="none">イベントの「編集」で担当メンバーを登録すると、ここで割り当てられます。</p>
    {/if}

    <label class="f grow">
      <span class="l">メモ</span>
      <textarea class="memo" value={t.note} onblur={(e) => store.update(t.id, { note: e.currentTarget.value })} placeholder="連絡先、手順、注意点など" data-testid="nx-panel-note"></textarea>
    </label>

    <div class="acts">
      <button class="del nx-chip" onclick={remove} data-testid="nx-panel-delete">削除</button>
      <button class="ok" onclick={close}>閉じる</button>
    </div>
  </aside>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.35); }
  .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: 420px; max-width: 100%; padding: 22px 22px 20px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto;
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
  .seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 3px; border-radius: 10px; }
  .seg button { height: 32px; border-radius: 8px; font-size: 12.5px; font-weight: 700; color: var(--sub); }
  .seg button.on { color: var(--text); background: var(--hi); }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  input { height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 600 13.5px var(--font); color-scheme: inherit; }
  input:disabled { opacity: 0.45; }
  .people { display: flex; flex-wrap: wrap; gap: 6px; }
  .people button { height: 34px; padding: 0 12px 0 5px; border-radius: 999px; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--sub); border: 1px solid var(--border); }
  .people button i { width: 24px; height: 24px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 800; color: #fff; opacity: 0.45; }
  .people button.on { color: var(--text); background: var(--hi); border-color: var(--text); }
  .people button.on i { opacity: 1; }
  .none { margin: 0; font-size: 12px; color: var(--muted); }
  .memo { flex: 1; min-height: 110px; resize: none; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 500 13.5px/1.6 var(--font); outline: 0; }
  .memo:focus, input:focus { border-color: var(--accent); }
  .acts { display: flex; gap: 8px; }
  .acts button { height: 40px; padding: 0 16px; border-radius: 12px; font-size: 13px; font-weight: 700; }
  .del { color: var(--over-text); }
  .ok { margin-left: auto; color: var(--bg); background: var(--text); font-weight: 800; }
</style>
