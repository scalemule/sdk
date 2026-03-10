/**
 * Listings Service Module
 *
 * Marketplace listings: CRUD, search, nearby, favorites.
 *
 * Routes:
 *   POST   /                      → create listing
 *   GET    /{id}                  → get listing
 *   PATCH  /{id}                  → update listing
 *   DELETE /{id}                  → delete listing
 *   GET    /search                → search listings
 *   GET    /nearby                → nearby listings
 *   GET    /categories/{category} → by category
 *   POST   /{id}/favorite         → favorite
 *   DELETE /{id}/favorite         → unfavorite
 *   GET    /favorites             → user's favorites
 *   POST   /{id}/view             → track view
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Listing {
  id: string;
  title: string;
  description: string;
  price?: number;
  category?: string;
  location?: { lat: number; lng: number };
  images?: string[];
  status: string;
  view_count?: number;
  favorite_count?: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Listings Service
// ============================================================================

export class ListingsService extends ServiceModule {
  protected basePath = '/v1/listings';

  async create(
    data: { title: string; description: string; price?: number; category?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Listing>> {
    return this.post<Listing>('', data, options);
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<Listing>> {
    return this._get<Listing>(`/${id}`, options);
  }

  async update(id: string, data: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<Listing>> {
    return this.patch<Listing>(`/${id}`, data, options);
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options);
  }

  async search(
    query: string,
    filters?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<ApiResponse<Listing[]>> {
    return this._get<Listing[]>(this.withQuery('/search', { query, ...filters }), options);
  }

  async nearby(
    nearbyOptions: { lat: number; lng: number; radius: number; category?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Listing[]>> {
    return this._get<Listing[]>(this.withQuery('/nearby', nearbyOptions), options);
  }

  async getByCategory(
    category: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Listing>> {
    return this._list<Listing>(`/categories/${category}`, params, requestOptions);
  }

  async favorite(listingId: string, options?: RequestOptions): Promise<ApiResponse<{ favorited: boolean }>> {
    return this.post<{ favorited: boolean }>(`/${listingId}/favorite`, undefined, options);
  }

  async unfavorite(listingId: string, options?: RequestOptions): Promise<ApiResponse<{ unfavorited: boolean }>> {
    return this.del<{ unfavorited: boolean }>(`/${listingId}/favorite`, options);
  }

  async getFavorites(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Listing>> {
    return this._list<Listing>('/favorites', params, requestOptions);
  }

  async trackView(listingId: string, options?: RequestOptions): Promise<ApiResponse<{ tracked: boolean }>> {
    return this.post<{ tracked: boolean }>(`/${listingId}/view`, undefined, options);
  }

  /** @deprecated Use create() instead */
  async createListing(data: { title: string; description: string; price?: number; category?: string }) {
    return this.create(data);
  }

  /** @deprecated Use search() instead */
  async searchListings(query: string, filters?: Record<string, unknown>) {
    return this.search(query, filters);
  }

  /** @deprecated Use get() instead */
  async getListing(id: string) {
    return this.get(id);
  }
}
