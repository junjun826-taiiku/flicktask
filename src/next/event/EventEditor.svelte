<script lang="ts">
  // Create / edit an event: basics, イベント担当 (any number), 当日の役割, 15 colours.
  // Renaming or removing a person or a role is carried over to the tasks that use it.
  // A new event can start from a past one: its 準備 tasks and 当日の動き are copied (予定 and people are not).
  import { tick, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { store, COLORS, COLOR_HEX, COLOR_NAME, type Color, type FEvent } from '../../lib/store.svelte';
  import { addDays, today } from '../../lib/dates';
  import { toasts } from '../../lib/toast.svelte';
  import { nav } from '../nav.svelte';
  import { carryable, moveCopy, nextName, prepCopy } from './carry';

  let { id }: { id: string } = $props();
  const isNew = id === 'new';
  type Item = { key: number; name: string; color: Color; was: string | null };
  let seq = 0;
  const src = untrack(() => (isNew ? null : store.eventById(id)));
  // names as they were when the editor opened (the event object itself changes on save)
  const origMembers = (src?.members ?? []).map((m) => m.name);
  const origRoles = (src?.roles ?? []).map((r) => r.name);
  const start0 = addDays(today(), 14);
  let name = $state(src?.name ?? '');
  let start = $state(src?.start_date ?? start0);
  let end = $state(src?.end_date ?? start0);
  let place = $state(src?.place ?? '');
  let color = $state<Color>(src?.color ?? 'blue');
  let members = $state<Item[]>((src?.members ?? []).map((m) => ({ key: ++seq, name: m.name, color: m.color, was: m.name })));
  let roles = $state<Item[]>((src?.roles ?? []).map((r) => ({ key: ++seq, name: r.name, color: r.color, was: r.name })));
  let nameEl = $state<HTMLInputElement>();
  let err = $state('');
  $effect(() => void (isNew && nameEl?.focus()));

  // ---------- 過去のイベントから作る ----------
  const pastChoices = untrack(() => [...store.liveEvents].sort((a, b) => b.start_date.localeCompare(a.start_date)));
  let fromId = $state('');
  const from = $derived(fromId ? store.eventById(fromId) : null);
  let loading = $state(false);
  const carry = $derived(from ? carryable(store.tasks, from) : { prep: [], moves: [] });
  /** ids left out of the copy (everything is in until unticked) */
  let skip = $state<Record<string, boolean>>({});
  const picked = <T extends { id: string }>(list: T[]) => list.filter((t) => !skip[t.id]);
  const setAll = (list: { id: string }[], on: boolean) => list.forEach((t) => (skip[t.id] = !on));
  async function choose(id: string) {
    fromId = id;
    skip = {};
    const e = store.eventById(id);
    if (!e) return;
    name = nextName(e.name, Math.max(1, Number(start.slice(0, 4)) - Number(e.start_date.slice(0, 4))));
    place = e.place;
    color = e.color;
    roles = e.roles.map((r) => ({ key: ++seq, name: r.name, color: r.color, was: null }));
    loading = true;
    await store.loadEventTasks(id); // a finished event's tasks are fetched on demand
    loading = false;
  }
  const dayNo = (t: { plan_date: string | null }) => (from && from.end_date > from.start_date ? `${Math.round((Date.parse(t.plan_date!) - Date.parse(from.start_date)) / 86_400_000) + 1}日目 ` : '');

  const nextColor = (list: Item[]) => COLORS.find((c) => !list.some((x) => x.color === c)) ?? COLORS[list.length % COLORS.length];
  const cycle = (it: Item) => (it.color = COLORS[(COLORS.indexOf(it.color) + 1) % COLORS.length]);
  async function addTo(list: Item[], cls: string) {
    list.push({ key: ++seq, name: '', color: nextColor(list), was: null });
    await tick();
    document.querySelector<HTMLInputElement>(`.${cls}:last-of-type input`)?.focus();
  }
  function moveUp(list: Item[], i: number) {
    if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  }
  const clean = (list: Item[]) => {
    const out: Item[] = [];
    for (const x of list) {
      const n = x.name.trim();
      if (n && !out.some((y) => y.name === n)) out.push({ ...x, name: n });
    }
    return out;
  };

  /** Carry renames and removals over to the tasks of this event. */
  function propagate(e: FEvent, ms: Item[], rs: Item[]) {
    const mMap = new Map(origMembers.map((n) => [n, ms.find((x) => x.was === n)?.name ?? null]));
    const rMap = new Map(origRoles.map((n) => [n, rs.find((x) => x.was === n)?.name ?? null]));
    const remap = (list: string[], map: Map<string, string | null>) => list.map((n) => (map.has(n) ? map.get(n) : n)).filter((n): n is string => !!n);
    for (const t of store.tasks) {
      if (t.deleted || t.event_id !== e.id) continue;
      const assignees = remap(t.assignees, mMap);
      const tr = remap(t.roles, rMap);
      if (JSON.stringify(assignees) !== JSON.stringify(t.assignees) || JSON.stringify(tr) !== JSON.stringify(t.roles)) store.update(t.id, { assignees, roles: tr });
    }
  }

  function save() {
    if (!name.trim()) {
      err = 'イベント名を入れてください';
      nameEl?.focus();
      return;
    }
    const ms = clean(members), rs = clean(roles);
    const details = {
      name: name.trim(), start_date: start, end_date: end < start ? start : end, place: place.trim(), color,
      members: ms.map(({ name, color }) => ({ name, color })), roles: rs.map(({ name, color }) => ({ name, color })),
    };
    if (isNew) {
      const e = store.createEvent({ ...details, note: '', closed: false, tags: from ? [...from.tags] : [] });
      let n = 0;
      if (from) {
        // later rows get older stamps so the copies keep the past event's order
        const now = Date.now();
        const rows = [...picked(carry.prep).map(prepCopy), ...picked(carry.moves).map((t) => moveCopy(t, from, e.start_date, e.end_date))];
        rows.forEach((r, i) => store.add(r.title, now + rows.length - i, { ...r, event_id: e.id }));
        n = rows.length;
      }
      nav.editing = null;
      nav.go(`/events/${e.id}`);
      toasts.show(n ? `イベントを作成しました（${from!.name}から${n}件を引継ぎ）` : 'イベントを作成しました');
    } else if (src) {
      propagate(src, ms, rs);
      store.updateEvent(src.id, details);
      nav.editing = null;
    }
  }
  function setClosed(v: boolean) {
    if (!src) return;
    store.updateEvent(src.id, { closed: v });
    nav.editing = null;
    toasts.show(v ? 'イベントを終了にしました' : 'イベントを再開しました');
  }
  function remove() {
    if (!src) return;
    const eid = src.id;
    store.removeEvent(eid);
    nav.editing = null;
    nav.go('/');
    toasts.show('イベントを削除しました（タスクは「その他」に残ります）', { label: '元に戻す', run: () => store.restoreEvent(eid) });
  }
  const close = () => (nav.editing = null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={close} transition:fade={{ duration: 180 }}></div>
<aside class="panel" role="dialog" aria-modal="true" aria-label={isNew ? '新しいイベント' : 'イベントを編集'} transition:fly={{ x: 720, duration: 320, easing: cubicOut, opacity: 1 }} data-testid="nx-editor">
  <div class="bar">
    <button class="nx-chip" onclick={close}>キャンセル</button>
    <span class="ttl">{isNew ? '新しいイベント' : 'イベントを編集'}</span>
    <button class="save" onclick={save} data-testid="nx-editor-save">{isNew ? '作成' : '保存'}</button>
  </div>

  <div class="body">
    {#if isNew && pastChoices.length}
      <section class="carry" data-testid="nx-carry">
        <label class="f">
          <span class="l">過去のイベントから作る</span>
          <select value={fromId} onchange={(e) => choose(e.currentTarget.value)} data-testid="nx-carry-from">
            <option value="">使わない（空から作る）</option>
            {#each pastChoices as p (p.id)}<option value={p.id}>{p.name}（{p.start_date.replaceAll('-', '/')}）</option>{/each}
          </select>
        </label>
        {#if from}
          <p class="note">準備タスクと当日の動きを引き継ぎます。準備タスクの日付・担当は空、状態は未着手になります。予定とイベント担当は引き継ぎません。</p>
          {#if loading}
            <p class="note">読み込み中…</p>
          {:else}
            {#each [{ key: 'prep', label: '準備タスク', list: carry.prep }, { key: 'moves', label: '当日の動き', list: carry.moves }] as g (g.key)}
              {@const on = picked(g.list).length}
              <div class="cg" data-testid="nx-carry-{g.key}">
                <div class="cgh">
                  <b>{g.label}</b><span class="nx-num">{on}/{g.list.length}件</span>
                  {#if g.list.length}<button class="all" onclick={() => setAll(g.list, on < g.list.length)}>{on < g.list.length ? 'すべて選ぶ' : 'すべて外す'}</button>{/if}
                </div>
                {#if g.list.length === 0}
                  <p class="note">ありません</p>
                {:else}
                  <div class="cl">
                    {#each g.list as t (t.id)}
                      <label class="ci" class:off={skip[t.id]}>
                        <input type="checkbox" checked={!skip[t.id]} onchange={(e) => (skip[t.id] = !e.currentTarget.checked)} />
                        {#if g.key === 'moves'}<span class="tm nx-num">{dayNo(t)}{t.plan_start}</span>{/if}
                        <span class="tt">{t.title}</span>
                      </label>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        {/if}
      </section>
    {/if}

    <section class="grid">
      <label class="f wide"><span class="l">イベント名</span><input class="big" bind:this={nameEl} bind:value={name} placeholder="2026 OBOG総会" data-testid="nx-editor-name" /></label>
      {#if err}<p class="err">{err}</p>{/if}
      <label class="f"><span class="l">本番（開始）</span><input type="date" bind:value={start} data-testid="nx-editor-start" /></label>
      <label class="f"><span class="l">本番（終了）</span><input type="date" bind:value={end} min={start} data-testid="nx-editor-end" /></label>
      <label class="f"><span class="l">会場</span><input bind:value={place} placeholder="会場" data-testid="nx-editor-place" /></label>
      <div class="f wide">
        <span class="l">イベントの色</span>
        <div class="swatches" role="radiogroup" aria-label="イベントの色">
          {#each COLORS as c}
            <button role="radio" aria-checked={color === c} aria-label={COLOR_NAME[c]} class:on={color === c} style="background:{COLOR_HEX[c]}" onclick={() => (color = c)}></button>
          {/each}
        </div>
      </div>
    </section>

    <section>
      <div class="sh"><h3>イベント担当</h3><span>準備のタスクを進める人。{clean(members).length}人</span></div>
      <div class="list">
        {#each members as m, i (m.key)}
          <div class="row member" data-testid="nx-editor-member">
            <button class="av" style="background:{COLOR_HEX[m.color]}" onclick={() => cycle(m)} aria-label="色を変える（{COLOR_NAME[m.color]}）">{m.name.trim()[0] ?? ''}</button>
            <input bind:value={m.name} placeholder="名前" aria-label="名前" onkeydown={(e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), addTo(members, 'member'))} />
            <button class="ic" onclick={() => members.splice(i, 1)} aria-label="外す"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        {/each}
        <button class="add" onclick={() => addTo(members, 'member')} data-testid="nx-editor-add-member">＋ 担当を追加</button>
      </div>
      <p class="note">外した人のタスクは「担当なし」になります（タスクは消えません）。</p>
    </section>

    <section>
      <div class="sh"><h3>当日の役割</h3><span>当日の動きと当日モードで使う。並び順＝ボードの列の順</span></div>
      <div class="list two">
        {#each roles as r, i (r.key)}
          <div class="row role" data-testid="nx-editor-role">
            <button class="sw" style="background:{COLOR_HEX[r.color]}" onclick={() => cycle(r)} aria-label="色を変える（{COLOR_NAME[r.color]}）"></button>
            <input bind:value={r.name} placeholder="役割名（例: 受付）" aria-label="役割名" onkeydown={(e) => e.key === 'Enter' && !e.isComposing && (e.preventDefault(), addTo(roles, 'role'))} />
            <button class="ic" onclick={() => moveUp(roles, i)} disabled={i === 0} aria-label="上へ"><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>
            <button class="ic" onclick={() => roles.splice(i, 1)} aria-label="削除"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        {/each}
      </div>
      <button class="add" onclick={() => addTo(roles, 'role')} data-testid="nx-editor-add-role">＋ 役割を追加</button>
    </section>

    {#if src}
      <section class="danger">
        {#if src.closed}
          <button class="nx-chip" onclick={() => setClosed(false)} data-testid="nx-editor-reopen">イベントを再開する</button>
        {:else}
          <button class="nx-chip" onclick={() => setClosed(true)} data-testid="nx-editor-close">イベントを終了にする</button>
        {/if}
        <button class="nx-chip del" onclick={remove} data-testid="nx-editor-delete">削除</button>
      </section>
    {/if}
  </div>
</aside>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.45); }
  .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: 720px; max-width: 100%; display: flex; flex-direction: column; gap: 16px; padding: 18px 24px;
    background: var(--drawer); border-left: 1px solid var(--border); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: -30px 0 60px -20px rgba(0, 0, 0, 0.6); }
  .bar { display: flex; align-items: center; gap: 10px; }
  .bar button { height: 38px; padding: 0 14px; border-radius: 12px; font-size: 13px; font-weight: 700; }
  .ttl { margin: 0 auto; font-size: 14px; font-weight: 800; }
  .save { color: var(--bg); background: var(--text); font-weight: 800 !important; padding: 0 20px !important; }
  .body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 22px; padding-right: 4px; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .wide { grid-column: 1 / -1; }
  .f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .l { font-size: 12px; font-weight: 700; color: var(--muted); }
  input { height: 42px; width: 100%; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 600 14px var(--font); outline: 0; color-scheme: inherit; }
  input:focus { border-color: var(--accent); }
  input.big { font-size: 18px; font-weight: 800; }
  .err { grid-column: 1 / -1; margin: -4px 0 0; font-size: 12px; color: var(--over-text); }
  .swatches { display: grid; grid-template-columns: repeat(15, minmax(0, 1fr)); gap: 6px; max-width: 520px; }
  .swatches button { aspect-ratio: 1; width: 100%; border-radius: 50%; }
  .swatches button.on { box-shadow: 0 0 0 2px var(--ring), 0 0 0 4px var(--text); }
  .sh { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
  .sh h3 { margin: 0; font-size: 15px; font-weight: 800; }
  .sh span { font-size: 12px; color: var(--muted); }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .list.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .row { display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 0 6px 0 8px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
  .row input { height: 34px; background: transparent; border-color: transparent; padding: 0 6px; }
  .row input:focus { border-color: var(--accent); }
  .av { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; color: #fff; }
  .sw { flex: none; width: 22px; height: 22px; border-radius: 7px; }
  .ic { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--sub); }
  .ic:disabled { opacity: 0.3; }
  .ic svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .add { align-self: flex-start; height: 36px; margin-top: 4px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 700; color: var(--sub); border: 1px dashed var(--border); }
  .note { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }
  .carry { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); }
  select { height: 42px; width: 100%; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: 600 14px var(--font); outline: 0; color-scheme: inherit; }
  .carry .note { margin: 0; }
  .cgh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; font-size: 13px; }
  .cgh span { font-size: 12px; color: var(--muted); }
  .all { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--accent); }
  .cl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 12px; max-height: 220px; overflow-y: auto; }
  .ci { display: flex; align-items: center; gap: 8px; min-height: 30px; font-size: 13px; font-weight: 600; cursor: pointer; min-width: 0; }
  .ci.off { color: var(--muted); text-decoration: line-through; }
  .ci input { width: 16px; height: 16px; flex: none; padding: 0; accent-color: var(--accent); }
  .ci .tm { flex: none; font-size: 11.5px; color: var(--sub); }
  .ci .tt { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .danger { display: flex; gap: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
  .danger button { height: 38px; padding: 0 14px; border-radius: 12px; font-size: 13px; font-weight: 700; }
  .danger .del { color: var(--over-text); }
  @media (max-width: 760px) {
    .panel { padding: 14px 16px; }
    .grid { grid-template-columns: minmax(0, 1fr); }
    .list.two, .cl { grid-template-columns: minmax(0, 1fr); }
    .swatches { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  }
</style>
