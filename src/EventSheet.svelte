<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, COLORS, COLOR_HEX, type Color, type EventDetails, type Role } from './lib/store.svelte';
  import { eventSheet } from './lib/eventSheet.svelte';
  import { router } from './lib/router.svelte';
  import { toasts } from './lib/toast.svelte';
  import { addDays, today } from './lib/dates';
  import { vibrate } from './lib/motion';

  const COLOR_NAME: Record<Color, string> = { blue: '青', orange: 'オレンジ', violet: '紫', pink: 'ピンク', green: '緑', teal: '青緑', gray: 'グレー' };
  const PRESETS: Role[] = [
    { name: '本部', color: 'gray' },
    { name: '受付', color: 'blue' },
    { name: '設営', color: 'orange' },
    { name: '審判補助', color: 'violet' },
    { name: '救護', color: 'pink' },
    { name: '会計', color: 'green' },
    { name: '広報', color: 'teal' },
  ];

  type Draft = EventDetails & { roles: (Role & { key: number })[] };
  let draft = $state<Draft>(blank());
  let isNew = $state(true);
  let nameEl = $state<HTMLInputElement>();
  let keySeq = 0;

  function blank(): Draft {
    const start = addDays(today(), 14);
    return { name: '', start_date: start, end_date: start, place: '', color: 'blue', roles: [], note: '', closed: false };
  }

  $effect(() => {
    if (!eventSheet.open) return;
    const id = eventSheet.eventId;
    untrack(() => {
      const e = id ? store.eventById(id) : null;
      isNew = !e;
      draft = e
        ? { name: e.name, start_date: e.start_date, end_date: e.end_date, place: e.place, color: e.color, note: e.note, closed: e.closed, roles: e.roles.map((r) => ({ ...r, key: ++keySeq })) }
        : blank();
      tick().then(() => isNew && nameEl?.focus());
    });
  });

  const presetsLeft = $derived(PRESETS.filter((p) => !draft.roles.some((r) => r.name === p.name)));

  function addRole(r: Role = { name: '', color: COLORS[draft.roles.length % COLORS.length] }) {
    draft.roles.push({ ...r, key: ++keySeq });
  }
  function moveRole(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= draft.roles.length) return;
    const [r] = draft.roles.splice(i, 1);
    draft.roles.splice(j, 0, r);
  }
  function cycleColor(r: Role) {
    r.color = COLORS[(COLORS.indexOf(r.color) + 1) % COLORS.length];
  }

  function save() {
    const d = $state.snapshot(draft);
    const roles = d.roles.map(({ name, color }) => ({ name: name.trim(), color })).filter((r) => r.name);
    // role names must be unique (they are how 当日の動き refer to them)
    const unique = roles.filter((r, i) => roles.findIndex((x) => x.name === r.name) === i);
    const details: EventDetails = { ...d, name: d.name.trim(), roles: unique, end_date: d.end_date < d.start_date ? d.start_date : d.end_date };
    if (!details.name) {
      nameEl?.focus();
      return;
    }
    if (isNew) {
      const e = store.createEvent(details);
      eventSheet.close();
      vibrate(10);
      toasts.show('イベントを作成しました');
      router.openEvent(e.id);
    } else {
      store.updateEvent(eventSheet.eventId!, details);
      eventSheet.close();
    }
  }

  function remove() {
    const id = eventSheet.eventId;
    if (!id) return;
    eventSheet.close();
    store.removeEvent(id);
    vibrate(12);
    if (router.route.name === 'event') router.back();
    toasts.show('イベントを削除しました（タスクは残ります）', { label: '元に戻す', run: () => store.restoreEvent(id) });
  }
</script>

<svelte:window onkeydown={(e) => eventSheet.open && e.key === 'Escape' && eventSheet.close()} />

{#if eventSheet.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 260 }} onclick={() => eventSheet.close()}></div>
  <div
    class="sheet glass"
    role="dialog"
    aria-modal="true"
    aria-label={isNew ? '新しいイベント' : 'イベントの編集'}
    in:fly={{ y: 420, duration: 520, easing: backOut, opacity: 1 }}
    out:fly={{ y: 520, duration: 300, easing: cubicOut, opacity: 1 }}
    data-testid="event-sheet"
  >
    <div class="grab" aria-hidden="true"><span></span></div>
    <div class="sheet-head">
      {#if !isNew}
        <button class="ghost danger" onclick={remove} data-testid="event-delete">削除</button>
      {:else}
        <button class="ghost" onclick={() => eventSheet.close()}>キャンセル</button>
      {/if}
      <span class="sheet-kicker">{isNew ? '新しいイベント' : 'イベントを編集'}</span>
      <button class="primary" onclick={save} data-testid="event-save">{isNew ? '作成' : '保存'}</button>
    </div>

    <div class="sheet-body">
      <input bind:this={nameEl} bind:value={draft.name} class="sheet-title" placeholder="イベント名" aria-label="イベント名" data-testid="event-name" />

      <div class="ev-grid">
        <label class="ev-field">
          <span>本番（開始）</span>
          <input type="date" bind:value={draft.start_date} required data-testid="event-start" />
        </label>
        <label class="ev-field">
          <span>本番（終了）</span>
          <input type="date" bind:value={draft.end_date} min={draft.start_date} required data-testid="event-end" />
        </label>
      </div>
      <label class="ev-field">
        <span>会場</span>
        <input bind:value={draft.place} placeholder="会場" data-testid="event-place" />
      </label>

      <div class="ev-field">
        <span>色</span>
        <div class="swatches" role="radiogroup" aria-label="色">
          {#each COLORS as c}
            <button
              class="swatch"
              class:on={draft.color === c}
              style="--c:{COLOR_HEX[c]}"
              role="radio"
              aria-checked={draft.color === c}
              aria-label={COLOR_NAME[c]}
              onclick={() => (draft.color = c)}
              data-testid="event-color-{c}"
            ></button>
          {/each}
        </div>
      </div>

      <div class="ev-field">
        <span>役割（当日の担当）</span>
        <ul class="roles">
          {#each draft.roles as r, i (r.key)}
            <li animate:flip={{ duration: 300 }} transition:slide={{ duration: 220 }}>
              <button class="role-color" style="--c:{COLOR_HEX[r.color]}" onclick={() => cycleColor(r)} aria-label="色を変える（{COLOR_NAME[r.color]}）"></button>
              <input bind:value={r.name} placeholder="役割名" aria-label="役割名" data-testid="role-name" />
              <button class="role-btn" onclick={() => moveRole(i, -1)} disabled={i === 0} aria-label="上へ">↑</button>
              <button class="role-btn" onclick={() => moveRole(i, 1)} disabled={i === draft.roles.length - 1} aria-label="下へ">↓</button>
              <button class="role-btn" onclick={() => draft.roles.splice(i, 1)} aria-label="削除">×</button>
            </li>
          {/each}
        </ul>
        <div class="role-presets">
          {#each presetsLeft as p (p.name)}
            <button class="preset" style="--c:{COLOR_HEX[p.color]}" onclick={() => addRole(p)} data-testid="role-preset">＋{p.name}</button>
          {/each}
          <button class="preset other" onclick={() => addRole()} data-testid="role-add">＋その他</button>
        </div>
      </div>

      <label class="field note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" /></svg>
        <textarea bind:value={draft.note} rows="2" placeholder="メモ・来年への申し送り" aria-label="メモ" data-testid="event-note"></textarea>
      </label>
    </div>
  </div>
{/if}
