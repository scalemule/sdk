/**
 * Social Service Module
 *
 * Follow/unfollow, posts, feed, likes, comments, activity feed.
 *
 * Routes:
 *   POST   /users/{id}/follow        → follow user
 *   DELETE /users/{id}/follow        → unfollow user
 *   GET    /users/{id}/followers     → get followers
 *   GET    /users/{id}/following     → get following
 *   GET    /users/{id}/follow-status → check follow status
 *   POST   /posts                    → create post
 *   GET    /posts/{id}               → get post
 *   DELETE /posts/{id}               → delete post
 *   GET    /users/{id}/posts         → user's posts
 *   GET    /feed                     → user's feed
 *   POST   /{type}/{id}/like         → like content
 *   DELETE /{type}/{id}/like         → unlike content
 *   GET    /{type}/{id}/likes        → get likes
 *   POST   /posts/{id}/comments      → comment on post
 *   GET    /posts/{id}/comments      → get comments
 *   GET    /activity                 → activity feed
 *   PATCH  /activity/{id}/read       → mark activity read
 *   PATCH  /activity/read-all        → mark all read
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface SocialPost {
  id: string;
  user_id: string;
  content: string;
  media_urls?: string[];
  visibility: 'public' | 'followers' | 'private';
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_comment_id?: string;
  content: string;
  likes_count: number;
  created_at: string;
}

export interface FollowStatus {
  is_following: boolean;
  is_followed_by: boolean;
}

export interface ActivityItem {
  id: string;
  activity_type: string;
  actor_user_id: string;
  target_type?: string;
  target_id?: string;
  metadata?: string;
  is_read: boolean;
  created_at: string;
}

/** Follower/following entry */
export interface SocialUser {
  user_id: string;
  followed_at: string;
}

export interface Like {
  user_id: string;
  created_at: string;
}

/**
 * Bipolar vote state. Score = up_count - down_count.
 *
 * `value` is the *caller's* current vote on the target:
 *   1 = upvote, -1 = downvote, 0 = no vote.
 */
export interface VoteState {
  value: 1 | -1 | 0;
  up_count: number;
  down_count: number;
  score: number;
}

/**
 * View counters for a target.
 *
 * `view_count` is total recorded views. `unique_viewer_count` is the
 * count of distinct (viewer, day) buckets — i.e. how many distinct
 * people viewed across all time, deduped per day.
 */
export interface ViewState {
  view_count: number;
  unique_viewer_count: number;
}

// ============================================================================
// Social Service
// ============================================================================

export class SocialService extends ServiceModule {
  protected basePath = '/v1/social';

  // --------------------------------------------------------------------------
  // Follow / Unfollow
  // --------------------------------------------------------------------------

  async follow(userId: string, options?: RequestOptions): Promise<ApiResponse<{ followed: boolean }>> {
    return this.post<{ followed: boolean }>(`/users/${userId}/follow`, undefined, options);
  }

  async unfollow(userId: string, options?: RequestOptions): Promise<ApiResponse<{ unfollowed: boolean }>> {
    return this.del<{ unfollowed: boolean }>(`/users/${userId}/follow`, options);
  }

  async getFollowers(
    userId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<SocialUser>> {
    return this._list<SocialUser>(`/users/${userId}/followers`, params, requestOptions);
  }

  async getFollowing(
    userId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<SocialUser>> {
    return this._list<SocialUser>(`/users/${userId}/following`, params, requestOptions);
  }

  async getFollowStatus(userId: string, options?: RequestOptions): Promise<ApiResponse<FollowStatus>> {
    return this._get<FollowStatus>(`/users/${userId}/follow-status`, options);
  }

  // --------------------------------------------------------------------------
  // Posts
  // --------------------------------------------------------------------------

  async createPost(
    data: { content: string; visibility?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPost>> {
    return this.post<SocialPost>('/posts', data, options);
  }

  async getPost(postId: string, options?: RequestOptions): Promise<ApiResponse<SocialPost>> {
    return this._get<SocialPost>(`/posts/${postId}`, options);
  }

  async deletePost(postId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/posts/${postId}`, options);
  }

  async getUserPosts(
    userId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<SocialPost>> {
    return this._list<SocialPost>(`/users/${userId}/posts`, params, requestOptions);
  }

  async getFeed(options?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SocialPost>> {
    return this._list<SocialPost>('/feed', options, requestOptions);
  }

  // --------------------------------------------------------------------------
  // Likes
  // --------------------------------------------------------------------------

  async like(targetType: string, targetId: string, options?: RequestOptions): Promise<ApiResponse<{ liked: boolean }>> {
    return this.post<{ liked: boolean }>(`/${targetType}/${targetId}/like`, undefined, options);
  }

  async unlike(
    targetType: string,
    targetId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ unliked: boolean }>> {
    return this.del<{ unliked: boolean }>(`/${targetType}/${targetId}/like`, options);
  }

  async getLikes(
    targetType: string,
    targetId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Like>> {
    return this._list<Like>(`/${targetType}/${targetId}/likes`, params, requestOptions);
  }

  // --------------------------------------------------------------------------
  // Voting (bipolar — up/down with score)
  // --------------------------------------------------------------------------

  /**
   * Cast, change, or clear the caller's vote on a target.
   *
   * `value`: 1 = upvote, -1 = downvote, 0 = clear.
   *
   * Idempotent: re-casting the same value is a no-op; clearing when no
   * vote exists is a no-op. Server validates `target_type` matches
   * `[a-z0-9_]{1,64}`. Convention: prefix per app (`weekmob_post`,
   * `gistyo_gist`).
   *
   * Requires an authenticated session; anonymous calls return 401.
   */
  async vote(
    targetType: string,
    targetId: string,
    value: 1 | -1 | 0,
    options?: RequestOptions
  ): Promise<ApiResponse<VoteState>> {
    return this.put<VoteState>(`/${targetType}/${targetId}/vote`, { value }, options);
  }

  /**
   * Read the caller's current vote on a target plus the aggregate counts.
   * `value` is 0 when the caller has no vote.
   *
   * Requires an authenticated session.
   */
  async getVote(targetType: string, targetId: string, options?: RequestOptions): Promise<ApiResponse<VoteState>> {
    return this._get<VoteState>(`/${targetType}/${targetId}/vote`, options);
  }

  // --------------------------------------------------------------------------
  // View counters
  // --------------------------------------------------------------------------

  /**
   * Record a view of a target. Increments the total counter
   * unconditionally; increments the unique-viewer counter once per
   * (viewer, UTC day).
   *
   * Authenticated callers don't need to pass `viewerFingerprint` — the
   * user_id is used. Anonymous callers may pass a 64-hex-char
   * fingerprint hash to participate in unique-viewer dedupe; without
   * one, only the total counter moves.
   */
  async recordView(
    targetType: string,
    targetId: string,
    viewerFingerprint?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ViewState>> {
    const body = viewerFingerprint ? { viewer_fingerprint: viewerFingerprint } : {};
    return this.post<ViewState>(`/${targetType}/${targetId}/views`, body, options);
  }

  /**
   * Read view counters for a target.
   */
  async getViews(targetType: string, targetId: string, options?: RequestOptions): Promise<ApiResponse<ViewState>> {
    return this._get<ViewState>(`/${targetType}/${targetId}/views`, options);
  }

  // --------------------------------------------------------------------------
  // Comments
  // --------------------------------------------------------------------------

  async comment(postId: string, data: { content: string }, options?: RequestOptions): Promise<ApiResponse<Comment>> {
    return this.post<Comment>(`/posts/${postId}/comments`, data, options);
  }

  async getComments(
    postId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Comment>> {
    return this._list<Comment>(`/posts/${postId}/comments`, params, requestOptions);
  }

  // --------------------------------------------------------------------------
  // Activity Feed
  // --------------------------------------------------------------------------

  async getActivity(
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<ActivityItem>> {
    return this._list<ActivityItem>('/activity', params, requestOptions);
  }

  async markActivityRead(activityId: string, options?: RequestOptions): Promise<ApiResponse<ActivityItem>> {
    return this.patch<ActivityItem>(`/activity/${activityId}/read`, {}, options);
  }

  async markAllRead(options?: RequestOptions): Promise<ApiResponse<{ marked_count: number }>> {
    return this.patch<{ marked_count: number }>('/activity/read-all', {}, options);
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use comment() instead */
  async addComment(postId: string, data: { content: string }) {
    return this.comment(postId, data);
  }
}
