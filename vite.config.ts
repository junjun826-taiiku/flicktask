import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cloudflare } from '@cloudflare/vite-plugin';

// FT_STATE: separate local D1/Durable Object storage for a second dev server
// (two workerd instances on the same .wrangler/state files corrupt each other's locks).
const state = process.env.FT_STATE;
// FT_OFFLINE=1: start without the remote Workers AI binding (when Cloudflare's preview API is down);
// everything but 「AIで分解」 still works locally.
const offline = process.env.FT_OFFLINE === '1';

export default defineConfig({
  plugins: [svelte(), cloudflare({ ...(state ? { persistState: { path: state } } : {}), ...(offline ? { remoteBindings: false } : {}) })],
});
