<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { addMonths, monthGrid, monthOf, today as todayFn } from '../lib/dates';
  import { calendarMarks } from './home';

  const today = todayFn();
  let month = $state(monthOf(today));
  const days = $derived(monthGrid(month));
  const marks = $derived(calendarMarks(store.tasks, store.liveEvents, month));
  const title = $derived(`${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`);
</script>

<section class="nx-panel cal" aria-label="カレンダー" data-testid="nx-minical">
  <div class="cal-head">
    <span class="cal-title" data-testid="nx-minical-title">{title}</span>
    <button onclick={() => (month = addMonths(month, -1))} aria-label="前の月" data-testid="nx-minical-prev"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
    <button onclick={() => (month = addMonths(month, 1))} aria-label="次の月" data-testid="nx-minical-next"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
  </div>
  <div class="wd" aria-hidden="true"><span class="sun">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span class="sat">土</span></div>
  <div class="grid">
    {#each days as d, i (d)}
      {@const mark = marks.get(d)}
      <a
        href="/next/calendar?m={month}&d={d}"
        class="day"
        class:out={d.slice(0, 7) !== month.slice(0, 7)}
        class:today={d === today}
        class:sun={i % 7 === 0}
        class:sat={i % 7 === 6}
        aria-label="{Number(d.slice(5, 7))}月{Number(d.slice(8))}日{mark !== undefined ? '（予定あり）' : ''}"
        data-date={d}
      >
        <span class="nx-num">{Number(d.slice(8))}</span>
        {#if mark !== undefined}<i style={mark ? `background:${mark}` : ''} data-testid="nx-minical-dot"></i>{/if}
      </a>
    {/each}
  </div>
  <a class="open" href="/next/calendar?m={month}" data-testid="nx-open-month">月表示を開く</a>
</section>

<style>
  .cal { padding: 14px 14px 12px; }
  .cal-head { display: flex; align-items: center; gap: 2px; margin-bottom: 8px; }
  .cal-title { margin-right: auto; font-size: 14px; font-weight: 700; }
  .cal-head button { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--sub); }
  .cal-head button:hover { background: var(--chip); }
  .cal-head svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .wd, .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; text-align: center; }
  .wd { font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 2px; }
  .wd .sun { color: #ff7a7a; }
  .wd .sat { color: var(--accent); }
  .day { position: relative; height: 30px; display: grid; place-items: center; border-radius: 9px; font-size: 12.5px; font-weight: 600; }
  .day:hover { background: var(--chip); }
  .day.sun { color: #ff7a7a; }
  .day.sat { color: var(--accent); }
  .day.out { opacity: 0.35; }
  .day.today { color: var(--on-accent); background: var(--accent); }
  .day i { position: absolute; bottom: 3px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--sub); }
  .day.today i { display: none; }
  .open { display: block; margin-top: 8px; text-align: center; font-size: 12px; font-weight: 700; color: var(--sub); }
  .open:hover { color: var(--text); }
</style>
