<script lang="ts">
  // LINE連携: make a one-time code to send in the LINE group, see which chats are linked, turn the Monday summary on/off.
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { toasts } from '../lib/toast.svelte';

  let { close }: { close: () => void } = $props();
  type Link = { id: string; kind: string; name: string; weekly: boolean; created_at: number };
  let configured = $state<boolean | null>(null);
  let links = $state<Link[]>([]);
  let code = $state<{ code: string; expires_at: number } | null>(null);
  let now = $state(Date.now());
  const left = $derived(code ? Math.max(0, Math.min(600, Math.floor((code.expires_at - now) / 1000))) : 0);

  async function load() {
    const res = await fetch('/api/line');
    if (!res.ok) return;
    const j = (await res.json()) as { configured: boolean; links: Link[] };
    configured = j.configured;
    links = j.links;
  }
  /** links before the code was made: one more means the code was used */
  let before = 0;
  onMount(() => {
    load();
    // count the code down, and every 3 s look for the chat it linked
    const id = setInterval(async () => {
      now = Date.now();
      if (!code || left === 0 || Math.floor(now / 1000) % 3) return;
      await load();
      if (links.length > before) (code = null), toasts.show('LINEと連携しました');
    }, 1000);
    return () => clearInterval(id);
  });
  async function makeCode() {
    const res = await fetch('/api/line/code', { method: 'POST' });
    if (!res.ok) return toasts.show('コードを作れませんでした');
    before = links.length;
    code = await res.json();
  }
  async function setWeekly(l: Link, weekly: boolean) {
    l.weekly = weekly;
    const res = await fetch(`/api/line/links/${l.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ weekly }) });
    if (!res.ok) (l.weekly = !weekly), toasts.show('変更できませんでした');
  }
  async function unlink(l: Link) {
    const res = await fetch(`/api/line/links/${l.id}`, { method: 'DELETE' });
    if (res.ok) links = links.filter((x) => x.id !== l.id), toasts.show('連携を解除しました');
  }
  const kindLabel = (k: string) => (k === 'group' ? 'グループ' : k === 'room' ? '複数人トーク' : '1対1のトーク');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={close} transition:fade={{ duration: 160 }}></div>
<aside class="panel" role="dialog" aria-modal="true" aria-label="LINE連携" transition:fly={{ x: 440, duration: 280, easing: cubicOut, opacity: 1 }} data-testid="nx-line">
  <div class="top">
    <h2>LINE連携</h2>
    <button class="x nx-chip" onclick={close} aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
  </div>
  <p class="lead">幹部のLINEグループにボットを入れておくと、<b>毎週月曜の朝8時</b>に今週の締切と予定のまとめが届きます。グループで「<b>やること</b>」と送ると、1か月分の締切を返します。</p>

  {#if configured === false}
    <p class="warn" data-testid="nx-line-off">LINEのボットがまだ設定されていません（管理者がLINE公式アカウントを用意して、アプリに登録する必要があります）。</p>
  {/if}

  <section>
    <h3>つなぐ</h3>
    <ol>
      <li>LINEグループに、Task本部のボット（LINE公式アカウント）を招待する</li>
      <li>下のボタンで連携コードを出す</li>
      <li>そのグループに「連携 コード」と送る（例：連携 123456）</li>
    </ol>
    {#if code && left > 0}
      <div class="code" data-testid="nx-line-code">
        <span class="nx-num">連携 {code.code}</span>
        <small>あと{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}有効・1回だけ使えます</small>
      </div>
    {:else}
      <button class="primary" onclick={makeCode} data-testid="nx-line-make">連携コードを出す</button>
    {/if}
  </section>

  <section>
    <h3>連携中のトーク</h3>
    {#if links.length === 0}
      <p class="empty">まだありません</p>
    {:else}
      {#each links as l (l.id)}
        <div class="link" data-testid="nx-line-link">
          <div class="b"><b>{l.name || kindLabel(l.kind)}</b><small>{kindLabel(l.kind)}・{new Date(l.created_at).toLocaleDateString('ja-JP')}から</small></div>
          <label class="tog"><input type="checkbox" checked={l.weekly} onchange={(e) => setWeekly(l, e.currentTarget.checked)} data-testid="nx-line-weekly" />月曜のまとめ</label>
          <button class="nx-chip un" onclick={() => unlink(l)} data-testid="nx-line-unlink">解除</button>
        </div>
      {/each}
    {/if}
    <p class="note">LINEの無料プランで送れる通知は月200通までで、「1回の通知 × グループの人数」で数えます。月曜のまとめは、締切も予定もない週には送りません。「やること」への返事は数に入りません。</p>
  </section>
</aside>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.35); }
  .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: 440px; max-width: 100%; padding: 22px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto;
    background: var(--drawer); border-left: 1px solid var(--border); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: -30px 0 60px -20px rgba(0, 0, 0, 0.6); }
  .top { display: flex; align-items: center; }
  h2 { margin: 0 auto 0 0; font-size: 20px; font-weight: 800; }
  .x { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; }
  .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
  .lead { margin: 0; font-size: 13.5px; line-height: 1.7; color: var(--sub); }
  .lead b { color: var(--text); }
  .warn { margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; color: #f0c36a; background: rgba(240, 160, 32, 0.12); }
  section { display: flex; flex-direction: column; gap: 10px; }
  h3 { margin: 0; font-size: 14px; font-weight: 800; }
  ol { margin: 0; padding-left: 1.3em; font-size: 13px; line-height: 1.8; color: var(--sub); }
  .primary { align-self: flex-start; height: 40px; padding: 0 16px; border-radius: 12px; font-size: 13.5px; font-weight: 800; color: #fff; background: #06c755; }
  .code { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 14px; background: var(--card); border: 1px dashed #06c755; }
  .code span { font-size: 26px; font-weight: 800; letter-spacing: 0.06em; user-select: all; }
  .code small { font-size: 12px; color: var(--muted); }
  .empty { margin: 0; font-size: 13px; color: var(--muted); }
  .link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
  .link .b { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .link b { font-size: 13.5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .link small { font-size: 11.5px; color: var(--muted); }
  .tog { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--sub); }
  .tog input { accent-color: #06c755; }
  .un { flex: none; height: 30px; padding: 0 10px; border-radius: 9px; font-size: 12px; font-weight: 700; color: var(--over-text); }
  .note { margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--muted); }
</style>
