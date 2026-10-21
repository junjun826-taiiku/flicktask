<script lang="ts">
  // 当日モード (/events/:id/live): its own small shell — the phone screen used on the day.
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { store } from './lib/store.svelte';
  import { live } from './lib/live.svelte';
  import { toasts } from './lib/toast.svelte';
  import LiveMode from './LiveMode.svelte';
  import TaskSheet from './TaskSheet.svelte';

  const id = decodeURIComponent(location.pathname.split('/')[2] ?? '');
  $effect(() => {
    if (store.user) live.start();
    else live.stop();
  });
  onMount(async () => {
    document.getElementById('boot')?.remove();
    await store.init();
    document.body.classList.add('ready');
  });
</script>

<div class="cal-screen" data-testid="event-screen">
  <div class="cal-page live-page">{#if store.ready}<LiveMode {id} />{/if}</div>
</div>
<TaskSheet />

<div class="toasts" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div class="toast glass" animate:flip={{ duration: 300 }} in:fly={{ y: 40, duration: 480, easing: backOut }} out:fly={{ y: 20, duration: 220 }} data-testid="toast">
      <span>{t.text}</span>
      {#if t.action}
        <button onclick={() => (t.action!.run(), toasts.dismiss(t.id))}>{t.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

