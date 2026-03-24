/**
 * WebPushManager — Browser push notification subscription manager
 *
 * Handles service worker registration, Notification permission prompts,
 * PushManager.subscribe(), and backend token registration.
 *
 * All HTTP calls go through an injectable PushApiFetcher — this lets
 * the NextJS hook inject a fetcher that routes through /api/push/* proxy,
 * while the React hook injects one that calls the gateway directly.
 */

import type { PushSettings, RegisterPushTokenData, WebPushSubscriptionData } from './services/communication';

// ============================================================================
// PushApiFetcher — injectable HTTP transport
// ============================================================================

export interface PushApiFetcher {
  getSettings(): Promise<PushSettings>;
  registerToken(data: RegisterPushTokenData): Promise<{ id: string }>;
  unregisterToken(tokenId: string): Promise<void>;
  associateUser(tokenId: string): Promise<void>;
  disassociateUser(tokenId: string): Promise<void>;
}

// ============================================================================
// WebPushManager
// ============================================================================

export interface WebPushManagerOptions {
  /** Service worker URL (default: '/sw.js') */
  serviceWorkerUrl?: string;
  /** Required: HTTP transport abstraction */
  fetcher: PushApiFetcher;
}

const STORAGE_KEY = 'scalemule_push_state';

interface PersistedPushState {
  endpoint: string;
  tokenId: string;
  deviceId: string;
}

export class WebPushManager {
  private fetcher: PushApiFetcher;
  private swUrl: string;
  private state: PersistedPushState | null = null;
  private registration: ServiceWorkerRegistration | null = null;

  constructor(options: WebPushManagerOptions) {
    if (typeof window === 'undefined') {
      throw new Error('WebPushManager can only be used in a browser environment');
    }
    this.fetcher = options.fetcher;
    this.swUrl = options.serviceWorkerUrl || '/sw.js';

    // Restore persisted state
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      }
    } catch {
      // localStorage unavailable or corrupt
    }
  }

  /** Whether the browser supports Web Push */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  /** Current notification permission state */
  getPermissionState(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /** Request notification permission from the user */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    return Notification.requestPermission();
  }

  /**
   * Full subscribe flow:
   * 1. Check browser support
   * 2. Request notification permission
   * 3. Register service worker
   * 4. Fetch VAPID public key from backend
   * 5. PushManager.subscribe() with VAPID key
   * 6. Register token with backend
   *
   * @param deviceId Optional device identifier for anonymous users.
   *                 If not provided, generates a random UUID stored in localStorage.
   */
  async subscribe(deviceId?: string): Promise<{ tokenId: string; endpoint: string } | null> {
    if (!this.isSupported()) return null;

    // Request permission
    const permission = await this.requestPermission();
    if (permission !== 'granted') return null;

    // Register service worker
    this.registration = await navigator.serviceWorker.register(this.swUrl);
    await navigator.serviceWorker.ready;

    // Get VAPID public key from backend
    const settings = await this.fetcher.getSettings();
    if (!settings.webpush_enabled || !settings.vapid_public_key) {
      throw new Error('Web Push is not enabled for this application');
    }

    // Convert base64url VAPID key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(settings.vapid_public_key);

    // Subscribe via PushManager
    const pushSubscription = await this.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    // Extract subscription data
    const endpoint = pushSubscription.endpoint;
    const p256dh = arrayBufferToBase64url(pushSubscription.getKey('p256dh')!);
    const auth = arrayBufferToBase64url(pushSubscription.getKey('auth')!);

    const subscription: WebPushSubscriptionData = {
      endpoint,
      keys: { p256dh, auth },
    };

    // Generate or use provided device_id
    const resolvedDeviceId = deviceId || this.state?.deviceId || generateDeviceId();

    // Register with backend
    const result = await this.fetcher.registerToken({
      token: endpoint,
      platform: 'web',
      device_id: resolvedDeviceId,
      subscription,
    });

    // Persist state
    this.state = {
      endpoint,
      tokenId: result.id,
      deviceId: resolvedDeviceId,
    };
    this.persistState();

    return { tokenId: result.id, endpoint };
  }

  /** Unsubscribe from browser push and deregister token */
  async unsubscribe(): Promise<void> {
    // Unsubscribe from browser
    const sub = await this.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }

    // Deregister from backend
    if (this.state?.tokenId) {
      try {
        await this.fetcher.unregisterToken(this.state.tokenId);
      } catch {
        // Best effort — token may already be deactivated
      }
    }

    // Clear persisted state
    this.state = null;
    this.clearState();
  }

  /** Link push token to the currently authenticated user (call after login) */
  async associateUser(): Promise<void> {
    if (!this.state?.tokenId) return;
    await this.fetcher.associateUser(this.state.tokenId);
  }

  /** Clear user association from push token (call before logout) */
  async disassociateUser(): Promise<void> {
    if (!this.state?.tokenId) return;
    await this.fetcher.disassociateUser(this.state.tokenId);
  }

  /** Check if currently subscribed to push notifications */
  async isSubscribed(): Promise<boolean> {
    if (!this.isSupported()) return false;
    const sub = await this.getSubscription();
    return sub !== null && this.state !== null;
  }

  /** Get the active PushSubscription from the service worker */
  async getSubscription(): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration(this.swUrl);
      if (!reg) return null;
      return reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  /** Get the stored token ID (for external use) */
  getTokenId(): string | null {
    return this.state?.tokenId || null;
  }

  private persistState(): void {
    if (this.state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // localStorage full or unavailable
      }
    }
  }

  private clearState(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert a base64url-encoded string to Uint8Array (for VAPID applicationServerKey) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Convert ArrayBuffer to base64url string */
function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a random device ID */
function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
