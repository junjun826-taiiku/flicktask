<script lang="ts">
  /** Stroke icons drawn in a 24px box, so they sit centred in any button (text glyphs like × › ▾ don't). */
  type Name = 'x' | 'back' | 'right' | 'down' | 'up' | 'check' | 'arrow-up' | 'arrow-down';
  let { name, size = 18 }: { name: Name; size?: number } = $props();
  const PATHS: Record<Name, string> = {
    x: 'M6 6l12 12M18 6L6 18',
    back: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    down: 'M6 9l6 6 6-6',
    up: 'M6 15l6-6 6 6',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    'arrow-up': 'M12 19V5M6 11l6-6 6 6',
    'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  };
</script>

<svg class="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={PATHS[name]} /></svg>

<style>
  .icon { display: block; flex: none; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
</style>
