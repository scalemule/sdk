/**
 * Polls Service Module
 *
 * Reader polls for any ScaleMule application. A poll can carry text, an image,
 * a video, or audio on the question and on each choice. Totals are public.
 * One account, or one device voter key, holds one ballot and may change it.
 *
 * Routes:
 *   POST   /manage                 → create
 *   GET    /manage                 → list, including drafts
 *   GET    /manage/{id}            → staff read
 *   PATCH  /manage/{id}            → update
 *   POST   /manage/{id}/publish    → open
 *   POST   /manage/{id}/close      → close
 *   GET    /public                 → published polls
 *   GET    /public/{slug}          → one published poll
 *   POST   /public/{slug}/votes    → cast or change a ballot
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export type PollMediaKind = 'text' | 'image' | 'video' | 'audio';
export type PollBallot = 'account' | 'key';
export type PollStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface PollMedia {
  kind: PollMediaKind;
  url?: string;
  text?: string;
  alt?: string;
  storage_id?: string;
  duration_ms?: number;
}

export interface PollChoiceInput {
  id: string;
  label: string;
  media?: PollMedia[];
}

export interface PollChoice extends PollChoiceInput {
  media: PollMedia[];
  votes: number;
}

export interface Poll {
  id: string;
  slug: string;
  question: string;
  description?: string;
  media: PollMedia[];
  choices: PollChoice[];
  ballot: PollBallot;
  status: PollStatus;
  opens_at?: string;
  closes_at?: string;
  subject_type?: string;
  subject_id?: string;
  total_votes: number;
  votable: boolean;
  my_choice_id?: string;
}

export interface CreatePollInput {
  slug: string;
  question: string;
  description?: string;
  media?: PollMedia[];
  choices: PollChoiceInput[];
  ballot?: PollBallot;
  opens_at?: string;
  closes_at?: string;
  subject_type?: string;
  subject_id?: string;
}

export interface UpdatePollInput {
  question?: string;
  description?: string;
  media?: PollMedia[];
  choices?: PollChoiceInput[];
  opens_at?: string;
  closes_at?: string;
  subject_type?: string;
  subject_id?: string;
  clear_description?: boolean;
  clear_schedule?: boolean;
  clear_subject?: boolean;
}

export interface PollListOptions {
  status?: PollStatus;
  subject_type?: string;
  subject_id?: string;
  limit?: number;
  voter_key?: string;
}

export class PollsService extends ServiceModule {
  protected basePath = '/v1/polls';

  async create(data: CreatePollInput, options?: RequestOptions): Promise<ApiResponse<Poll>> {
    return this.post<Poll>('/manage', data, options);
  }

  async list(params?: PollListOptions, options?: RequestOptions): Promise<ApiResponse<Poll[]>> {
    return this._get<Poll[]>(this.withQuery('/manage', params), options);
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<Poll>> {
    return this._get<Poll>(`/manage/${encodeURIComponent(id)}`, options);
  }

  async update(id: string, data: UpdatePollInput, options?: RequestOptions): Promise<ApiResponse<Poll>> {
    return this.patch<Poll>(`/manage/${encodeURIComponent(id)}`, data, options);
  }

  async publish(id: string, options?: RequestOptions): Promise<ApiResponse<Poll>> {
    return this.post<Poll>(`/manage/${encodeURIComponent(id)}/publish`, {}, options);
  }

  async close(id: string, options?: RequestOptions): Promise<ApiResponse<Poll>> {
    return this.post<Poll>(`/manage/${encodeURIComponent(id)}/close`, {}, options);
  }

  async listPublic(params?: PollListOptions, options?: RequestOptions): Promise<ApiResponse<Poll[]>> {
    return this._get<Poll[]>(this.withQuery('/public', params), options);
  }

  async getPublic(slug: string, params?: { voter_key?: string }, options?: RequestOptions): Promise<ApiResponse<Poll>> {
    return this._get<Poll>(this.withQuery(`/public/${encodeURIComponent(slug)}`, params), options);
  }

  async vote(
    slug: string,
    choiceId: string,
    voterKey?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Poll>> {
    return this.post<Poll>(`/public/${encodeURIComponent(slug)}/votes`, {
      choice_id: choiceId,
      voter_key: voterKey,
    }, options);
  }
}

const VOTER_KEY_STORAGE = 'sm_poll_voter_key';

/** Stable ASCII voter key for `ballot: "key"` polls. Pass it to getPublic and vote. */
export function pollVoterKey(storage?: Pick<Storage, 'getItem' | 'setItem'>): string {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  const existing = target?.getItem(VOTER_KEY_STORAGE);
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;
  if (!cryptoRef?.getRandomValues) {
    throw new Error('A browser crypto source is required to create a voter key.');
  }
  cryptoRef.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (const byte of bytes) key += alphabet[byte % alphabet.length];
  target?.setItem(VOTER_KEY_STORAGE, key);
  return key;
}

/** Whole-number percent from a choice count. The last displayed point can be short of 100. */
export function pollSharePercent(votes: number, total: number): number {
  if (!Number.isFinite(votes) || !Number.isFinite(total) || total <= 0 || votes <= 0) return 0;
  return Math.floor((votes * 100) / total);
}
