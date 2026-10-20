<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { store } from './lib/store.svelte';
  import { router } from './lib/router.svelte';
  import { fromMin, nowMin, today } from './lib/dates';
  import { dayRows, getRoles, inMinutes, mine, situation, eventDays } from './lib/liveMode';

  let clock = $state(nowMin());
  onMount(() => {
    const t = setInterval(() => (clock = nowMin()), 30_000);
    return () => clearInterval(t);
  });

  // events happening today
  const live = $derived(store.activeEvents.filter((e) => e.start_date <= today() && today() <= e.end_date));
</script>

{#each live as e (e.id)}
  {@const who = getRoles(e.id) ?? { hq: true, roles: [] }}
  {@const rows = dayRows(store.tasks, e, today()).filter((r) => mine(r, who))}
  {@const s = situation(rows, clock)}
  {@const days = eventDays(e)}
  <button class="live-banner" onclick={() => router.openLive(e.id)} in:fly={{ y: -10, duration: 460, easing: backOut }} data-testid="live-banner">
    <span class="lb-text">
      <small>本番当日{days.length > 1 ? `　${days.indexOf(today()) + 1}日目` : ''}</small>
      <strong>{e.name}</strong>
      <span>
        {#if s.now}いま：{s.now.task.title}{:else if s.next}{fromMin(s.next.start)} {s.next.task.title}まで {inMinutes(s.next.start - clock)}{:else}今日の動きは終わりました{/if}
      </span>
    </span>
    <span class="lb-go">当日モード ›</span>
  </button>
{/each}
