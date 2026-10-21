<script lang="ts">
  // Edit one row of 当日の動き. Every change is saved as it is made.
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { store, COLOR_HEX, type FEvent } from '../../lib/store.svelte';
  import { weekday } from '../../lib/dates';
  import { toasts } from '../../lib/toast.svelte';

  let { id, event, days, close }: { id: string; event: FEvent; days: string[]; close: () => void } = $props();
  const t = $derived(store.tasks.find((x) => x.id === id && !x.deleted) ?? null);
  $effect(() => {
    if (!t) close();
  });
  let titleEl = $state<HTMLTextAreaElement>();
  function saveTitle() {
    const v = titleEl?.value.trim();
    if (t && v && v !== t.title) store.update(t.id, { title: v });
    else if (titleEl && t) titleEl.value = t.title;
  }
  function toggleRole(n: string) {
    if (!t) return;
    store.update(t.id, { roles: t.roles.includes(n) ? t.roles.filter((x) => x !== n) : [...event.roles.map((r) => r.name).filter((r) => r === n || t!.roles.includes(r))] });
  }
  function duplicate() {
    if (!t) return;
    const c = store.add(t.title, Date.now(), { event_id: t.event_id, kind: t.kind, plan_date: t.plan_date, plan_start: t.plan_start, plan_end: t.plan_end, roles: [...t.roles], place: t.place, items: t.items, note: t.note });
    if (c) toasts.show('複製しました');
  }
  function remove() {
    if (!t) return;
    const tid = t.id, title = t.title;
    store.remove(tid);
    close();
    toasts.show(`「${title}」を削除しました`, { label: '元に戻す', run: () => store.restore(tid) });
  }
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${weekday(d)})`;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

{#if t}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={close} transition:fade={{ duration: 180 }}></div>
  <aside class="panel" role="dialog" aria-modal="true" aria-label="当日の動きの編集" transition:fly={{ x: 420, duration: 300, easing: cubicOut, opacity: 1 }} data-testid="nx-day-panel">
    <div class="top">
      <span class="ctx">{event.name}・当日の動き</span>
      <button class="x nx-chip" onclick={close} aria-label="閉じる" data-testid="nx-day-panel-close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    <textarea class="title" bind:this={titleEl} value={t.title} rows="2" onblur={saveTitle} onkeydown={(e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), titleEl?.blur())} aria-label="やること" data-testid="nx-day-panel-title"></textarea>

    <div class="f">
      <span class="l">種類</span>
      <div class="seg nx-chip" role="radiogroup" aria-label="種類">
        <button role="radio" aria-checked={t.kind === 'task'} class:on={t.kind === 'task'} onclick={() => store.update(t.id, { kind: 'task' })} data-testid="nx-day-kind-move">動き（担当がやる）</button>
        <button role="radio" aria-checked={t.kind === 'event'} class:on={t.kind === 'event'} onclick={() => store.update(t.id, { kind: 'event' })} data-testid="nx-day-kind-event">予定（式次第など）</button>
      </div>
    </div>

    <div class="three">
      {#if days.length > 1}
        <label class="f">
          <span class="l">日</span>
          <select value={t.plan_date} onchange={(e) => store.update(t.id, { plan_date: e.currentTarget.value })}>
            {#each days as d, i}<option value={d}>{i + 1}日目 {md(d)}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="f"><span class="l">開始</span><input type="time" value={t.plan_start ?? ''} onchange={(e) => e.currentTarget.value && store.update(t.id, { plan_start: e.currentTarget.value })} data-testid="nx-day-panel-start" /></label>
      <label class="f"><span class="l">終了</span><input type="time" value={t.plan_end ?? ''} onchange={(e) => store.update(t.id, { plan_end: e.currentTarget.value || null })} data-testid="nx-day-panel-end" /></label>
    </div>

    {#if t.kind === 'task'}
      <div class="f">
        <span class="l">担当（選ばなければ全員）</span>
        {#if event.roles.length}
          <div class="roles">
            {#each event.roles as r (r.name)}
              {@const on = t.roles.includes(r.name)}
              <button class:on aria-pressed={on} onclick={() => toggleRole(r.name)} data-testid="nx-day-panel-role"><i style="background:{COLOR_HEX[r.color]}"></i>{r.name}</button>
            {/each}
          </div>
        {:else}
          <p class="none">イベントの「編集」で役割を登録すると選べます。</p>
        {/if}
      </div>
    {/if}

    <div class="two">
      <label class="f"><span class="l">場所</span><input value={t.place} onchange={(e) => store.update(t.id, { place: e.currentTarget.value.trim() })} placeholder="5号館" data-testid="nx-day-panel-place" /></label>
      <label class="f"><span class="l">持ち物</span><input value={t.items} onchange={(e) => store.update(t.id, { items: e.currentTarget.value.trim() })} placeholder="名簿、ペン" data-testid="nx-day-panel-items" /></label>
    </div>
    <label class="f grow">
      <span class="l">メモ（当日モードの「いま」に出ます）</span>
      <textarea class="memo-field" value={t.note} onblur={(e) => store.update(t.id, { note: e.currentTarget.value })} placeholder="注意点、連絡先など"></textarea>
    </label>
    <div class="acts">
      <button class="nx-chip del" onclick={remove} data-testid="nx-day-panel-delete">削除</button>
      <button class="nx-chip" onclick={duplicate} data-testid="nx-day-panel-dup">複製</button>
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
  .seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 3px; border-radius: 10px; }
  .seg button { height: 32px; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--sub); }
  .seg button.on { color: var(--text); background: var(--hi); }
  .two, .three { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .three:has(select) { grid-template-columns: 1.4fr 1fr 1fr; }
  input, select { height: 40px; width: 100%; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 600 13.5px var(--font); outline: 0; color-scheme: inherit; }
  input:focus, select:focus, .memo-field:focus { border-color: var(--accent); }
  .roles { display: flex; flex-wrap: wrap; gap: 6px; }
  .roles button { height: 32px; padding: 0 11px; border-radius: 999px; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--sub); border: 1px solid var(--border); }
  .roles button i { width: 8px; height: 8px; border-radius: 50%; }
  .roles button.on { color: var(--text); background: var(--hi); border-color: var(--text); }
  .none { margin: 0; font-size: 12px; color: var(--muted); }
  .memo-field { flex: 1; min-height: 90px; resize: none; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 500 13.5px/1.6 var(--font); outline: 0; }
  .acts { display: flex; gap: 8px; }
  .acts button { height: 40px; padding: 0 14px; border-radius: 12px; font-size: 13px; font-weight: 700; }
  .del { color: var(--over-text); }
  .ok { margin-left: auto; color: var(--bg); background: var(--text); font-weight: 800; }
</style>
