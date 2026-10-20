import { DurableObject } from 'cloudflare:workers';

/**
 * One hub per account. Every open device keeps a WebSocket here; after a save, the Worker calls
 * `changed()` and the hub tells the other devices to pull. Uses the hibernation API, so idle
 * connections cost nothing and survive the object being evicted from memory.
 */
export class UserHub extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // keep-alive pings are answered without waking the object
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const clientId = new URL(request.url).searchParams.get('cid') ?? '';
    const pair = new WebSocketPair();
    // the tag lets changed() skip the device that made the change
    this.ctx.acceptWebSocket(pair[1], [clientId.slice(0, 64)]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Tell every connected device except `from` that data changed. */
  async changed(from: string): Promise<number> {
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (from && this.ctx.getTags(ws).includes(from)) continue;
      try {
        ws.send(JSON.stringify({ type: 'changed', at: Date.now() }));
        sent++;
      } catch {
        // socket already closing; the runtime cleans it up
      }
    }
    return sent;
  }

  async webSocketMessage() {
    // clients only listen; anything else is ignored
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'bye');
    } catch {}
  }
}
