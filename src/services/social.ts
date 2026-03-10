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
