/**
 * Referrals Service Module
 *
 * Referral program management — share links, campaigns, attribution, rewards.
 *
 * Routes:
 *   GET    /me            → current user's referral profile + stats
 *   GET    /me/analytics  → referral analytics over time
 *   POST   /links         → create tracked share link (records channel)
 *   GET    /public        → resolve referral code to campaign info (no auth)
 *   GET    /campaign      → get campaign config
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ReferralProfile {
  referral_code: string;
  share_link: string;
  campaign: ReferralCampaign;
  stats: ReferralStats;
}

export interface ReferralCampaign {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  reward_referrer_cents: number;
  reward_friend_cents: number;
  starts_at: string | null;
  ends_at: string | null;
}

export interface ReferralStats {
  clicks: number;
  signups: number;
  paid: number;
  rewarded: number;
}

export interface ShareLink {
  channel: string;
  share_link: string;
  referral_code: string;
}

export interface ReferralAnalytics {
  daily: Array<{
    date: string;
    clicks: number;
    signups: number;
    paid: number;
  }>;
  totals: ReferralStats;
}

export interface ResolvedReferral {
  referral_code: string;
  campaign: ReferralCampaign;
}

// ============================================================================
// Service
// ============================================================================

export class ReferralsService extends ServiceModule {
  protected basePath = '/v1/referrals';

  /**
   * Get current user's referral code, share link, campaign, and stats.
   * Requires member auth.
   */
  async getMyReferral(options?: RequestOptions): Promise<ApiResponse<ReferralProfile>> {
    return this._get<ReferralProfile>('/me', options);
  }

  /**
   * Generate a tracked share link. The `channel` param records where
   * the share was initiated (e.g., 'whatsapp', 'email', 'copy').
   * Requires member auth.
   */
  async createShareLink(channel?: string, options?: RequestOptions): Promise<ApiResponse<ShareLink>> {
    return this.post<ShareLink>('/links', channel ? { channel } : undefined, options);
  }

  /**
   * Get referral analytics for the current user over the last N days.
   * Requires member auth.
   */
  async getMyAnalytics(days?: number, options?: RequestOptions): Promise<ApiResponse<ReferralAnalytics>> {
    const query = days ? `?days=${days}` : '';
    return this._get<ReferralAnalytics>(`/me/analytics${query}`, options);
  }

  /**
   * Resolve a referral code to its campaign info.
   * Public endpoint — no member auth required, only API key.
   */
  async resolveCode(code: string, options?: RequestOptions): Promise<ApiResponse<ResolvedReferral>> {
    return this._get<ResolvedReferral>(`/public?rc=${encodeURIComponent(code)}`, options);
  }
}
