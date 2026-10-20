import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cloudflare } from '@cloudflare/vite-plugin';

// FT_STATE: separate local D1/Durable Object storage for a second dev server
// (two workerd instances on the same .wrangler/state files corrupt each other's locks).
const state = process.env.FT_STATE;

export default defineConfig({
  plugins: [svelte(), cloudflare(state ? { persistState: { path: state } } : {})],
});
