/**
 * Bookings Service Module — quotes, customer stats and booking completion
 * (the appointment system of record for Business Logic Plane decisions).
 *
 * Routes (gateway prefix /v1/bookings):
 *   POST   /quotes                          → create an offered quote (workspace-scoped)
 *   GET    /quotes/{id}                     → get a quote
 *   POST   /quotes/{id}/accept              → accept with a verified `appointment.deposit` receipt
 *   GET    /customers/{ref}/stats           → customer stats projection
 *   POST   /dashboard/bookings/{id}/complete → mark completed (host/admin; updates stats)
 *   POST   /dashboard/bookings/{id}/no-show  → mark no-show (host/admin; updates stats)
 *
 * Workspace scope: pass `headers: { 'x-requested-account-id': accountId }`.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';
import type { DecisionReceipt } from './decisions';

// ============================================================================
// Types
// ============================================================================

export type QuoteState = 'draft' | 'offered' | 'accepted' | 'expired' | 'cancelled';

export interface CreateQuoteInput {
  /** Customer-space / user reference (opaque; also `customer.ref` for decisions). */
  customer_ref: string;
  total_minor: number;
  /** ISO-4217. */
  currency: string;
  event_type_id?: string;
  location_ref?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}

export interface QuoteDeposit {
  required: boolean;
  amount_minor: number;
  percent_bps: number;
  currency: string;
  receipt_id: string;
  receipt_hash: string;
  decided_at: string;
}

export interface Quote {
  id: string;
  account_id: string;
  event_type_id: string | null;
  customer_ref: string;
  location_ref: string | null;
  total_minor: number;
  currency: string;
  state: QuoteState;
  expires_at: string | null;
  version: number;
  decision_receipt_id: string | null;
  decision_receipt_hash: string | null;
  metadata: (Record<string, unknown> & { deposit?: QuoteDeposit }) | null;
  created_at: string;
  updated_at: string;
}

export interface AcceptQuoteInput {
  /** The quote version last seen (optimistic concurrency). */
  expected_version: number;
  /** The `receipt` object returned by `sm.decisions.evaluate('appointment.deposit', …)`. */
  decision_receipt: Pick<DecisionReceipt, 'id' | 'content_hash' | 'signature' | 'signature_kid' | 'signed_document'>;
}

export interface CustomerStats {
  customer_ref: string;
  completed_count: number;
  no_show_count: number;
  cancelled_count: number;
  last_completed_at: string | null;
}

export interface BookingCompletionResult {
  ok: boolean;
  status: 'completed' | 'no_show';
  customer_stats: CustomerStats | null;
}

// ============================================================================
// Service
// ============================================================================

export class BookingsService extends ServiceModule {
  protected basePath = '/v1/bookings';

  /** Create an offered quote for a customer in the active workspace. */
  async createQuote(input: CreateQuoteInput, requestOptions?: RequestOptions): Promise<ApiResponse<Quote>> {
    return this.post<Quote>('/quotes', input, requestOptions);
  }

  async getQuote(quoteId: string, requestOptions?: RequestOptions): Promise<ApiResponse<Quote>> {
    return this._get<Quote>(`/quotes/${encodeURIComponent(quoteId)}`, requestOptions);
  }

  /**
   * Accept a quote with a verified deposit receipt. Bookings re-verifies the
   * receipt signature and binding server-side and commits the receipt id/hash
   * and deposit on the quote.
   */
  async acceptQuote(
    quoteId: string,
    input: AcceptQuoteInput,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<Quote>> {
    return this.post<Quote>(`/quotes/${encodeURIComponent(quoteId)}/accept`, input, requestOptions);
  }

  async getCustomerStats(customerRef: string, requestOptions?: RequestOptions): Promise<ApiResponse<CustomerStats>> {
    return this._get<CustomerStats>(`/customers/${encodeURIComponent(customerRef)}/stats`, requestOptions);
  }

  /** Host/admin: mark a booking completed (maintains the customer stats projection). */
  async completeBooking(
    bookingId: string,
    reason?: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<BookingCompletionResult>> {
    return this.post<BookingCompletionResult>(
      `/dashboard/bookings/${encodeURIComponent(bookingId)}/complete`,
      { reason },
      requestOptions
    );
  }

  /** Host/admin: mark a booking as a no-show (maintains the customer stats projection). */
  async markNoShow(
    bookingId: string,
    reason?: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<BookingCompletionResult>> {
    return this.post<BookingCompletionResult>(
      `/dashboard/bookings/${encodeURIComponent(bookingId)}/no-show`,
      { reason },
      requestOptions
    );
  }
}
