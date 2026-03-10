/**
 * Leaderboard Service Module
 *
 * Leaderboards: create, scores, rankings, history.
 *
 * Routes:
 *   POST   /                              → create leaderboard
 *   POST   /{boardId}/scores              → submit score
 *   GET    /{boardId}/rankings            → get rankings
 *   GET    /{boardId}/users/{userId}/rank → user rank
 *   GET    /{boardId}/users/{userId}/history → user history
 *   PATCH  /{boardId}/users/{userId}/score  → update score
 *   DELETE /{boardId}/users/{userId}/score  → delete score
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Leaderboard {
  id: string;
  name: string;
  sort_order: 'asc' | 'desc';
  entry_count?: number;
  created_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  score: number;
  rank: number;
  updated_at: string;
}

export interface UserRank {
  rank: number;
  score: number;
  total_entries: number;
}

// ============================================================================
// Leaderboard Service
// ============================================================================

export class LeaderboardService extends ServiceModule {
  protected basePath = '/v1/leaderboard';

  async create(
    data: { name: string; sort_order?: 'asc' | 'desc' },
    options?: RequestOptions
  ): Promise<ApiResponse<Leaderboard>> {
    return this.post<Leaderboard>('', data, options);
  }

  async submitScore(
    boardId: string,
    data: { user_id: string; score: number },
    options?: RequestOptions
  ): Promise<ApiResponse<LeaderboardEntry>> {
    return this.post<LeaderboardEntry>(`/${boardId}/scores`, data, options);
  }

  async getRankings(
    boardId: string,
    rankingOptions?: { limit?: number; offset?: number },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<LeaderboardEntry[]>> {
    return this._get<LeaderboardEntry[]>(this.withQuery(`/${boardId}/rankings`, rankingOptions), requestOptions);
  }

  async getUserRank(boardId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<UserRank>> {
    return this._get<UserRank>(`/${boardId}/users/${userId}/rank`, options);
  }

  async getUserHistory(
    boardId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<LeaderboardEntry[]>> {
    return this._get<LeaderboardEntry[]>(`/${boardId}/users/${userId}/history`, options);
  }

  async updateScore(
    boardId: string,
    userId: string,
    data: { score: number },
    options?: RequestOptions
  ): Promise<ApiResponse<LeaderboardEntry>> {
    return this.patch<LeaderboardEntry>(`/${boardId}/users/${userId}/score`, data, options);
  }

  async deleteScore(
    boardId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${boardId}/users/${userId}/score`, options);
  }
}
