<script lang="ts">
  import { store, type Filter } from './lib/store.svelte';

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'todo', label: '未着手' },
    { key: 'doing', label: '進行中' },
    { key: 'done', label: '完了' },
  ];
  const index = $derived(tabs.findIndex((t) => t.key === store.filter));
</script>

<div class="seg glass" role="tablist" aria-label="ステータス" style="--i:{index}">
  <span class="seg-thumb" aria-hidden="true"></span>
  {#each tabs as t}
    <button
      role="tab"
      aria-selected={store.filter === t.key}
      class:active={store.filter === t.key}
      onclick={() => (store.filter = t.key)}
      data-testid="tab-{t.key}"
    >
      {t.label}
      {#key store.counts[t.key]}
        <span class="count" data-testid="count-{t.key}">{store.counts[t.key]}</span>
      {/key}
    </button>
  {/each}
</div>
