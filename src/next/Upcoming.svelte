<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { addDays, today as todayFn, weekday } from '../lib/dates';
  import { tagColor, upcoming } from './home';

  const today = todayFn();
  const items = $derived(upcoming(store.tasks, (id) => store.eventById(id), today));
  const dayLabel = (d: string) => `${d === today ? '今日 ' : d === addDays(today, 1) ? '明日 ' : ''}${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${weekday(d)})`;
</script>

<section class="nx-panel up" aria-label="直近の予定" data-testid="nx-upcoming">
  <h2>直近の予定</h2>
  {#if items.length === 0}
    <p class="empty">これからの予定はありません</p>
  {:else}
    <div class="list">
      {#each items as x, i (x.task.id)}
        {#if i === 0 || items[i - 1].date !== x.date}<span class="day" class:today={x.date === today}>{dayLabel(x.date)}</span>{/if}
        <div class="item" data-testid="nx-upcoming-item">
          <span class="time nx-num">{x.task.plan_start ?? '終日'}</span>
          <i class="bar" style="background:{x.task.tag ? tagColor(x.task.tag) : 'var(--event)'}"></i>
          <span class="body">
            <span class="title">{x.task.title}</span>
            {#if x.event || x.task.tag}
              <span class="meta">{x.event?.name ?? ''}{x.event && x.task.tag ? '・' : ''}{#if x.task.tag}<b style="color:{tagColor(x.task.tag)}">{x.task.tag}</b>{/if}</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .up { padding: 18px 20px; min-width: 0; }
  h2 { margin: 0 0 12px; font-size: 16px; font-weight: 800; }
  .empty { margin: 0; font-size: 13px; color: var(--sub); }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .day { margin-top: 8px; font-size: 12px; font-weight: 800; color: var(--muted); }
  .day:first-child { margin-top: 0; }
  .day.today { color: var(--event); }
  .item { display: flex; align-items: stretch; gap: 10px; padding: 2px 0; }
  .time { width: 44px; flex: none; font-size: 12.5px; font-weight: 600; color: var(--sub); padding-top: 1px; }
  .bar { display: block; width: 3px; flex: none; align-self: stretch; border-radius: 2px; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .title { font-size: 13.5px; font-weight: 700; line-height: 1.4; }
  .meta { font-size: 11.5px; color: var(--muted); }
  .meta b { font-weight: 700; }
</style>
