<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { router } from './lib/router.svelte';
  import MonthView from './MonthView.svelte';
  import DayView from './DayView.svelte';
  import EventList from './EventList.svelte';
  import EventDetail from './EventDetail.svelte';

  const r = $derived(router.route);

  // lock the memo screen underneath while the calendar is on top
  $effect(() => {
    document.documentElement.style.overflow = 'hidden';
    return () => (document.documentElement.style.overflow = '');
  });
</script>

<!-- Pushed over the memo screen like a native navigation stack; the memo screen stays mounted underneath. -->
<div
  class="cal-screen"
  in:fly|global={{ x: '100%', duration: 460, easing: cubicOut, opacity: 1 }}
  out:fly|global={{ x: '100%', duration: 360, easing: cubicOut, opacity: 1 }}
  data-testid={r.name === 'month' || r.name === 'day' ? 'calendar' : 'event-screen'}
>
  <div class="cal-inner">
    {#if r.name === 'month'}
      <div class="cal-page" in:fly={{ x: -40, duration: 380, easing: cubicOut }}>
        <MonthView month={r.month} />
      </div>
    {:else if r.name === 'day'}
      <div class="cal-page" in:fly={{ x: 60, duration: 420, easing: cubicOut }}>
        <DayView date={r.date} />
      </div>
    {:else if r.name === 'events'}
      <div class="cal-page" in:fly={{ x: -40 * router.dir, duration: 380, easing: cubicOut }}>
        <EventList />
      </div>
    {:else if r.name === 'event'}
      {#key r.id}
        <div class="cal-page" in:fly={{ x: 60 * router.dir, duration: 420, easing: cubicOut }}>
          <EventDetail id={r.id} tab={r.tab} />
        </div>
      {/key}
    {/if}
  </div>
</div>
