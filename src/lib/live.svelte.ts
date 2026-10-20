// Real-time updates: a WebSocket to the account's hub. When another device saves, the hub sends
// {type:"changed"} and we pull. Reconnects with backoff and catches up whenever we come back.
import { store } from './store.svelte';
import { clientId } from './client-id';

const PING_MS = 25_000;
/** No pong this long after a ping = the socket died silently; reconnect. */
const PONG_TIMEOUT_MS = 10_000;
/** Safety net while the app is open, in case a notification was ever missed. */
const SAFETY_PULL_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

class Live {
  status = $state<'off' | 'connecting' | 'on'>('off');
  #ws: WebSocket | null = null;
  #wanted = false;
  #retry = 0;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #ping: ReturnType<typeof setInterval> | undefined;
  #pullTimer: ReturnType<typeof setTimeout> | undefined;
  #pongTimer: ReturnType<typeof setTimeout> | undefined;
  #safety: ReturnType<typeof setInterval> | undefined;

  constructor() {
    // phones suspend background tabs: reconnect and catch up as soon as we're visible again
    const wake = () => {
      if (!this.#wanted || document.visibilityState !== 'visible') return;
      if (this.status === 'off') this.#connect();
      this.#schedulePull(0);
    };
    document.addEventListener('visibilitychange', wake);
    addEventListener('pageshow', wake);
    addEventListener('focus', wake);
    addEventListener('online', wake);
  }

  start() {
    if (this.#wanted) return;
    this.#wanted = true;
    this.#connect();
    this.#safety = setInterval(() => document.visibilityState === 'visible' && this.#schedulePull(0), SAFETY_PULL_MS);
  }

  stop() {
    this.#wanted = false;
    clearTimeout(this.#retryTimer);
    clearInterval(this.#safety);
    this.#teardown();
    this.status = 'off';
  }

  #connect() {
    if (!this.#wanted || this.#ws) return;
    this.status = 'connecting';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/live?cid=${clientId}`);
    this.#ws = ws;
    ws.onopen = () => {
      this.status = 'on';
      this.#retry = 0;
      this.#ping = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send('ping');
        clearTimeout(this.#pongTimer);
        // dead socket: its close handshake may never finish, so drop it and reconnect right away
        this.#pongTimer = setTimeout(() => {
          this.#teardown();
          this.status = 'off';
          this.#connect();
        }, PONG_TIMEOUT_MS);
      }, PING_MS);
      this.#schedulePull(0); // catch up on anything missed while disconnected
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return void clearTimeout(this.#pongTimer);
      try {
        if (JSON.parse(e.data).type === 'changed') this.#schedulePull(120);
      } catch {}
    };
    ws.onclose = () => {
      this.#teardown();
      this.status = 'off';
      if (!this.#wanted) return;
      const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.#retry++);
      this.#retryTimer = setTimeout(() => this.#connect(), document.visibilityState === 'visible' ? wait : MAX_BACKOFF_MS);
    };
    ws.onerror = () => ws.close();
  }

  #teardown() {
    clearInterval(this.#ping);
    clearTimeout(this.#pongTimer);
    const ws = this.#ws;
    this.#ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      ws.onclose = null;
      ws.close();
    }
  }

  /** Coalesce bursts of "changed" (e.g. a 10-task AI add) into one pull. */
  #schedulePull(ms: number) {
    clearTimeout(this.#pullTimer);
    this.#pullTimer = setTimeout(() => store.user && store.pull(), ms);
  }
}

export const live = new Live();
