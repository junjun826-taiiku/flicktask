<script lang="ts">
  // One lane per イベント担当 (plus 担当なし); each task is a bar whose right end is its deadline.
  import type { FEvent, Task } from '../../lib/store.svelte';
  import { addDays, today as todayFn } from '../../lib/dates';
  import { aimDate, dayDiff } from '../home';
  import { axis, DAY_PX, forMember, lanes as makeLanes } from './prep';

  let { tasks, event, who, selected, open }: { tasks: Task[]; event: FEvent | null; who: string | null; selected: string | null; open: (id: string) => void } = $props();
  const today = todayFn();
  const ax = $derived(axis(event, today));
  const lanes = $derived(makeLanes(tasks, event, event?.members ?? [], today, ax.from).filter((l) => who === null || l.key === who));
  const undated = $derived(tasks.filter((t) => !aimDate(t, event)).filter(forMember(who)));
  const at = (i: number) => (Math.max(0, Math.min(ax.days, i)) / ax.days) * 100;
  const mondays = $derived.by(() => {
    const out: { label: string; i: number }[] = [];
    for (let i = 0; i < ax.days; i++) {
      const d = addDays(ax.from, i);
      if (new Date(d + 'T00:00').getDay() === 1) out.push({ label: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`, i });
    }
    return out;
  });
  const todayAt = $derived(dayDiff(ax.from, today));
  const eventAt = $derived(event ? dayDiff(ax.from, event.start_date) : -1);
  const eventLen = $derived(event ? dayDiff(event.start_date, event.end_date) + 1 : 0);
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
</script>

<div class="legend" aria-hidden="true">
  <span><i class="todo"></i>未着手</span><span><i class="doing"></i>進行中</span><span><i class="done"></i>完了</span><span><i class="over"></i>期限切れ</span>
  <span class="r">帯の右端が締切</span>
</div>
<div class="scroll">
  <div class="tl" style="min-width:{Math.max(760, 132 + ax.days * DAY_PX)}px" data-testid="nx-member-timeline">
    <div class="ticks">
      <span></span>
      <div class="axis">{#each mondays as m}<span style="left:{at(m.i)}%">{m.label}</span>{/each}</div>
    </div>
    <div class="body">
      <div class="overlay" aria-hidden="true">
        {#each mondays as m}<i class="week" style="left:{at(m.i)}%"></i>{/each}
        {#if event && eventAt < ax.days}
          <i class="ev" style="left:{at(eventAt)}%; width:{(eventLen / ax.days) * 100}%"><span>本番 {md(event.start_date)}</span></i>
        {/if}
        <i class="now" style="left:{at(todayAt)}%"><span>今日</span></i>
      </div>
      {#each lanes as l (l.key)}
        <div class="lane" data-testid="nx-lane">
          <span class="who">
            {#if l.color}<span class="av" style="background:{l.color}">{l.name[0]}</span>{:else}<span class="av none">－</span>{/if}
            <span class="nm"><b>{l.name}</b><small>残り {l.open}件</small></span>
          </span>
          <div class="track" style="height:{l.rows * 32 + 14}px">
            {#each l.pills as p (p.task.id)}
              <button
                class="pill {p.task.status}"
                class:over={p.over}
                class:sel={selected === p.task.id}
                style="top:{8 + p.row * 32}px; left:calc({at(p.start)}% + 2px); width:calc({at(p.end) - at(p.start)}% - 4px)"
                onclick={() => open(p.task.id)}
                title="{p.task.title}（{md(aimDate(p.task, event) ?? '')}まで）"
                data-testid="nx-pill"
              ><span>{p.task.title}</span></button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
{#if undated.length}
  <div class="undated">
    <span class="l">日付なし</span>
    {#each undated as t (t.id)}
      <button class="pill {t.status}" onclick={() => open(t.id)} data-testid="nx-undated">{t.title}{t.assignees.length ? `（${t.assignees.join('・')}）` : ''}</button>
    {/each}
  </div>
{/if}
{#if (event?.members.length ?? 0) === 0}
  <p class="tip">イベントの「編集」で担当メンバーを登録すると、人ごとの行に分かれます。</p>
{/if}

<style>
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin: 0 2px 10px; font-size: 11.5px; color: var(--sub); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 18px; height: 10px; border-radius: 3px; border: 1.3px solid var(--border); background: var(--panel); }
  .legend i.doing { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .legend i.done { background: var(--chip); border-color: transparent; }
  .legend i.over { border: 1.3px dashed var(--over); background: rgba(255, 107, 91, 0.12); }
  .legend .r { margin-left: auto; }
  .scroll { overflow-x: auto; scrollbar-width: thin; padding-bottom: 6px; }
  .ticks, .lane { display: grid; grid-template-columns: 120px minmax(0, 1fr); column-gap: 12px; }
  /* the names stay put while the weeks scroll under them */
  .tl { --solid: color-mix(in srgb, #fff 4.5%, var(--bg)); }
  :global(.nx[data-theme='light']) .tl { --solid: color-mix(in srgb, #fff 78%, var(--bg)); }
  .ticks > span:first-child, .who { position: sticky; left: 0; z-index: 3; background: var(--solid); box-shadow: 12px 0 0 var(--solid); }
  .ticks > span:first-child { margin: -40px 0 0; }
  .ticks { margin-top: 22px; }
  .axis { position: relative; height: 22px; }
  .axis span { position: absolute; top: 2px; padding-left: 5px; font-family: var(--num); font-size: 11px; font-weight: 600; color: var(--muted); }
  .body { position: relative; }
  .overlay { position: absolute; inset: 0 0 0 132px; pointer-events: none; }
  .week { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--week); }
  .ev { position: absolute; top: 0; bottom: 0; background: rgba(240, 164, 58, 0.14); border-left: 2px solid rgba(240, 164, 58, 0.7); }
  .ev span, .now span { position: absolute; top: -40px; white-space: nowrap; font-size: 10.5px; font-weight: 800; font-style: normal; }
  .ev span { left: 50%; transform: translateX(-50%); color: #f0a43a; }
  .now { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--accent); z-index: 2; }
  .now span { left: -12px; color: var(--accent); }
  .lane { border-top: 1px solid var(--track); }
  .who { display: flex; align-items: center; gap: 8px; padding-top: 6px; align-self: stretch; align-items: flex-start; min-width: 0; }
  .av { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; color: #fff; }
  .av.none { color: var(--muted); background: var(--chip); }
  .nm { display: flex; flex-direction: column; min-width: 0; }
  .nm b { font-size: 13px; }
  .nm small { font-size: 11px; color: var(--muted); }
  .track { position: relative; }
  .pill { position: absolute; height: 26px; display: flex; align-items: center; padding: 0 10px; border-radius: 8px; font-size: 12px; font-weight: 700; text-align: left; white-space: nowrap; overflow: hidden;
    color: var(--text); background: var(--panel); border: 1.3px solid var(--border); }
  .pill span { overflow: hidden; text-overflow: ellipsis; }
  .pill.doing { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .pill.done { color: var(--muted); background: var(--chip); border-color: transparent; text-decoration: line-through; }
  .pill.over { color: var(--over-text); background: rgba(255, 107, 91, 0.12); border: 1.3px dashed rgba(255, 107, 91, 0.8); }
  .pill.sel { outline: 2px solid var(--text); }
  .undated { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: var(--track); }
  .undated .l { font-size: 12px; font-weight: 700; color: var(--muted); margin-right: 4px; }
  .undated .pill { position: static; height: 28px; }
  .tip { margin: 10px 2px 0; font-size: 11.5px; color: var(--muted); }
</style>
