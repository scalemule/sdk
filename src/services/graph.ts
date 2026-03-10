/**
 * Graph Service Module
 *
 * Graph database: nodes, edges, traversal, algorithms.
 *
 * Routes:
 *   POST /nodes                           → create node
 *   PATCH /nodes/{id}                     → update node
 *   POST /edges                           → create edge
 *   GET  /nodes/{id}/edges                → get edges for node
 *   GET  /nodes/{id}/traverse             → traverse graph
 *   POST /shortest-path                   → shortest path
 *   GET  /nodes/{id}/neighbors            → neighbors
 *   POST /algorithms/pagerank             → PageRank
 *   POST /algorithms/centrality           → centrality
 *   POST /algorithms/connected-components → connected components
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface GraphNode {
  node_id: string;
  node_type: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface GraphEdge {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: string;
  properties?: Record<string, unknown>;
  weight: number;
  created_at: string;
}

export interface TraversalResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

export interface ShortestPathResult {
  path: string[];
  distance: number;
  edges: GraphEdge[];
}

// ============================================================================
// Graph Service
// ============================================================================

export class GraphService extends ServiceModule {
  protected basePath = '/v1/graph';

  async createNode(
    data: { label: string; properties?: Record<string, unknown> },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<GraphNode>> {
    return this.post<GraphNode>('/nodes', data, requestOptions);
  }

  async updateNode(
    nodeId: string,
    data: { properties: Record<string, unknown> },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<GraphNode>> {
    return this.patch<GraphNode>(`/nodes/${nodeId}`, data, requestOptions);
  }

  async createEdge(
    data: { from_id: string; to_id: string; type: string; properties?: Record<string, unknown> },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<GraphEdge>> {
    return this.post<GraphEdge>('/edges', data, requestOptions);
  }

  async getEdges(
    nodeId: string,
    options?: { type?: string; direction?: 'in' | 'out' | 'both' },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<GraphEdge[]>> {
    return this._get<GraphEdge[]>(this.withQuery(`/nodes/${nodeId}/edges`, options), requestOptions);
  }

  async traverse(
    nodeId: string,
    options?: { depth?: number; direction?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<TraversalResult>> {
    return this._get<TraversalResult>(this.withQuery(`/nodes/${nodeId}/traverse`, options), requestOptions);
  }

  async shortestPath(
    options: { from: string; to: string; max_depth?: number },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<ShortestPathResult>> {
    return this.post<ShortestPathResult>('/shortest-path', options, requestOptions);
  }

  async neighbors(
    nodeId: string,
    options?: { depth?: number; type?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<GraphNode[]>> {
    return this._get<GraphNode[]>(this.withQuery(`/nodes/${nodeId}/neighbors`, options), requestOptions);
  }

  async pageRank(
    options?: { iterations?: number; damping?: number },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<Record<string, number>>> {
    return this.post<Record<string, number>>('/algorithms/pagerank', options, requestOptions);
  }

  async centrality(
    options?: { algorithm?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<Record<string, number>>> {
    return this.post<Record<string, number>>('/algorithms/centrality', options, requestOptions);
  }

  async connectedComponents(options?: RequestOptions): Promise<ApiResponse<string[][]>> {
    return this.post<string[][]>('/algorithms/connected-components', undefined, options);
  }
}
