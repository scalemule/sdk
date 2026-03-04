/**
 * Data Service Module
 *
 * Document-oriented data storage with collections, CRUD, query, and aggregation.
 *
 * Routes:
 *   POST   /collections                    → create collection
 *   GET    /collections                    → list collections
 *   DELETE /collections/{name}             → delete collection
 *   POST   /{collection}/documents         → create document
 *   GET    /{collection}/documents/{id}    → get document
 *   PATCH  /{collection}/documents/{id}    → update document
 *   DELETE /{collection}/documents/{id}    → delete document
 *   POST   /{collection}/query             → query documents
 *   POST   /{collection}/aggregate         → aggregate
 *   GET    /{collection}/my-documents      → user's documents
 */

import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface Collection {
  id: string
  collection_name: string
  schema_definition?: unknown
  indexes?: unknown
  created_at: string
}

export interface Document {
  id: string
  collection_id: string
  sm_user_id?: string
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface QueryFilter {
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
  field: string
  value: unknown
  /** For 'in' operator */
  values?: unknown[]
}

export interface QuerySort {
  field: string
  direction?: 'asc' | 'desc'
}

export interface QueryOptions extends PaginationParams {
  filters?: QueryFilter[]
  sort?: QuerySort[]
}

export interface AggregateOptions {
  pipeline: Array<Record<string, unknown>>
}

export interface AggregateResult {
  results: Array<Record<string, unknown>>
}

// ============================================================================
// Data Service
// ============================================================================

export class DataService extends ServiceModule {
  protected basePath = '/v1/data'

  // --------------------------------------------------------------------------
  // Collections
  // --------------------------------------------------------------------------

  async createCollection(name: string, schema?: unknown, options?: RequestOptions): Promise<ApiResponse<Collection>> {
    return this.post<Collection>('/collections', { name, schema }, options)
  }

  async listCollections(options?: RequestOptions): Promise<ApiResponse<Collection[]>> {
    return this._get<Collection[]>('/collections', options)
  }

  async deleteCollection(name: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/collections/${name}`, options)
  }

  // --------------------------------------------------------------------------
  // Documents — CRUD
  // --------------------------------------------------------------------------

  async create(collection: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<Document>> {
    return this.post<Document>(`/${collection}/documents`, { data }, options)
  }

  async get(collection: string, docId: string, options?: RequestOptions): Promise<ApiResponse<Document>> {
    return this._get<Document>(`/${collection}/documents/${docId}`, options)
  }

  async update(collection: string, docId: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<Document>> {
    return this.patch<Document>(`/${collection}/documents/${docId}`, { data }, options)
  }

  async delete(collection: string, docId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${collection}/documents/${docId}`, options)
  }

  // --------------------------------------------------------------------------
  // Documents — Query & Aggregate
  // --------------------------------------------------------------------------

  async query(collection: string, options?: QueryOptions, requestOptions?: RequestOptions): Promise<PaginatedResponse<Document>> {
    const body = {
      filters: options?.filters ?? [],
      sort: options?.sort ?? [],
      page: options?.page ?? 1,
      per_page: options?.perPage ?? 20,
    }
    const response = await this.post<Record<string, unknown>>(`/${collection}/query`, body, requestOptions)

    if (response.error) {
      return {
        data: [],
        metadata: { total: 0, totalPages: 0, page: body.page, perPage: body.per_page },
        error: response.error,
      }
    }

    // Normalize the response
    const raw = response.data
    const documents = (raw?.documents ?? raw?.data ?? []) as Document[]
    const total = (raw?.total as number) ?? documents.length
    const totalPages = (raw?.total_pages as number) ?? (total > 0 ? Math.ceil(total / body.per_page) : 0)

    return {
      data: documents,
      metadata: {
        total,
        totalPages,
        page: (raw?.page as number) ?? body.page,
        perPage: (raw?.per_page as number) ?? body.per_page,
      },
      error: null,
    }
  }

  async aggregate(collection: string, options: AggregateOptions, requestOptions?: RequestOptions): Promise<ApiResponse<AggregateResult>> {
    return this.post<AggregateResult>(`/${collection}/aggregate`, options, requestOptions)
  }

  async myDocuments(collection: string, options?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Document>> {
    return this._list<Document>(`/${collection}/my-documents`, options, requestOptions)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use create() instead */
  async createDocument(collection: string, data: unknown) {
    return this.create(collection, data)
  }

  /** @deprecated Use get() instead */
  async getDocument(collection: string, id: string) {
    return this.get(collection, id)
  }

  /** @deprecated Use update() instead */
  async updateDocument(collection: string, id: string, data: unknown) {
    return this.update(collection, id, data)
  }

  /** @deprecated Use delete() instead */
  async deleteDocument(collection: string, id: string) {
    return this.delete(collection, id)
  }

  /** @deprecated Use query() instead */
  async queryDocuments(collection: string, options?: QueryOptions) {
    return this.query(collection, options)
  }
}
