import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScaleMule } from '../index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Minimal WebSocket stand-in the service can drive. */
class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  // Test helpers
  open(): void {
    this.onopen?.();
  }
  receive(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}

function ticketResponse(): Response {
  return new Response(JSON.stringify({ ticket: 'test-ticket' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('RealtimeService connection resilience', () => {
  let sm: ScaleMule;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    sm = new ScaleMule({ apiKey: 'test_api_key' });
  });

  afterEach(() => {
    sm.realtime.disconnect();
    vi.useRealTimers();
  });

  async function connectAndOpen(): Promise<MockWebSocket> {
    mockFetch.mockImplementation(() => Promise.resolve(ticketResponse()));
    sm.realtime.subscribe('test:channel', () => {});
    // Let fetchTicketAndConnect resolve and construct the socket
    await vi.advanceTimersByTimeAsync(0);
    const ws = MockWebSocket.instances.at(-1)!;
    ws.open();
    await vi.advanceTimersByTimeAsync(2100); // ticket-auth fallback promotes to connected
    expect(sm.realtime.status).toBe('connected');
    return ws;
  }

  it('recovers from a ticket fetch that hangs forever', async () => {
    // Fetch resolves only when aborted (rejects on abort like real fetch)
    mockFetch.mockImplementation(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    sm.realtime.subscribe('test:channel', () => {});
    expect(sm.realtime.status).toBe('connecting');

    // Abort fires at 10s and schedules a reconnect instead of wedging
    await vi.advanceTimersByTimeAsync(11000);
    expect(sm.realtime.status).toBe('reconnecting');

    // Next attempt succeeds
    mockFetch.mockImplementation(() => Promise.resolve(ticketResponse()));
    await vi.advanceTimersByTimeAsync(35000);
    const ws = MockWebSocket.instances.at(-1)!;
    ws.open();
    await vi.advanceTimersByTimeAsync(2100);
    expect(sm.realtime.status).toBe('connected');
  });

  it('force-reconnects a zombie socket that stops receiving traffic', async () => {
    const ws = await connectAndOpen();
    const socketsBefore = MockWebSocket.instances.length;

    // Silence: no pongs, no messages. After LIVENESS_TIMEOUT_MS (75s) the
    // next heartbeat tick must replace the socket.
    await vi.advanceTimersByTimeAsync(120000);

    expect(ws.closed).toBe(true);
    expect(MockWebSocket.instances.length).toBeGreaterThan(socketsBefore);
  });

  it('keeps a healthy socket alive when pongs arrive', async () => {
    const ws = await connectAndOpen();

    // Answer every ping with a pong for 5 minutes
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(30000);
      ws.receive('pong');
    }

    expect(ws.closed).toBe(false);
    expect(sm.realtime.status).toBe('connected');
  });

  it('reconnects immediately on a server reconnect message', async () => {
    const ws = await connectAndOpen();
    const socketsBefore = MockWebSocket.instances.length;

    ws.receive({ type: 'reconnect', reason: 'stale_ping_reaped', reresolve_placement: false });
    await vi.advanceTimersByTimeAsync(2000);

    expect(ws.closed).toBe(true);
    expect(MockWebSocket.instances.length).toBeGreaterThan(socketsBefore);
  });

  it('fails a connect attempt that never authenticates', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(ticketResponse()));
    sm.realtime.subscribe('test:channel', () => {});
    await vi.advanceTimersByTimeAsync(0);

    // Socket never opens, never errors, never closes. The watchdog (20s)
    // must fail the attempt instead of wedging in 'connecting' forever.
    await vi.advanceTimersByTimeAsync(21000);
    expect(sm.realtime.status).toBe('reconnecting');
  });
});
