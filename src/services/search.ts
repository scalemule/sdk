/**
 * Search Service Module
 *
 * Full-text search: index, query, remove.
 *
 * Routes:
 *   POST   /                         → search/query
 *   POST   /documents                → index document
 *   DELETE /documents/{index}/{docId} → remove document
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
  id: string
  index: string
  score: number
  document: Record<string, unknown>
  highlights?: Record<string, string[]>
}

// ============================================================================
// Search Service
// ============================================================================

export class SearchService extends ServiceModule {
  protected basePath = '/v1/search'

  async query(queryStr: string, queryOptions?: { index?: string; limit?: number }, requestOptions?: RequestOptions): Promise<ApiResponse<SearchResult[]>> {
    return this.post<SearchResult[]>('', { query: queryStr, ...queryOptions }, requestOptions)
  }

  async index(indexName: string, document: { id: string; [key: string]: unknown }, options?: RequestOptions): Promise<ApiResponse<{ indexed: boolean }>> {
    return this.post<{ indexed: boolean }>('/documents', { index: indexName, ...document }, options)
  }

  async removeDocument(indexName: string, docId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/documents/${indexName}/${docId}`, options)
  }

  /** @deprecated Use query() instead */
  async search(queryStr: string, options?: { index?: string; limit?: number }) {
    return this.query(queryStr, options)
  }

  /** @deprecated Use index() instead */
  async indexDocument(data: { index: string; id: string; document: unknown }) {
    return this.post<{ indexed: boolean }>('/documents', data)
  }
}
