/**
 * AI Service Module — ScaleMule AI facade (`sm.ai`)
 *
 * Thin adapter over `@scalemule/ai`: the same typed client, wired to this
 * SDK's credentials (API key, session token, active workspace).
 *
 * Routes (gateway prefix /v1/ai):
 *   POST   /runs                → create a run (idempotent)
 *   GET    /runs/{id}           → read a run
 *   GET    /runs/{id}/events    → lifecycle events (SSE)
 *   POST   /runs/{id}/cancel    → cancel
 *
 * Account scope: the active workspace (`sm.setWorkspaceContext`) is sent as
 * `x-requested-account-id`; the gateway verifies membership. A publishable
 * key with a signed-in user runs as that member; a server-side secret key
 * runs in service mode.
 */

import { ScaleMuleAi, createFetchTransport } from '@scalemule/ai';
import type {
  AiRequestOptions,
  AiResult,
  AiRun,
  SummarizeInput,
  SummarizeOptions,
  SummarizeResult
} from '@scalemule/ai';
import type { ScaleMuleClient } from '../client';

export interface AiServiceOptions {
  /** Custom fetch (tests, polyfills). Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export class AiService {
  private readonly ai: ScaleMuleAi;

  constructor(client: ScaleMuleClient, options: AiServiceOptions = {}) {
    const transport = createFetchTransport({
      baseUrl: client.getBaseUrl(),
      fetch: options.fetch,
      headers: () => {
        const headers: Record<string, string> = { 'x-api-key': client.getApiKey() };
        const token = client.getSessionToken();
        if (token) headers['authorization'] = `Bearer ${token}`;
        const workspaceId = client.getWorkspaceId();
        if (workspaceId) headers['x-requested-account-id'] = workspaceId;
        return headers;
      }
    });
    this.ai = new ScaleMuleAi({ transport });
  }

  /** Low-level run API: `create`, `get`, `wait`, `cancel`, `events`. */
  get runs(): ScaleMuleAi['runs'] {
    return this.ai.runs;
  }

  /** Summarize text and wait for the typed result. */
  summarize(input: SummarizeInput, options?: SummarizeOptions): Promise<AiResult<SummarizeResult>> {
    return this.ai.summarize(input, options);
  }

  /** Read one run (alias of `runs.get`). */
  getRun<TOutput = unknown>(runId: string, options?: AiRequestOptions): Promise<AiResult<AiRun<TOutput>>> {
    return this.ai.runs.get<TOutput>(runId, options);
  }
}
