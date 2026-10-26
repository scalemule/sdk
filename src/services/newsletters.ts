/**
 * Newsletters Service Module
 *
 * Reader-side newsletter subscriptions with compliance-grade consent
 * evidence. The gateway records the reader's IP, browser, device fingerprint
 * and location on every call, so sign-ups made from the reader's browser
 * carry their own proof. Server-side apps forwarding a reader request must
 * use the server helper in `@scalemule/nextjs` so the reader's evidence (not
 * the server's) is recorded.
 *
 * Routes (all under /v1/newsletters):
 *   GET  /lists                      → active lists + consent text to show
 *   POST /lists/{slug}/subscriptions → sign up (double opt-in email)
 *   POST /subscriptions/confirm      → confirm from the email link token
 *   POST /unsubscribe                → opt out with an unsubscribe token
 *   GET  /preferences?token=         → preference centre (email-only readers)
 *   PUT  /preferences?token=         → change cadence / pause / resume
 *   GET  /me/subscriptions           → signed-in reader's subscriptions
 *   PUT  /me/subscriptions           → signed-in reader changes
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

/** `edition` = one email per published edition. Lists choose which they offer. */
export type NewsletterCadence = 'daily' | 'weekly' | 'edition' | (string & {});

/** A list a form can offer, with the consent text the form must display. */
export interface NewsletterList {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: 'digest' | 'campaign' | 'announcement';
  channels: string[];
  cadence_options: NewsletterCadence[];
  default_cadence: NewsletterCadence;
  default_timezone: string;
  double_opt_in_required: boolean;
  /** Show `consent_text` next to an unticked checkbox; null when no policy is published. */
  policy: { version: string; consent_text: string; privacy_policy_url: string | null } | null;
}

export interface NewsletterSubscribeInput {
  email?: string;
  /** Must be true: the reader ticked an unticked consent box. */
  consent: true;
  channel?: 'email';
  cadence?: NewsletterCadence;
  /** IANA timezone, e.g. `America/Los_Angeles`. */
  timezone?: string;
  /** Where the form lives, e.g. `footer`, `article_inline`. */
  collection_point?: string;
  collection_url?: string;
  placement?: string;
  /** What the reader was looking at, e.g. an article path. */
  origin_ref?: string;
  locale?: string;
}

/**
 * Sign-up result. `check_email` is returned whether or not the address was
 * new (no account enumeration); `active` only when the list skips double
 * opt-in.
 */
export type NewsletterSubscribeResult =
  | { status: 'check_email' }
  | {
      status: 'active';
      /** The signed-in reader's verified address was already subscribed. */
      already_subscribed?: boolean;
      list?: { slug: string; name: string };
      cadence: NewsletterCadence;
      next_delivery_at?: string | null;
    };

export interface NewsletterConfirmResult {
  status: 'active';
  already_confirmed: boolean;
  list: { slug: string; name: string };
  cadence: NewsletterCadence;
  next_delivery_at?: string | null;
  /** Preference-centre link for this reader (bearer token inside: do not log). */
  manage_url?: string;
  placement: string | null;
  origin_ref: string | null;
}

export interface NewsletterSubscription {
  subscription_id: string;
  list_id: string;
  slug: string;
  name: string;
  cadence_options: NewsletterCadence[];
  channel: string;
  cadence: NewsletterCadence;
  timezone: string;
  status: 'active' | 'unconfirmed' | 'paused' | 'unsubscribed' | 'suppressed';
  confirmed_at: string | null;
  next_delivery_at: string | null;
  /** Send back as `expected_revision`; a stale value is rejected with 409. */
  revision: number;
}

export interface NewsletterPreferenceChange {
  subscription_id: string;
  expected_revision: number;
  cadence?: NewsletterCadence;
  timezone?: string;
  /** false pauses or unsubscribes, true resumes. */
  active?: boolean;
}

// ============================================================================
// Newsletters Service
// ============================================================================

export class NewslettersService extends ServiceModule {
  protected basePath = '/v1/newsletters';

  /** Active lists of this application, with the consent text each form must show. */
  async lists(options?: RequestOptions): Promise<ApiResponse<{ lists: NewsletterList[] }>> {
    return this._get<{ lists: NewsletterList[] }>('/lists', options);
  }

  /** Signs a reader up. Call from the reader's browser so their own evidence is recorded. */
  async subscribe(
    slug: string,
    input: NewsletterSubscribeInput,
    options?: RequestOptions
  ): Promise<ApiResponse<NewsletterSubscribeResult>> {
    // No automatic retry: a 500 can follow a stored request whose
    // confirmation email failed, and a retry would send another one.
    return this.post<NewsletterSubscribeResult>(
      `/lists/${encodeURIComponent(slug)}/subscriptions`,
      { channel: 'email', ...input },
      { skipRetry: true, ...options }
    );
  }

  /** Confirms a sign-up with the token from the confirmation email link. */
  async confirm(token: string, options?: RequestOptions): Promise<ApiResponse<NewsletterConfirmResult>> {
    return this.post<NewsletterConfirmResult>('/subscriptions/confirm', { token }, options);
  }

  /** Opts out with the token from an unsubscribe link. Always succeeds for a well-formed token. */
  async unsubscribe(
    token: string,
    reason?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ unsubscribed: boolean }>> {
    return this.post<{ unsubscribed: boolean }>('/unsubscribe', reason ? { token, reason } : { token }, options);
  }

  /** Preference centre for readers without an account (token from the manage link). */
  async preferences(
    token: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ subscriptions: NewsletterSubscription[] }>> {
    return this._get<{ subscriptions: NewsletterSubscription[] }>(this.withQuery('/preferences', { token }), options);
  }

  async updatePreferences(
    token: string,
    changes: NewsletterPreferenceChange[],
    options?: RequestOptions
  ): Promise<ApiResponse<{ subscriptions: NewsletterSubscription[] }>> {
    return this.put<{ subscriptions: NewsletterSubscription[] }>(
      this.withQuery('/preferences', { token }),
      { changes },
      options
    );
  }

  /** The signed-in reader's subscriptions (verified account email only). */
  async mySubscriptions(options?: RequestOptions): Promise<ApiResponse<{ subscriptions: NewsletterSubscription[] }>> {
    return this._get<{ subscriptions: NewsletterSubscription[] }>('/me/subscriptions', options);
  }

  async updateMySubscriptions(
    changes: NewsletterPreferenceChange[],
    options?: RequestOptions
  ): Promise<ApiResponse<{ subscriptions: NewsletterSubscription[] }>> {
    return this.put<{ subscriptions: NewsletterSubscription[] }>('/me/subscriptions', { changes }, options);
  }
}
