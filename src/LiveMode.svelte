<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { backOut, cubicOut } from 'svelte/easing';
  import { store, COLOR_HEX, type Task } from './lib/store.svelte';
  import { router } from './lib/router.svelte';
  import { sheet } from './lib/sheet.svelte';
  import { toasts } from './lib/toast.svelte';
  import { addDays, fromMin, nowMin, rangeLabel, today, toMin } from './lib/dates';
  import { vibrate } from './lib/motion';
  import Icon from './Icon.svelte';
  import { addDelay, columnize, dayRows, eventDays, getDelay, getRoles, inMinutes, itemsList, liveDay, mine, setRoles, situation, type LiveRoles, type Row } from './lib/liveMode';

  let { id }: { id: string } = $props();

  const e = $derived(store.eventById(id));
  let who = $state<LiveRoles | null>(getRoles(id));
  let picking = $state(getRoles(id) === null);
  let pickDraft = $state<string[]>(getRoles(id)?.roles ?? []);
  let view = $state<'now' | 'all' | 'summary'>(getRoles(id)?.hq ? 'all' : 'now');
  let delayOpen = $state(false);

  // clock
  let clock = $state(nowMin());
  onMount(() => {
    const t = setInterval(() => (clock = nowMin()), 15_000);
    return () => clearInterval(t);
  });

  const days = $derived(e ? eventDays(e) : []);
  let pickedDay = $state<string | null>(null);
  const day = $derived(e ? (pickedDay && days.includes(pickedDay) ? pickedDay : liveDay(e)) : today());
  const isLiveDay = $derived(day === today());
  /** on a preview day nothing is "now": the next move is the first one */
  const now = $derived(isLiveDay ? clock : day < today() ? 24 * 60 : -1);

  const rows = $derived(e ? dayRows(store.tasks, e, day) : []);
  const myRows = $derived(who ? rows.filter((r) => mine(r, who!)) : rows);
  const sit = $derived(situation(myRows, now));
  /** bumped after applying/undoing a delay so the (device-local) total re-reads */
  let delayTick = $state(0);
  const delay = $derived((delayTick, e ? getDelay(e.id, day) : 0));

  const roleColor = (name: string) => COLOR_HEX[e?.roles.find((r) => r.name === name)?.color ?? 'gray'];
  const whoLabel = $derived(who?.hq ? '本部' : who && who.roles.length ? who.roles.join('・') : '全員');
  const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

  // ---------- 担当 pick ----------
  function startAs(hq: boolean) {
    const r = { hq, roles: hq ? [] : $state.snapshot(pickDraft) };
    setRoles(id, r);
    who = r;
    picking = false;
    view = hq ? 'all' : 'now';
    vibrate(10);
  }

  // ---------- done / undo ----------
  function complete(t: Task) {
    store.setStatus(t.id, 'done');
    vibrate(14);
    toasts.show(`「${t.title}」完了`, { label: '元に戻す', run: () => store.setStatus(t.id, 'todo') });
  }
  function toggleDone(t: Task) {
    if (t.status === 'done') store.setStatus(t.id, 'todo');
    else complete(t);
  }

  // NOW card: flick right to finish
  let dx = $state(0);
  let dragging = $state(false);
  let flying = $state(false);
  let sx = 0;
  function down(ev: PointerEvent) {
    if (flying) return;
    dragging = true;
    sx = ev.clientX;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }
  function move(ev: PointerEvent) {
    if (!dragging) return;
    const d = ev.clientX - sx;
    dx = d > 0 ? d : d * 0.2;
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (dx > 110 && sit.now) {
      const t = sit.now.task;
      flying = true;
      dx = 520;
      setTimeout(() => {
        complete(t);
        flying = false;
        dx = 0;
      }, 220);
    } else dx = 0;
  }

  // ---------- 全体 (本部) ----------
  const lanes = $derived(e ? e.roles : []);
  const span = $derived.by(() => {
    if (!rows.length) return { from: 8 * 60, to: 18 * 60 };
    const from = Math.floor(Math.min(...rows.map((r) => r.start)) / 60) * 60;
    const to = Math.ceil(Math.max(...rows.map((r) => r.end), from + 120) / 60) * 60;
    return { from, to };
  });
  const PX = 1.4; // px per minute
  /** lane indexes a row occupies; null = everyone (全員 move or 予定) */
  const laneOf = (r: Row) => {
    if (r.isEvent || r.task.roles.length === 0) return null;
    const cols = r.task.roles.map((x) => lanes.findIndex((l) => l.name === x)).filter((i) => i >= 0);
    return cols.length ? cols : null;
  };
  const MIN_H = 22; // px: the shortest block still shows one line
  const minSpan = Math.ceil(MIN_H / PX);
  /** header strip of a 全員 block that 担当 blocks never cover, so its title stays readable */
  const BAND_HEAD = 22;
  /** everyone-items (全員 moves and 予定) span the whole board, like an all-hands event in Google Calendar;
   *  if they overlap each other they split the width */
  const bands = $derived(columnize(rows.filter((r) => laneOf(r) === null), minSpan));
  /** per-role items share their role's column when they overlap, drawn over the 全員 blocks */
  const laneBlocks = $derived(
    lanes.flatMap((_, li) =>
      columnize(rows.filter((r) => laneOf(r)?.includes(li)), minSpan).map((b) => {
        // keep clear of the title strip of a 全員 block that starts at (about) the same time
        const band = bands.find((x) => x.start <= b.start && b.start * PX < x.start * PX + BAND_HEAD && b.start < x.end);
        const top = band ? Math.max((b.start - span.from) * PX, (band.start - span.from) * PX + BAND_HEAD) : (b.start - span.from) * PX;
        const bottom = (b.end - span.from) * PX - 2;
        return { ...b, lane: li, top, height: Math.max(MIN_H, bottom - top) };
      }),
    ),
  );
  const rowState = (r: Row) => (r.isEvent ? 'event' : r.task.status === 'done' ? 'done' : r.start <= now && now < r.end ? 'now' : r.end <= now ? 'over' : 'todo');

  // ---------- 押し ----------
  let delayMin = $state(10);
  let delayScope = $state<'all' | 'mine'>('all');
  const affected = $derived(
    rows.filter((r) => r.task.status !== 'done' && r.start > now && (delayScope === 'all' || who?.hq || mine(r, who ?? { hq: true, roles: [] }))),
  );
  function applyDelay() {
    if (!e || !affected.length) return (delayOpen = false);
    const before = affected.map((r) => ({ id: r.task.id, plan_start: r.task.plan_start, plan_end: r.task.plan_end }));
    for (const r of affected) {
      store.update(r.task.id, {
        plan_start: fromMin(r.start + delayMin),
        plan_end: r.task.plan_end ? fromMin(toMin(r.task.plan_end) + delayMin) : null,
      });
    }
    addDelay(e.id, day, delayMin);
    delayTick++;
    delayOpen = false;
    vibrate(12);
    const m = delayMin;
    toasts.show(`${affected.length}件を${m}分押しました`, {
      label: '元に戻す',
      run: () => {
        for (const b of before) store.update(b.id, { plan_start: b.plan_start, plan_end: b.plan_end });
        addDelay(e!.id, day, -m);
        delayTick++;
      },
    });
  }

  // ---------- 終了 ----------
  let handover = $state('');
  const dayMoves = $derived(rows.filter((r) => !r.isEvent));
  const leftovers = $derived(dayMoves.filter((r) => r.task.status !== 'done'));
  /** move an unfinished day-of item back into 準備 (due tomorrow) */
  function toPrep(t: Task) {
    store.update(t.id, { plan_date: null, plan_start: null, plan_end: null, due_date: addDays(today(), 1) });
    toasts.show(`「${t.title}」を準備に回しました`);
  }
  function finishDay() {
    if (!e) return;
    if (!isLiveDay) {
      // a preview (rehearsal before the day) only leaves; nothing is closed or written
      router.back();
      return;
    }
    const isLast = day >= e.end_date;
    const note = handover.trim();
    const dayNo = days.indexOf(day) + 1;
    const patch: { note?: string; closed?: boolean } = {};
    if (note) patch.note = `${e.note ? `${e.note}\n` : ''}【${days.length > 1 ? `${dayNo}日目 ` : ''}${Number(day.slice(5, 7))}/${Number(day.slice(8))}】${note}`;
    if (isLast) patch.closed = true;
    store.updateEvent(e.id, patch);
    vibrate(16);
    toasts.show(isLast ? 'おつかれさまでした。イベントを終了しました' : `${dayNo}日目を終了しました`);
    if (isLast) router.home();
    else router.back();
  }
</script>

<svelte:window onkeydown={(ev) => ev.key === 'Escape' && delayOpen && (delayOpen = false)} />

{#if !e}
  <div class="live" data-testid="live">
    <header class="live-head"><button class="lv-icon" onclick={() => router.back()} aria-label="閉じる"><Icon name="x" size={20} /></button></header>
    <p class="lv-empty">このイベントは見つかりません</p>
  </div>
{:else if picking}
  <!-- 担当 pick: remembered on this device -->
  <div class="live pick" data-testid="live-pick" in:fade={{ duration: 200 }}>
    <header class="live-head">
      <button class="lv-icon dark" onclick={() => (who ? (picking = false) : router.back())} aria-label="閉じる" data-testid="live-close"><Icon name="x" size={20} /></button>
      <span class="lv-sub">{e.name}{days.length > 1 ? `・${days.indexOf(day) + 1}日目` : ''}</span>
    </header>
    <h1 class="pick-title">この端末の担当は？</h1>
    <p class="pick-note">複数選べます。選んだ担当はこの端末に記憶されます。</p>
    <div class="pick-grid">
      <button class="pick-hq" onclick={() => startAs(true)} data-testid="pick-hq">
        <i></i><span><strong>本部</strong><small>全員の動きを一覧で見る</small></span><b><Icon name="right" /></b>
      </button>
      {#each e.roles.filter((r) => r.name !== '本部') as r, i (r.name)}
        {@const on = pickDraft.includes(r.name)}
        <button
          class="pick-role"
          class:on
          style="--c:{COLOR_HEX[r.color]}"
          aria-pressed={on}
          onclick={() => (pickDraft = on ? pickDraft.filter((x) => x !== r.name) : [...pickDraft, r.name])}
          in:scale={{ start: 0.85, duration: 380, delay: i * 40, easing: backOut }}
          data-testid="pick-role"
        >
          <span class="pr-top"><i></i>{#if on}<b in:scale={{ duration: 260, easing: backOut }}><Icon name="check" size={14} /></b>{/if}</span>
          <strong>{r.name}</strong>
        </button>
      {/each}
    </div>
    <button class="pick-go" onclick={() => startAs(false)} data-testid="pick-start">
      {pickDraft.length ? `${pickDraft.join('・')}ではじめる` : '全員の動きだけ見る'}
    </button>
  </div>
{:else}
  <div class="live" data-testid="live" data-view={view}>
    {#if view === 'now'}
      <header class="live-head">
        <button class="lv-icon" onclick={() => router.back()} aria-label="当日モードを閉じる" data-testid="live-exit"><Icon name="x" size={20} /></button>
        <button class="lv-role" style="--c:{who?.roles[0] ? roleColor(who.roles[0]) : '#14161c'}" onclick={() => ((pickDraft = who?.roles ?? []), (picking = true))} data-testid="live-role">
          <span>{whoLabel}</span><Icon name="down" size={14} />
        </button>
        <span class="lv-sub">{e.name}{days.length > 1 ? `・${days.indexOf(day) + 1}日目` : ''}</span>
        <span class="lv-clock" data-testid="live-clock">{hhmm(clock)}</span>
      </header>
      {#if !isLiveDay}
        <p class="lv-preview" data-testid="live-preview">プレビュー（本番は {rangeLabel(e.start_date, e.end_date)}）</p>
      {/if}

      <div class="lv-scroll">
        {#each sit.over as r (r.task.id)}
          <button class="lv-over" onclick={() => complete(r.task)} transition:slide={{ duration: 260 }} data-testid="live-over">
            <span>{fromMin(r.start)}</span><strong>{r.task.title}</strong><em>終わったら<Icon name="check" size={14} /></em>
          </button>
        {/each}

        {#if sit.now}
          {@const t = sit.now.task}
          {#key t.id}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="lv-now"
              class:dragging
              class:flying
              style="transform: translateX({dx}px) rotate({dx * 0.02}deg)"
              onpointerdown={down}
              onpointermove={move}
              onpointerup={up}
              onpointercancel={up}
              in:fly={{ y: 20, duration: 460, easing: backOut }}
              data-testid="live-now"
            >
              <span class="lv-now-top"><b>いま</b><span>{fromMin(sit.now.start)} – {fromMin(sit.now.end)}</span></span>
              <strong class="lv-now-title">{t.title}</strong>
              {#if t.place}<span class="lv-place"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>{t.place}</span>{/if}
              {#if t.note}<p class="lv-note">{t.note}</p>{/if}
              {#if t.items}
                <span class="lv-items">{#each itemsList(t.items) as it}<i>{it}</i>{/each}</span>
              {/if}
              <span class="lv-progress"><i style="width:{Math.min(100, ((now - sit.now.start) / (sit.now.end - sit.now.start)) * 100)}%"></i></span>
              <span class="lv-hint">右にフリックで完了 →</span>
            </div>
          {/key}
        {:else}
          <div class="lv-now idle" data-testid="live-now-idle">
            <span class="lv-now-top"><b>いま</b></span>
            <strong class="lv-now-title">{sit.next ? '次の動きまで待機' : myRows.length ? '今日の動きは終わりました' : '動きがありません'}</strong>
          </div>
        {/if}
        {#each sit.alsoNow as r (r.task.id)}
          <button class="lv-also" onclick={() => complete(r.task)} data-testid="live-also"><span>同時進行</span><strong>{r.task.title}</strong><em><Icon name="check" size={16} /></em></button>
        {/each}

        {#if sit.next}
          <div class="lv-next" in:fly={{ y: 12, duration: 380, easing: cubicOut }} data-testid="live-next">
            <span class="lv-next-when"><small>つぎ</small><strong>{now < 0 ? fromMin(sit.next.start) : inMinutes(sit.next.start - now)}</strong></span>
            <span class="lv-next-what">
              <small>{fromMin(sit.next.start)} – {fromMin(sit.next.end)}</small>
              <strong>{sit.next.task.title}</strong>
              {#if sit.next.task.place}<small>{sit.next.task.place}</small>{/if}
            </span>
          </div>
        {/if}

        <div class="lv-flow">
          <span class="lv-flow-title">{whoLabel}の流れ</span>
          {#each myRows as r (r.task.id)}
            {@const st = rowState(r)}
            <div class="lv-row" data-state={st} animate:flip={{ duration: 300 }} data-testid="live-row">
              <span class="lv-row-time">{fromMin(r.start)}</span>
              {#if r.isEvent}
                <span class="lv-check event" aria-hidden="true"></span>
              {:else}
                <button class="lv-check" class:done={r.task.status === 'done'} onclick={() => toggleDone(r.task)} aria-label={r.task.status === 'done' ? '未完了に戻す' : '完了にする'} data-testid="live-check">
                  {#if r.task.status === 'done'}<Icon name="check" size={14} />{/if}
                </button>
              {/if}
              <button class="lv-row-title" onclick={() => sheet.edit(r.task.id)}>{r.task.title}</button>
              {#if st === 'now'}<em>いま</em>{/if}
            </div>
          {/each}
        </div>
      </div>

      <nav class="lv-bar">
        <button class="lv-delay" onclick={() => (delayOpen = true)} data-testid="live-delay">押し ＋</button>
        <button onclick={() => (view = 'all')} data-testid="live-all">全体を見る</button>
        <button class="muted" onclick={() => (view = 'summary')} data-testid="live-end">終了</button>
      </nav>
    {:else if view === 'all'}
      <header class="live-head">
        <button class="lv-icon" onclick={() => (who?.hq ? router.back() : (view = 'now'))} aria-label="戻る" data-testid="live-all-back"><Icon name="back" size={20} /></button>
        <span class="lv-title">全体</span>
        <span class="lv-sub">{who?.hq ? '本部' : ''}</span>
        <span class="lv-clock">{hhmm(clock)}</span>
      </header>
      {#if delay > 0}
        <button class="lv-delay-banner" onclick={() => (delayOpen = true)} data-testid="live-delay-banner">＋{delay}分 押し中<span>変更</span></button>
      {/if}
      <div class="lv-lanes-head" style="--n:{Math.max(1, lanes.length)}">
        <span></span>
        {#each lanes as l}<span style="--c:{COLOR_HEX[l.color]}">{l.name}</span>{/each}
      </div>
      <div class="lv-board-scroll">
        <div class="lv-board" style="height:{(span.to - span.from) * PX}px; --n:{Math.max(1, lanes.length)}" data-testid="live-board">
          {#each Array.from({ length: (span.to - span.from) / 60 + 1 }, (_, i) => span.from + i * 60) as h}
            <div class="lv-hour" style="top:{(h - span.from) * PX}px"><span>{h / 60}:00</span></div>
          {/each}
          {#each bands as r (r.task.id)}
            {@const st = rowState(r)}
            <button
              class="lv-block band"
              data-state={st}
              style="top:{(r.start - span.from) * PX}px; height:{Math.max(MIN_H, (r.end - r.start) * PX - 2)}px; --col:{r.col}; --cols:{r.cols}"
              onclick={() => sheet.edit(r.task.id)}
              data-testid="board-block"
              data-band
            ><span class="lv-sr">{r.task.title}（{r.isEvent ? '予定' : '全員'}）</span></button>
            <!-- the title rides above the 担当 blocks (a later start is drawn on top, as in Google Calendar) -->
            <button
              class="band-head"
              data-state={st}
              style="top:{(r.start - span.from) * PX}px; --col:{r.col}; --cols:{r.cols}"
              onclick={() => sheet.edit(r.task.id)}
              data-testid="band-head"
            >{#if st === 'done'}<Icon name="check" size={12} />{/if}<span>{r.task.title}</span><small>{fromMin(r.start)}–{fromMin(r.end)}{r.isEvent ? '' : '・全員'}</small></button>
          {/each}
          {#each laneBlocks as r (r.task.id + ':' + r.lane)}
            {@const st = rowState(r)}
            <button
              class="lv-block"
              class:short={r.height < 36}
              data-state={st}
              style="top:{r.top}px; height:{r.height}px; --i:{r.lane}; --col:{r.col}; --cols:{r.cols}; --c:{COLOR_HEX[lanes[r.lane].color]}"
              onclick={() => sheet.edit(r.task.id)}
              data-testid="board-block"
            ><span>{st === 'done' ? '✓ ' : ''}{r.task.title}</span></button>
          {/each}
          {#if now >= span.from && now <= span.to}
            <div class="lv-now-line" style="top:{(now - span.from) * PX}px" aria-hidden="true"><i></i></div>
          {/if}
        </div>
      </div>
      <div class="lv-legend" aria-hidden="true">
        <span><i class="lg-done"></i>完了</span><span><i class="lg-now"></i>進行中</span><span><i class="lg-over"></i>遅れ</span><span><i class="lg-line"></i>現在</span>
      </div>
      {#if who?.hq}
        <nav class="lv-bar">
          <button class="lv-delay" onclick={() => (delayOpen = true)} data-testid="live-delay">押し ＋</button>
          <button onclick={() => ((pickDraft = []), (picking = true))}>担当を選ぶ</button>
          <button class="muted" onclick={() => (view = 'summary')} data-testid="live-end">終了</button>
        </nav>
      {/if}
    {:else}
      <!-- 終了・振り返り -->
      <header class="live-head">
        <button class="lv-icon" onclick={() => (view = who?.hq ? 'all' : 'now')} aria-label="戻る" data-testid="summary-back"><Icon name="back" size={20} /></button>
        <span class="lv-sub">{e.name}{days.length > 1 ? `・${days.indexOf(day) + 1}日目` : ''}</span>
      </header>
      <div class="lv-scroll">
        <h1 class="sum-title" in:fly={{ y: 12, duration: 420, easing: backOut }}>おつかれさまでした</h1>
        <div class="sum-stats">
          <div><small>完了</small><strong class="ok" data-testid="sum-done">{dayMoves.length - leftovers.length}<span>/{dayMoves.length}</span></strong></div>
          <div><small>押し合計</small><strong class="warn">+{delay}分</strong></div>
          <div><small>終了</small><strong>{hhmm(clock)}</strong></div>
        </div>
        {#if leftovers.length}
          <span class="sum-label">終わらなかった動き</span>
          {#each leftovers as r (r.task.id)}
            <div class="sum-left" animate:flip={{ duration: 300 }} out:slide={{ duration: 260 }} data-testid="sum-left">
              <span>{fromMin(r.start)}</span><strong>{r.task.title}</strong>
              <button onclick={() => complete(r.task)} data-testid="sum-done-btn">完了</button>
              <button class="ghost" onclick={() => toPrep(r.task)} data-testid="sum-prep-btn">準備に回す</button>
            </div>
          {/each}
        {/if}
        <label class="sum-note">
          <span>来年への申し送り</span>
          <textarea bind:value={handover} rows="4" placeholder="受付は2人だと足りない、など" data-testid="sum-note"></textarea>
        </label>
      </div>
      <nav class="lv-bar single">
        <button class="primary" onclick={finishDay} data-testid="sum-finish">{!isLiveDay ? 'プレビューを閉じる' : day >= e.end_date ? 'イベントを終了する' : `${days.indexOf(day) + 1}日目を終了する`}</button>
      </nav>
    {/if}

    {#if days.length > 1 && view !== 'summary'}
      <div class="lv-days">
        {#each days as d, i}
          <button class:on={d === day} onclick={() => (pickedDay = d)} data-testid="live-day">{i + 1}日目</button>
        {/each}
      </div>
    {/if}

    {#if delayOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="scrim" transition:fade={{ duration: 220 }} onclick={() => (delayOpen = false)}></div>
      <div class="sheet glass lv-delay-sheet" in:fly={{ y: 400, duration: 480, easing: backOut, opacity: 1 }} out:fly={{ y: 400, duration: 260, opacity: 1 }} data-testid="delay-sheet">
        <div class="grab" aria-hidden="true"><span></span></div>
        <h2>押しを反映</h2>
        <p class="ds-note">{isLiveDay ? `${hhmm(clock)} 時点で始まっていない動きの時刻をずらします` : 'この日の動きの時刻をずらします'}</p>
        <div class="ds-amounts">
          {#each [5, 10, 15] as m}
            <button class:on={delayMin === m} onclick={() => (delayMin = m)} data-testid="delay-{m}">+{m}分</button>
          {/each}
          <label class:on={![5, 10, 15].includes(delayMin)}>
            <input type="number" min="1" max="180" placeholder="指定" onfocus={(ev) => (ev.currentTarget as HTMLInputElement).select()} oninput={(ev) => (delayMin = Math.max(1, Math.min(180, Number((ev.currentTarget as HTMLInputElement).value) || 0)))} aria-label="分を指定" data-testid="delay-custom" />
          </label>
        </div>
        {#if !who?.hq && who?.roles.length}
          <div class="ds-scope">
            <label><input type="radio" bind:group={delayScope} value="all" /> これ以降の動きすべて</label>
            <label><input type="radio" bind:group={delayScope} value="mine" /> {whoLabel}だけ</label>
          </div>
        {/if}
        <div class="ds-preview" data-testid="delay-preview">
          {#each affected.slice(0, 4) as r (r.task.id)}
            <div><span>{r.task.title}</span><s>{fromMin(r.start)}</s><b>→ {fromMin(r.start + delayMin)}</b></div>
          {/each}
          {#if affected.length > 4}<div class="more">ほか {affected.length - 4}件</div>{/if}
          {#if affected.length === 0}<div class="more">ずらす動きはありません</div>{/if}
        </div>
        <div class="ds-actions">
          <button class="ghost" onclick={() => (delayOpen = false)}>キャンセル</button>
          <button class="primary" onclick={applyDelay} disabled={!affected.length} data-testid="delay-apply">{delayMin}分押しで反映</button>
        </div>
      </div>
    {/if}
  </div>
{/if}
