/**
 * Billing Service Module
 *
 * Compatibility wrapper for the remaining `/v1/money/billing/*` endpoints.
 *
 * Routes:
 *   POST   /customers                    → create customer
 *   POST   /payment-methods              → add payment method
 *   GET    /invoices                       → list invoices
 *   GET    /invoices/{id}                  → get invoice
 *   POST   /invoices/{id}/pay              → pay invoice
 *   GET    /invoices/{id}/pdf              → invoice PDF
 *   POST   /connected-accounts             → create connected account
 *   GET    /connected-accounts/me          → get own connected account
 *   GET    /connected-accounts/{id}        → get connected account
 *   POST   /connected-accounts/{id}/onboarding-link → create onboarding link
 *   POST   /connected-accounts/{id}/account-session → create account session (embedded onboarding)
 *   GET    /connected-accounts/{id}/payout-schedule → get payout schedule
 *   PUT    /connected-accounts/{id}/payout-schedule → set payout schedule
 *   POST   /setup-sessions                 → create setup session
 *
 * Subscription lifecycle, usage, ledger, payment creation, and marketplace
 * settlement moved out of `money-billing` during the April 10, 2026 cutover.
 * Use `@scalemule/money` for the full money-service family.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Core Billing Types
// ============================================================================

export interface Customer {
  id: string;
  stripe_customer_id?: string;
  email: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Subscription {
  id: string;
  customer_id: string;
  stripe_subscription_id?: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  stripe_invoice_id?: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  due_date?: string;
  paid_at?: string;
  created_at: string;
}

export interface UsageSummary {
  customer_id: string;
  event_type: string;
  total_quantity: number;
  total_cost: number;
  event_count: number;
}

export interface PaymentMethod {
  id: string;
  customer_id: string;
  stripe_payment_method_id?: string;
  type: string;
  last4?: string;
  brand?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
  created_at: string;
}

// ============================================================================
// Marketplace Types
// ============================================================================

export interface ConnectedAccount {
  id: string;
  email: string;
  country: string;
  status: 'pending' | 'onboarding' | 'active' | 'restricted' | 'disabled';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  onboarding_complete: boolean;
  details_submitted: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AccountBalance {
  currency: string;
  available_cents: number;
  pending_cents: number;
  reserved_cents: number;
}

export interface Payment {
  id: string;
  customer_id: string;
  connected_account_id?: string;
  amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  provider_fee_cents: number;
  creator_net_cents: number;
  status: string;
  payment_type?: string;
  client_secret?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  amount_cents: number;
  platform_fee_reversal_cents: number;
  reason?: string;
  status: string;
  created_at: string;
}

export interface Payout {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  arrival_date?: string;
  created_at: string;
}

export interface PayoutSchedule {
  schedule_interval: string;
  minimum_amount_cents: number;
  day_of_week?: number;
  day_of_month?: number;
}

export interface Transaction {
  id: string;
  entry_type: string;
  account_type: string;
  amount_cents: number;
  currency: string;
  category: string;
  reference_type: string;
  description?: string;
  created_at: string;
}

export interface TransactionSummary {
  gross_cents: number;
  platform_fee_cents: number;
  net_cents: number;
  payout_cents: number;
  refund_cents: number;
}

export interface PaymentListParams extends PaginationParams {
  status?: string;
  connected_account_id?: string;
  payment_type?: string;
}

export interface TransactionListParams extends PaginationParams {
  account_id?: string;
  category?: string;
  date_from?: string;
  date_to?: string;
}

export interface TransactionSummaryParams {
  account_id?: string;
  date_from?: string;
  date_to?: string;
}

// ============================================================================
// Connected Account Operation Types
// ============================================================================

export interface Product {
  id: string;
  connected_account_id: string;
  external_product_id: string;
  name: string;
  description?: string;
  active: boolean;
  created_at: string;
}

export interface Price {
  id: string;
  connected_account_id: string;
  product_id: string;
  external_price_id: string;
  unit_amount_cents: number;
  currency: string;
  recurring_interval?: string;
  active: boolean;
  created_at: string;
}

export interface ConnectedAccountSubscription {
  id: string;
  connected_account_id: string;
  price_id: string;
  external_subscription_id: string;
  external_account_id: string;
  status: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface Transfer {
  id: string;
  connected_account_id: string;
  payment_id?: string;
  amount_cents: number;
  currency: string;
  status: 'created' | 'processing' | 'succeeded' | 'failed' | 'needs_reconciliation';
  external_transfer_id?: string;
  idempotency_key: string;
  created_at: string;
}

export interface ConnectedSetupIntentResponse {
  client_secret: string;
  external_account_id: string;
}

export interface PaymentStatusResponse extends Payment {
  updated_at: string;
}

export interface ConnectedSubscriptionListParams extends PaginationParams {
  connected_account_id?: string;
}

// ============================================================================
// Billing Service
// ============================================================================

export class BillingService extends ServiceModule {
  protected basePath = '/v1/money/billing';

  private retiredSurface<T>(route: string): Promise<T> {
    return Promise.reject(
      new Error(
        `${route} was retired after the money-services cutover. Use the dedicated money services instead of BillingService for this operation.`
      )
    );
  }

  // --------------------------------------------------------------------------
  // Customers
  // --------------------------------------------------------------------------

  async createCustomer(
    data: { email: string; name?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Customer>> {
    return this.post<Customer>('/customers', data, options);
  }

  async addPaymentMethod(
    data: { type: string; token: string },
    options?: RequestOptions
  ): Promise<ApiResponse<PaymentMethod>> {
    return this.post<PaymentMethod>('/payment-methods', data, options);
  }

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  async subscribe(
    data: { customer_id: string; plan_id: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Subscription>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Subscription>>('/v1/money/billing/subscriptions');
  }

  async listSubscriptions(
    params?: PaginationParams,
    options?: RequestOptions
  ): Promise<PaginatedResponse<Subscription>> {
    void params;
    void options;
    return this.retiredSurface<PaginatedResponse<Subscription>>('/v1/money/billing/subscriptions');
  }

  async cancelSubscription(id: string, options?: RequestOptions): Promise<ApiResponse<Subscription>> {
    void options;
    return this.retiredSurface<ApiResponse<Subscription>>(`/v1/money/billing/subscriptions/${id}/cancel`);
  }

  async resumeSubscription(id: string, options?: RequestOptions): Promise<ApiResponse<Subscription>> {
    void options;
    return this.retiredSurface<ApiResponse<Subscription>>(`/v1/money/billing/subscriptions/${id}/resume`);
  }

  async upgradeSubscription(
    id: string,
    data: { plan_id: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Subscription>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Subscription>>(`/v1/money/billing/subscriptions/${id}/upgrade`);
  }

  // --------------------------------------------------------------------------
  // Usage
  // --------------------------------------------------------------------------

  async reportUsage(
    data: { metric: string; quantity: number },
    options?: RequestOptions
  ): Promise<ApiResponse<{ recorded: boolean }>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<{ recorded: boolean }>>('/v1/money/billing/usage');
  }

  async getUsageSummary(options?: RequestOptions): Promise<ApiResponse<UsageSummary[]>> {
    void options;
    return this.retiredSurface<ApiResponse<UsageSummary[]>>('/v1/money/billing/usage/summary');
  }

  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------

  async listInvoices(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Invoice>> {
    return this._list<Invoice>('/invoices', params, options);
  }

  async getInvoice(id: string, options?: RequestOptions): Promise<ApiResponse<Invoice>> {
    return this._get<Invoice>(`/invoices/${id}`, options);
  }

  async payInvoice(id: string, options?: RequestOptions): Promise<ApiResponse<Invoice>> {
    return this.post<Invoice>(`/invoices/${id}/pay`, undefined, options);
  }

  async getInvoicePdf(id: string, options?: RequestOptions): Promise<ApiResponse<{ url: string }>> {
    return this._get<{ url: string }>(`/invoices/${id}/pdf`, options);
  }

  // --------------------------------------------------------------------------
  // Connected Accounts (Marketplace)
  // --------------------------------------------------------------------------

  async createConnectedAccount(
    data: {
      email: string;
      country?: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<ConnectedAccount>> {
    return this.post<ConnectedAccount>('/connected-accounts', data, options);
  }

  async getConnectedAccount(id: string, options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>> {
    return this._get<ConnectedAccount>(`/connected-accounts/${id}`, options);
  }

  async getMyConnectedAccount(options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>> {
    return this._get<ConnectedAccount>('/connected-accounts/me', options);
  }

  async createOnboardingLink(
    id: string,
    data: { return_url: string; refresh_url: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ url: string }>> {
    return this.post<{ url: string }>(`/connected-accounts/${id}/onboarding-link`, data, options);
  }

  async getAccountBalance(id: string, options?: RequestOptions): Promise<ApiResponse<AccountBalance>> {
    void options;
    return this.retiredSurface<ApiResponse<AccountBalance>>(`/v1/money/billing/connected-accounts/${id}/balance`);
  }

  async createAccountSession(id: string, options?: RequestOptions): Promise<ApiResponse<{ client_secret: string }>> {
    return this.post<{ client_secret: string }>(`/connected-accounts/${id}/account-session`, undefined, options);
  }

  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------

  async getPublishableKey(options?: RequestOptions): Promise<ApiResponse<{ publishable_key: string }>> {
    return this._get<{ publishable_key: string }>('/config/publishable-key', options);
  }

  // --------------------------------------------------------------------------
  // Payments (Marketplace)
  // --------------------------------------------------------------------------

  async createPayment(
    data: {
      amount_cents: number;
      currency?: string;
      connected_account_id?: string;
      platform_fee_percent?: number;
      platform_fee_cents?: number;
      payment_type?: string;
      metadata?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<Payment>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Payment>>('/v1/money/billing/payments');
  }

  async getPayment(id: string, options?: RequestOptions): Promise<ApiResponse<Payment>> {
    void options;
    return this.retiredSurface<ApiResponse<Payment>>(`/v1/money/billing/payments/${id}`);
  }

  async listPayments(params?: PaymentListParams, options?: RequestOptions): Promise<PaginatedResponse<Payment>> {
    void params;
    void options;
    return this.retiredSurface<PaginatedResponse<Payment>>('/v1/money/billing/payments');
  }

  // --------------------------------------------------------------------------
  // Refunds
  // --------------------------------------------------------------------------

  async refundPayment(
    id: string,
    data?: { amount_cents?: number; reason?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Refund>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Refund>>(`/v1/money/billing/payments/${id}/refund`);
  }

  // --------------------------------------------------------------------------
  // Payouts
  // --------------------------------------------------------------------------

  async getPayoutHistory(
    accountId: string,
    params?: PaginationParams,
    options?: RequestOptions
  ): Promise<PaginatedResponse<Payout>> {
    void params;
    void options;
    return this.retiredSurface<PaginatedResponse<Payout>>(`/v1/money/billing/connected-accounts/${accountId}/payouts`);
  }

  async getPayoutSchedule(accountId: string, options?: RequestOptions): Promise<ApiResponse<PayoutSchedule>> {
    return this._get<PayoutSchedule>(`/connected-accounts/${accountId}/payout-schedule`, options);
  }

  async setPayoutSchedule(
    accountId: string,
    data: {
      schedule_interval: string;
      minimum_amount_cents?: number;
      day_of_week?: number;
      day_of_month?: number;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<PayoutSchedule>> {
    return this.put<PayoutSchedule>(`/connected-accounts/${accountId}/payout-schedule`, data, options);
  }

  // --------------------------------------------------------------------------
  // Ledger
  // --------------------------------------------------------------------------

  async getTransactions(
    params?: TransactionListParams,
    options?: RequestOptions
  ): Promise<PaginatedResponse<Transaction>> {
    void params;
    void options;
    return this.retiredSurface<PaginatedResponse<Transaction>>('/v1/money/billing/transactions');
  }

  async getTransactionSummary(
    params?: TransactionSummaryParams,
    options?: RequestOptions
  ): Promise<ApiResponse<TransactionSummary>> {
    void params;
    void options;
    return this.retiredSurface<ApiResponse<TransactionSummary>>('/v1/money/billing/transactions/summary');
  }

  // --------------------------------------------------------------------------
  // Setup Sessions
  // --------------------------------------------------------------------------

  async createSetupSession(
    data: {
      return_url: string;
      cancel_url: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<{ client_secret: string }>> {
    return this.post<{ client_secret: string }>('/setup-sessions', data, options);
  }

  // --------------------------------------------------------------------------
  // Connected Account Operations: Products, Prices, Subscriptions, Transfers
  // --------------------------------------------------------------------------

  async createProduct(
    data: {
      connected_account_id: string;
      name: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<Product>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Product>>('/v1/money/billing/products');
  }

  async createPrice(
    data: {
      connected_account_id: string;
      product_id: string;
      unit_amount_cents: number;
      currency?: string;
      recurring_interval?: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<Price>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Price>>('/v1/money/billing/prices');
  }

  async deactivatePrice(id: string, options?: RequestOptions): Promise<ApiResponse<Price>> {
    void options;
    return this.retiredSurface<ApiResponse<Price>>(`/v1/money/billing/prices/${id}/deactivate`);
  }

  async createConnectedSubscription(
    data: {
      connected_account_id: string;
      price_id: string;
      email: string;
      payment_method_id?: string;
      setup_intent_id?: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<ConnectedAccountSubscription>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<ConnectedAccountSubscription>>('/v1/money/billing/connected-subscriptions');
  }

  async cancelConnectedSubscription(
    id: string,
    data?: { at_period_end?: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<ConnectedAccountSubscription>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<ConnectedAccountSubscription>>(`/v1/money/billing/connected-subscriptions/${id}/cancel`);
  }

  async listConnectedSubscriptions(
    params?: ConnectedSubscriptionListParams,
    options?: RequestOptions
  ): Promise<PaginatedResponse<ConnectedAccountSubscription>> {
    void params;
    void options;
    return this.retiredSurface<PaginatedResponse<ConnectedAccountSubscription>>('/v1/money/billing/connected-subscriptions');
  }

  async createConnectedSetupIntent(
    data: {
      connected_account_id: string;
      return_url: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<ConnectedSetupIntentResponse>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<ConnectedSetupIntentResponse>>('/v1/money/billing/connected-setup-intents');
  }

  async createTransfer(
    data: {
      connected_account_id: string;
      amount_cents: number;
      currency?: string;
      payment_id?: string;
      idempotency_key: string;
      metadata?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<Transfer>> {
    void data;
    void options;
    return this.retiredSurface<ApiResponse<Transfer>>('/v1/money/billing/transfers');
  }

  async syncPaymentStatus(id: string, options?: RequestOptions): Promise<ApiResponse<PaymentStatusResponse>> {
    void options;
    return this.retiredSurface<ApiResponse<PaymentStatusResponse>>(`/v1/money/billing/payments/${id}/sync`);
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use subscribe() instead */
  async createSubscription(data: { customer_id: string; plan_id: string }) {
    return this.subscribe(data);
  }

  /** @deprecated Use listInvoices() instead */
  async getInvoices(params?: PaginationParams) {
    return this.listInvoices(params);
  }
}
