/**
 * Realtime Service Module
 *
 * WebSocket client with:
 *   - Lazy connection (connects on first subscribe)
 *   - Auto-reconnect with exponential backoff + jitter
 *   - Auto re-subscribe on reconnect
 *   - Re-auth on reconnect (sends fresh session token)
 *   - Heartbeat detection
 *   - Presence support (join/leave/state)
 *
 * WebSocket protocol (JSON messages with `type` discriminator):
 *   Client → Server: auth, subscribe, unsubscribe, publish, presence_join, presence_leave
 *   Server → Client: auth_success, subscribed, message, error, presence_*
 *
 * HTTP endpoints for server-side broadcast:
 *   POST /broadcast              → all connections
 *   POST /broadcast/channel/{c}  → channel subscribers
 *   POST /broadcast/user/{uid}   → specific user
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type MessageCallback = (data: unknown, channel: string) => void;
export type StatusCallback = (status: ConnectionStatus) => void;
export type PresenceCallback = (event: PresenceEvent) => void;

export interface PresenceEvent {
  type: 'join' | 'leave' | 'state';
  channel: string;
  user_id?: string;
  user?: { user_id: string; user_data?: unknown; joined_at?: string };
  members?: Array<{ user_id: string; user_data?: unknown; joined_at?: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RECONNECT_BASE_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;

// ============================================================================
// Realtime Service
// ============================================================================

export class RealtimeService extends ServiceModule {
  protected basePath = '/v1/realtime';

  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<MessageCallback>>();
  private presenceCallbacks = new Map<string, Set<PresenceCallback>>();
  private statusCallbacks = new Set<StatusCallback>();
  private _status: ConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private authenticated = false;

  /** Current connection status */
  get status(): ConnectionStatus {
    return this._status;
  }

  // --------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // --------------------------------------------------------------------------

  /**
   * Subscribe to a channel. Connects WebSocket on first call.
   * Returns an unsubscribe function.
   */
  subscribe(channel: string, callback: MessageCallback): () => void {
    // Track subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);

    // Connect if needed
    if (this._status === 'disconnected') {
      this.connect();
    } else if (this.authenticated) {
      // Already connected — send subscribe message
      this.sendWs({ type: 'subscribe', channel });
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(channel);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(channel);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendWs({ type: 'unsubscribe', channel });
          }
        }
      }
    };
  }

  // --------------------------------------------------------------------------
  // Publish
  // --------------------------------------------------------------------------

  /** Publish data to a channel via WebSocket. */
  publish(channel: string, data: unknown): void {
    if (this._status !== 'connected' || !this.authenticated) {
      throw new Error('Cannot publish: not connected');
    }
    this.sendWs({ type: 'publish', channel, data });
  }

  // --------------------------------------------------------------------------
  // Presence
  // --------------------------------------------------------------------------

  /** Join a presence channel with optional user data. */
  joinPresence(channel: string, userData?: unknown): void {
    if (this._status !== 'connected') {
      throw new Error('Cannot join presence: not connected');
    }
    this.sendWs({ type: 'presence_join', channel, user_data: userData });
  }

  /** Leave a presence channel. */
  leavePresence(channel: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWs({ type: 'presence_leave', channel });
    }
  }

  /** Listen for presence events on a channel. Returns unsubscribe function. */
  onPresence(channel: string, callback: PresenceCallback): () => void {
    if (!this.presenceCallbacks.has(channel)) {
      this.presenceCallbacks.set(channel, new Set());
    }
    this.presenceCallbacks.get(channel)!.add(callback);

    return () => {
      const cbs = this.presenceCallbacks.get(channel);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) this.presenceCallbacks.delete(channel);
      }
    };
  }

  // --------------------------------------------------------------------------
  // Server-side broadcast (HTTP endpoints)
  // --------------------------------------------------------------------------

  /** Broadcast to all connections for this application. */
  async broadcast(event: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>('/broadcast', { event, data }, options);
  }

  /** Broadcast to a specific channel. */
  async broadcastToChannel(
    channel: string,
    event: string,
    data: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>(`/broadcast/channel/${channel}`, { event, data }, options);
  }

  /** Send to a specific user's connections. */
  async sendToUser(
    userId: string,
    event: string,
    data: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>(`/broadcast/user/${userId}`, { event, data }, options);
  }

  // --------------------------------------------------------------------------
  // Connection Lifecycle
  // --------------------------------------------------------------------------

  /** Listen for connection status changes. */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /** Disconnect and clean up all subscriptions. */
  disconnect(): void {
    this.clearTimers();
    this.subscriptions.clear();
    this.presenceCallbacks.clear();
    this.statusCallbacks.clear();
    this.authenticated = false;
    this.reconnectAttempt = 0;

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  // --------------------------------------------------------------------------
  // Private: WebSocket management
  // --------------------------------------------------------------------------

  private connect(): void {
    if (this._status === 'connecting' || this._status === 'connected') return;

    const baseUrl = this.client.getBaseUrl();
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/v1/realtime/ws';

    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.authenticate();
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch {
        /* ignore malformed messages */
      }
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      this.clearHeartbeat();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this, triggering reconnect
    };
  }

  private authenticate(): void {
    const token = this.client.getSessionToken();
    const appId = this.client.getApplicationId();
    this.sendWs({
      type: 'auth',
      token: token || undefined,
      app_id: appId || undefined
    });
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    switch (type) {
      case 'auth_success':
        this.authenticated = true;
        this.setStatus('connected');
        // Re-subscribe to all channels
        for (const channel of this.subscriptions.keys()) {
          this.sendWs({ type: 'subscribe', channel });
        }
        break;

      case 'subscribed':
        // Channel subscription confirmed
        break;

      case 'message':
        this.dispatchMessage(msg.channel as string, msg.data);
        break;

      case 'error':
        // Could emit error event in future
        break;

      case 'presence_state':
        this.dispatchPresence({
          type: 'state',
          channel: msg.channel as string,
          members: msg.members as PresenceEvent['members']
        });
        break;

      case 'presence_join':
        this.dispatchPresence({
          type: 'join',
          channel: msg.channel as string,
          user: msg.user as PresenceEvent['user']
        });
        break;

      case 'presence_leave':
        this.dispatchPresence({
          type: 'leave',
          channel: msg.channel as string,
          user_id: msg.user_id as string
        });
        break;
    }
  }

  private dispatchMessage(channel: string, data: unknown): void {
    const subs = this.subscriptions.get(channel);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(data, channel);
        } catch {
          /* don't let one callback break others */
        }
      }
    }
  }

  private dispatchPresence(event: PresenceEvent): void {
    const cbs = this.presenceCallbacks.get(event.channel);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(event);
        } catch {
          /* don't let one callback break others */
        }
      }
    }
  }

  private sendWs(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // --------------------------------------------------------------------------
  // Private: Reconnection
  // --------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.subscriptions.size === 0 && this.presenceCallbacks.size === 0) {
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('reconnecting');
    const delay = this.getReconnectDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  private getReconnectDelay(): number {
    const exponential = DEFAULT_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt);
    const jitter = Math.random() * 0.3 * exponential;
    return Math.min(exponential + jitter, MAX_RECONNECT_MS);
  }

  // --------------------------------------------------------------------------
  // Private: Heartbeat
  // --------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Private: Status
  // --------------------------------------------------------------------------

  private setStatus(status: ConnectionStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this.statusCallbacks) {
      try {
        cb(status);
      } catch {
        /* ignore */
      }
    }
  }
}
