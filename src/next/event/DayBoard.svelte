<script lang="ts">
  // 担当別ボード: a column per role × time. 全員 moves and 予定 run across the whole width (their title on top),
  // overlapping items sit side by side — the same picture as 当日モード's 全体.
  import { COLOR_HEX, type FEvent, type Task } from '../../lib/store.svelte';
  import { toMin } from '../../lib/dates';
  import { columnize } from '../../lib/liveMode';

  let { items, event, selected, open }: { items: Task[]; event: FEvent; selected: string | null; open: (id: string) => void } = $props();
  const PX = 1.25, LANE = 130, GUT = 52, HEAD = 22, MIN_H = 22;
  const minSpan = Math.ceil(MIN_H / PX);
  type It = { t: Task; start: number; end: number };
  const its = $derived(items.map((t) => { const start = toMin(t.plan_start!); return { t, start, end: t.plan_end ? Math.max(toMin(t.plan_end), start + 5) : start + 30 }; }));
  const from = $derived(its.length ? Math.floor(Math.min(...its.map((x) => x.start)) / 60) * 60 : 9 * 60);
  const to = $derived(its.length ? Math.ceil(Math.max(...its.map((x) => x.end), from + 120) / 60) * 60 : 18 * 60);
  const lanes = $derived(event.roles);
  const laneOf = (x: It) => (x.t.kind === 'event' || x.t.roles.length === 0 ? null : x.t.roles.map((r) => lanes.findIndex((l) => l.name === r)).filter((i) => i >= 0));
  const bands = $derived(columnize(its.filter((x) => { const l = laneOf(x); return !l || !l.length; }), minSpan));
  const width = $derived(Math.max(1, lanes.length) * LANE);
  const blocks = $derived(
    lanes.flatMap((l, li) =>
      columnize(its.filter((x) => laneOf(x)?.includes(li)), minSpan).map((b) => {
        const band = bands.find((x) => x.start <= b.start && (b.start - x.start) * PX < HEAD && b.start < x.end);
        const top = band ? Math.max((b.start - from) * PX, (band.start - from) * PX + HEAD) : (b.start - from) * PX;
        const bottom = (b.end - from) * PX - 2;
        return { ...b, lane: li, color: COLOR_HEX[l.color], top, height: Math.max(MIN_H, bottom - top) };
      }),
    ),
  );
  const hours = $derived(Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60));
  const tt = (x: It) => `${x.t.plan_start}${x.t.plan_end ? `–${x.t.plan_end}` : ''}`;
</script>

{#if items.length === 0}
  <p class="empty">この日の動きはまだありません</p>
{:else}
  <div class="scroll" data-testid="nx-day-boardview">
    <div class="wrap" style="width:{GUT + width + 6}px">
      <div class="heads" style="padding-left:{GUT}px">
        {#each lanes as l}<span style="width:{LANE - 4}px; --c:{COLOR_HEX[l.color]}">{l.name}</span>{/each}
      </div>
      <div class="board" style="height:{(to - from) * PX + 8}px">
        {#each hours as h}
          <div class="hour" style="top:{(h - from) * PX}px"><span class="nx-num">{h / 60}:00</span></div>
        {/each}
        <div class="canvas" style="left:{GUT}px; width:{width}px">
          {#each bands as b (b.t.id)}
            <button class="band" class:ev={b.t.kind === 'event'} style="top:{(b.start - from) * PX}px; height:{Math.max(MIN_H, (b.end - b.start) * PX - 2)}px; left:{(width * b.col) / b.cols}px; width:{width / b.cols - 4}px" onclick={() => open(b.t.id)} aria-label="{b.t.title}（{b.t.kind === 'event' ? '予定' : '全員'}）" data-testid="nx-dayboard-band"></button>
            <button class="bhead" class:ev={b.t.kind === 'event'} class:sel={selected === b.t.id} style="top:{(b.start - from) * PX}px; left:{(width * b.col) / b.cols}px; max-width:{width / b.cols - 4}px" onclick={() => open(b.t.id)}>
              <span>{b.t.title}</span><small>{tt(b)}・{b.t.kind === 'event' ? '予定' : '全員'}</small>
            </button>
          {/each}
          {#each blocks as b (b.t.id + ':' + b.lane)}
            <button class="block" class:sel={selected === b.t.id} class:short={b.height < 36} style="top:{b.top}px; height:{b.height}px; left:{b.lane * LANE + (LANE * b.col) / b.cols}px; width:{LANE / b.cols - 4}px; --c:{b.color}" onclick={() => open(b.t.id)} data-testid="nx-dayboard-block">
              <b>{b.t.title}</b><small class="nx-num">{tt(b)}</small>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .empty { margin: 12px 8px; font-size: 13px; color: var(--muted); }
  .scroll { overflow-x: auto; max-height: 70vh; overflow-y: auto; border-radius: 12px; }
  .heads { position: sticky; top: 0; z-index: 4; display: flex; gap: 4px; padding-bottom: 6px; background: var(--bg); }
  .heads span { flex: none; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 11.5px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .board { position: relative; }
  .hour { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--track); }
  .hour span { position: absolute; left: 6px; top: 3px; font-size: 11px; font-weight: 600; color: var(--muted); }
  .canvas { position: absolute; top: 0; bottom: 0; }
  .band { position: absolute; border-radius: 8px; background: var(--card); box-shadow: inset 3px 0 0 var(--muted); }
  .band.ev { background: color-mix(in srgb, var(--event) 10%, transparent); box-shadow: inset 3px 0 0 var(--event); }
  .bhead { position: absolute; z-index: 3; height: 20px; padding: 0 8px; display: inline-flex; align-items: center; gap: 6px; border-radius: 8px 8px 8px 0; font-size: 11.5px; font-weight: 800; white-space: nowrap; overflow: hidden; color: var(--text); background: var(--hi); box-shadow: 0 0 0 2px var(--ring); }
  .bhead.ev { color: #06403f; background: #9fe6dc; }
  .bhead span { overflow: hidden; text-overflow: ellipsis; }
  .bhead small { flex: none; font-size: 10.5px; opacity: 0.75; }
  .bhead.sel, .block.sel { outline: 2px solid var(--text); }
  .block { position: absolute; z-index: 1; padding: 4px 6px; border-radius: 8px; text-align: left; overflow: hidden; font-size: 11.5px; line-height: 1.35; color: var(--text);
    background: color-mix(in srgb, var(--c) 26%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent), 0 0 0 2px var(--ring); }
  .block b { display: block; font-weight: 800; }
  .block small { display: block; font-size: 10.5px; opacity: 0.75; }
  .block.short b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block.short small { display: none; }
</style>
