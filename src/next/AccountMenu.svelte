<script lang="ts">
  // Signed in: avatar → backup export / import and logout. Signed out: the Google login button.
  import { fly } from 'svelte/transition';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';

  let open = $state(false);
  let fileEl = $state<HTMLInputElement>();
  const initial = $derived((store.user?.name || store.user?.email || '?').slice(0, 1).toUpperCase());

  async function onImport() {
    const file = fileEl?.files?.[0];
    if (!file) return;
    open = false;
    try {
      const r = await store.importBackup(file);
      toasts.show(`読み込みました（追加 ${r.added}件・更新 ${r.merged}件）`);
    } catch (e) {
      toasts.show(e instanceof Error ? e.message : '読み込めませんでした');
    } finally {
      if (fileEl) fileEl.value = '';
    }
  }
</script>

<svelte:window onclick={() => (open = false)} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

{#if store.user}
  <div class="acct">
    <button class="avatar" onclick={(e) => (e.stopPropagation(), (open = !open))} aria-haspopup="menu" aria-expanded={open} aria-label="アカウント" data-testid="avatar">
      {#if store.user.picture}<img src={store.user.picture} alt="" referrerpolicy="no-referrer" />{:else}{initial}{/if}
    </button>
    {#if open}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} transition:fly={{ y: -6, duration: 160 }}>
        <div class="who"><strong>{store.user.name ?? ''}</strong><span>{store.user.email}</span></div>
        <button role="menuitem" onclick={() => ((open = false), store.exportBackup())} data-testid="export">データを書き出す</button>
        <button role="menuitem" onclick={() => fileEl?.click()} data-testid="import">データを読み込む</button>
        <button role="menuitem" class="out" onclick={() => store.logout()} data-testid="logout">ログアウト</button>
      </div>
    {/if}
    <input bind:this={fileEl} type="file" accept="application/json,.json" hidden onchange={onImport} data-testid="import-file" />
  </div>
{:else if store.ready}
  <a class="login nx-chip" href="/auth/google" data-testid="login">
    <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
    <span>ログイン</span>
  </a>
{/if}

<style>
  .acct { position: relative; }
  .avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; font-weight: 800; color: #fff; background: #a64bd6; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .menu { position: absolute; right: 0; top: 46px; z-index: 70; min-width: 230px; padding: 6px; border-radius: 14px; display: flex; flex-direction: column;
    background: var(--drawer); border: 1px solid var(--border); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: 0 20px 40px -16px rgba(0, 0, 0, 0.6); }
  .who { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px 10px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .who strong { font-size: 13.5px; }
  .who span { font-size: 12px; color: var(--muted); }
  .menu button { height: 38px; padding: 0 10px; border-radius: 9px; text-align: left; font-size: 13.5px; font-weight: 600; }
  .menu button:hover { background: var(--hi); }
  .menu .out { color: var(--over-text); }
  .login { height: 38px; padding: 0 14px 0 12px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
  @media (max-width: 400px) {
    .login span { display: none; }
    .login { padding: 0 11px; }
  }
</style>
