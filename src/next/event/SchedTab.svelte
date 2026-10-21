<script lang="ts">
  import { store, BUILTIN_TAGS, type FEvent, type Task } from '../../lib/store.svelte';
  import { daysUntil, today as todayFn, weekday } from '../../lib/dates';
  import { schedules } from '../../lib/eventView';
  import { tagColor } from '../home';
  import SchedPanel from './SchedPanel.svelte';

  let { event }: { event: FEvent } = $props();
  const today = todayFn();
  const MAIN = '本番';
  let tagF = $state<string | null>(null);
  let selected = $state<string | null>(null);
  let showPast = $state(false);

  const isMain = (t: Task) => !!t.plan_date && event.start_date <= t.plan_date && t.plan_date <= event.end_date;
  /** what a row is labelled with: its tag, or 本番 for 予定 on the event days */
  const label = (t: Task) => t.tag || (isMain(t) ? MAIN : '');
  const all = $derived(schedules(store.tasks, event).filter((t) => t.plan_date).sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || (a.plan_start ?? '').localeCompare(b.plan_start ?? '')));
  const tags = $derived([...BUILTIN_TAGS, ...event.tags.filter((x) => !BUILTIN_TAGS.includes(x as never))]);
  const filtered = $derived(all.filter((t) => tagF === null || label(t) === tagF));
  const upcoming = $derived(filtered.filter((t) => (t.plan_end_date ?? t.plan_date!) >= today));
  const past = $derived(filtered.filter((t) => (t.plan_end_date ?? t.plan_date!) < today));
  const groups = (list: Task[]) => {
    const out: { date: string; items: Task[] }[] = [];
    for (const t of list) {
      const g = out.find((x) => x.date === t.plan_date);
      if (g) g.items.push(t);
      else out.push({ date: t.plan_date!, items: [t] });
    }
    return out;
  };
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${weekday(d)})`;
  const colorOf = (t: Task) => (label(t) === MAIN ? '#f0a43a' : label(t) ? tagColor(label(t)) : 'var(--event)');
  function add() {
    const date = today < event.start_date ? today : event.start_date;
    const t = store.add('新しい予定', Date.now(), { kind: 'event', event_id: event.id, plan_date: date, tag: tagF && tagF !== MAIN ? tagF : '' });
    if (t) selected = t.id;
  }
</script>

{#snippet list(gs: { date: string; items: Task[] }[], dim: boolean)}
  {#each gs as g (g.date)}
    {@const main = g.date >= event.start_date && g.date <= event.end_date}
    <div class="g" class:dim>
      <span class="gh" class:main>{md(g.date)}{main ? '　本番' : ''}{!dim && daysUntil(g.date) > 0 ? `　あと${daysUntil(g.date)}日` : ''}</span>
      {#each g.items as t (t.id)}
        <button class="row" class:sel={selected === t.id} onclick={() => (selected = t.id)} data-testid="nx-sched-row">
          <span class="time nx-num">{t.plan_start ?? '終日'}<small>{t.plan_end ?? ''}</small></span>
          <i class="bar" style="background:{colorOf(t)}"></i>
          <span class="body"><b>{t.title}</b>{#if t.place}<small>{t.place}</small>{/if}</span>
          <span class="tag" class:none={!label(t)} style="--c:{colorOf(t)}" data-testid="nx-sched-tag">{label(t) || 'タグなし'}</span>
        </button>
      {/each}
    </div>
  {/each}
{/snippet}

<section class="nx-panel sched" data-testid="nx-sched">
  <div class="head">
    <h2>このイベントの予定</h2>
    <button class="add nx-chip" onclick={add} data-testid="nx-sched-add">＋ 予定を追加</button>
  </div>
  <div class="filter" role="group" aria-label="タグで絞り込み">
    {#each [null, ...tags, MAIN] as key}
      {@const n = key === null ? all.length : all.filter((t) => label(t) === key).length}
      <button class:on={tagF === key} aria-pressed={tagF === key} onclick={() => (tagF = key)} data-testid="nx-sched-filter">
        {#if key}<i style="background:{key === MAIN ? '#f0a43a' : tagColor(key)}"></i>{/if}{key ?? 'すべて'}<small class="nx-num">{n}</small>
      </button>
    {/each}
  </div>
  {#if upcoming.length === 0 && past.length === 0}
    <p class="empty">予定はまだありません</p>
  {/if}
  <div class="lists">{@render list(groups(upcoming), false)}</div>
  {#if past.length}
    <button class="past" onclick={() => (showPast = !showPast)} aria-expanded={showPast} data-testid="nx-sched-past">終わった予定　{past.length}件</button>
    {#if showPast}<div class="lists">{@render list(groups(past), true)}</div>{/if}
  {/if}
</section>

{#if selected}
  <SchedPanel id={selected} {event} {tags} close={() => (selected = null)} />
{/if}

<style>
  .sched { padding: 18px 20px; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 16px; font-weight: 800; }
  .add { margin-left: auto; height: 34px; padding: 0 14px; border-radius: 10px; font-size: 12.5px; font-weight: 700; }
  .filter { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
  .filter button { height: 30px; padding: 0 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--sub); background: var(--chip); }
  .filter button i { width: 7px; height: 7px; border-radius: 50%; }
  .filter button small { font-size: 11px; opacity: 0.7; }
  .filter button.on { color: var(--bg); background: var(--text); }
  .lists { display: flex; flex-direction: column; gap: 16px; }
  .g { display: flex; flex-direction: column; gap: 8px; }
  .g.dim { opacity: 0.6; }
  .gh { font-size: 12px; font-weight: 800; color: var(--muted); }
  .gh.main { color: #f0a43a; }
  .row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; text-align: left; background: var(--card); border: 1px solid var(--border); }
  .row:hover { border-color: var(--sub); }
  .row.sel { background: var(--hi); border-color: var(--text); }
  .time { width: 58px; flex: none; display: flex; flex-direction: column; font-size: 13px; font-weight: 700; }
  .time small { font-size: 11px; font-weight: 600; color: var(--muted); }
  .bar { flex: none; width: 3px; align-self: stretch; border-radius: 2px; }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .body b { font-size: 14px; }
  .body small { font-size: 12px; color: var(--sub); }
  .tag { flex: none; height: 24px; padding: 0 10px; border-radius: 8px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .tag.none { color: var(--muted); background: none; border: 1px dashed var(--border); }
  .empty { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
  .past { margin-top: 16px; font-size: 12px; font-weight: 700; color: var(--muted); }
</style>
