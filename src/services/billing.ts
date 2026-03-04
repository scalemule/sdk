/**
 * Billing Service Module
 *
 * Customers, subscriptions, usage, invoices, marketplace payments, payouts.
 *
 * Routes:
 *   POST   /customers                    → create customer
 *   POST   /payment-methods              → add payment method
 *   POST   /subscriptions                → create subscription
 *   GET    /subscriptions                 → list subscriptions
 *   POST   /subscriptions/{id}/cancel     → cancel subscription
 *   POST   /subscriptions/{id}/resume     → resume subscription
 *   PATCH  /subscriptions/{id}/upgrade    → upgrade plan
 *   POST   /usage                         → report usage
 *   GET    /usage/summary                 → usage summary
 *   GET    /invoices                       → list invoices
 *   GET    /invoices/{id}                  → get invoice
 *   POST   /invoices/{id}/pay              → pay invoice
 *   GET    /invoices/{id}/pdf              → invoice PDF
 *   POST   /connected-accounts             → create connected account
 *   GET    /connected-accounts/me          → get own connected account
 *   GET    /connected-accounts/{id}        → get connected account
 *   POST   /connected-accounts/{id}/onboarding-link → create onboarding link
 *   GET    /connected-accounts/{id}/balance → get account balance
 *   POST   /connected-accounts/{id}/account-session → create account session (embedded onboarding)
 *   POST   /payments                       → create payment
 *   GET    /payments                       → list payments
 *   GET    /payments/{id}                  → get payment
 *   POST   /payments/{id}/refund           → refund payment
 *   GET    /connected-accounts/{id}/payouts → payout history
 *   GET    /connected-accounts/{id}/payout-schedule → get payout schedule
 *   PUT    /connected-accounts/{id}/payout-schedule → set payout schedule
 *   GET    /transactions                   → ledger transactions
 *   GET    /transactions/summary           → transaction summary
 *   POST   /setup-sessions                 → create setup session
 */

import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

// ============================================================================
// Core Billing Types
// ============================================================================

export interface Customer {
  id: string
  stripe_customer_id?: string
  email: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface Subscription {
  id: string
  customer_id: string
  stripe_subscription_id?: string
  plan_id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface Invoice {
  id: string
  customer_id: string
  stripe_invoice_id?: string
  amount_due: number
  amount_paid: number
  currency: string
  status: string
  due_date?: string
  paid_at?: string
  created_at: string
}

export interface UsageSummary {
  customer_id: string
  event_type: string
  total_quantity: number
  total_cost: number
  event_count: number
}

export interface PaymentMethod {
  id: string
  customer_id: string
  stripe_payment_method_id?: string
  type: string
  last4?: string
  brand?: string
  exp_month?: number
  exp_year?: number
  is_default: boolean
  created_at: string
}

// ============================================================================
// Marketplace Types
// ============================================================================

export interface ConnectedAccount {
  id: string
  email: string
  country: string
  status: 'pending' | 'onboarding' | 'active' | 'restricted' | 'disabled'
  charges_enabled: boolean
  payouts_enabled: boolean
  onboarding_complete: boolean
  details_submitted: boolean
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AccountBalance {
  currency: string
  available_cents: number
  pending_cents: number
  reserved_cents: number
}

export interface Payment {
  id: string
  customer_id: string
  connected_account_id?: string
  amount_cents: number
  currency: string
  platform_fee_cents: number
  provider_fee_cents: number
  creator_net_cents: number
  status: string
  payment_type?: string
  client_secret?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface Refund {
  id: string
  payment_id: string
  amount_cents: number
  platform_fee_reversal_cents: number
  reason?: string
  status: string
  created_at: string
}

export interface Payout {
  id: string
  amount_cents: number
  currency: string
  status: string
  arrival_date?: string
  created_at: string
}

export interface PayoutSchedule {
  schedule_interval: string
  minimum_amount_cents: number
  day_of_week?: number
  day_of_month?: number
}

export interface Transaction {
  id: string
  entry_type: string
  account_type: string
  amount_cents: number
  currency: string
  category: string
  reference_type: string
  description?: string
  created_at: string
}

export interface TransactionSummary {
  gross_cents: number
  platform_fee_cents: number
  net_cents: number
  payout_cents: number
  refund_cents: number
}

export interface PaymentListParams extends PaginationParams {
  status?: string
  connected_account_id?: string
  payment_type?: string
}

export interface TransactionListParams extends PaginationParams {
  account_id?: string
  category?: string
  date_from?: string
  date_to?: string
}

export interface TransactionSummaryParams {
  account_id?: string
  date_from?: string
  date_to?: string
}

// ============================================================================
// Connected Account Operation Types
// ============================================================================

export interface Product {
  id: string
  connected_account_id: string
  external_product_id: string
  name: string
  description?: string
  active: boolean
  created_at: string
}

export interface Price {
  id: string
  connected_account_id: string
  product_id: string
  external_price_id: string
  unit_amount_cents: number
  currency: string
  recurring_interval?: string
  active: boolean
  created_at: string
}

export interface ConnectedAccountSubscription {
  id: string
  connected_account_id: string
  price_id: string
  external_subscription_id: string
  external_account_id: string
  status: string
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end: boolean
  created_at: string
}

export interface Transfer {
  id: string
  connected_account_id: string
  payment_id?: string
  amount_cents: number
  currency: string
  status: 'created' | 'processing' | 'succeeded' | 'failed' | 'needs_reconciliation'
  external_transfer_id?: string
  idempotency_key: string
  created_at: string
}

export interface ConnectedSetupIntentResponse {
  client_secret: string
  external_account_id: string
}

export interface PaymentStatusResponse extends Payment {
  updated_at: string
}

export interface ConnectedSubscriptionListParams extends PaginationParams {
  connected_account_id?: string
}

// ============================================================================
// Billing Service
// ============================================================================

export class BillingService extends ServiceModule {
  protected basePath = '/v1/billing'

  // --------------------------------------------------------------------------
  // Customers
  // --------------------------------------------------------------------------

  async createCustomer(data: { email: string; name?: string }, options?: RequestOptions): Promise<ApiResponse<Customer>> {
    return this.post<Customer>('/customers', data, options)
  }

  async addPaymentMethod(data: { type: string; token: string }, options?: RequestOptions): Promise<ApiResponse<PaymentMethod>> {
    return this.post<PaymentMethod>('/payment-methods', data, options)
  }

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  async subscribe(data: { customer_id: string; plan_id: string }, options?: RequestOptions): Promise<ApiResponse<Subscription>> {
    return this.post<Subscription>('/subscriptions', data, options)
  }

  async listSubscriptions(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Subscription>> {
    return this._list<Subscription>('/subscriptions', params, options)
  }

  async cancelSubscription(id: string, options?: RequestOptions): Promise<ApiResponse<Subscription>> {
    return this.post<Subscription>(`/subscriptions/${id}/cancel`, undefined, options)
  }

  async resumeSubscription(id: string, options?: RequestOptions): Promise<ApiResponse<Subscription>> {
    return this.post<Subscription>(`/subscriptions/${id}/resume`, undefined, options)
  }

  async upgradeSubscription(id: string, data: { plan_id: string }, options?: RequestOptions): Promise<ApiResponse<Subscription>> {
    return this.patch<Subscription>(`/subscriptions/${id}/upgrade`, data, options)
  }

  // --------------------------------------------------------------------------
  // Usage
  // --------------------------------------------------------------------------

  async reportUsage(data: { metric: string; quantity: number }, options?: RequestOptions): Promise<ApiResponse<{ recorded: boolean }>> {
    return this.post<{ recorded: boolean }>('/usage', data, options)
  }

  async getUsageSummary(options?: RequestOptions): Promise<ApiResponse<UsageSummary[]>> {
    return this._get<UsageSummary[]>('/usage/summary', options)
  }

  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------

  async listInvoices(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Invoice>> {
    return this._list<Invoice>('/invoices', params, options)
  }

  async getInvoice(id: string, options?: RequestOptions): Promise<ApiResponse<Invoice>> {
    return this._get<Invoice>(`/invoices/${id}`, options)
  }

  async payInvoice(id: string, options?: RequestOptions): Promise<ApiResponse<Invoice>> {
    return this.post<Invoice>(`/invoices/${id}/pay`, undefined, options)
  }

  async getInvoicePdf(id: string, options?: RequestOptions): Promise<ApiResponse<{ url: string }>> {
    return this._get<{ url: string }>(`/invoices/${id}/pdf`, options)
  }

  // --------------------------------------------------------------------------
  // Connected Accounts (Marketplace)
  // --------------------------------------------------------------------------

  async createConnectedAccount(data: {
    email: string
    country?: string
  }, options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>> {
    return this.post<ConnectedAccount>('/connected-accounts', data, options)
  }

  async getConnectedAccount(id: string, options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>> {
    return this._get<ConnectedAccount>(`/connected-accounts/${id}`, options)
  }

  async getMyConnectedAccount(options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>> {
    return this._get<ConnectedAccount>('/connected-accounts/me', options)
  }

  async createOnboardingLink(
    id: string,
    data: { return_url: string; refresh_url: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ url: string }>> {
    return this.post<{ url: string }>(`/connected-accounts/${id}/onboarding-link`, data, options)
  }

  async getAccountBalance(id: string, options?: RequestOptions): Promise<ApiResponse<AccountBalance>> {
    return this._get<AccountBalance>(`/connected-accounts/${id}/balance`, options)
  }

  async createAccountSession(id: string, options?: RequestOptions): Promise<ApiResponse<{ client_secret: string }>> {
    return this.post<{ client_secret: string }>(`/connected-accounts/${id}/account-session`, undefined, options)
  }

  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------

  async getPublishableKey(options?: RequestOptions): Promise<ApiResponse<{ publishable_key: string }>> {
    return this._get<{ publishable_key: string }>('/config/publishable-key', options)
  }

  // --------------------------------------------------------------------------
  // Payments (Marketplace)
  // --------------------------------------------------------------------------

  async createPayment(data: {
    amount_cents: number
    currency?: string
    connected_account_id?: string
    platform_fee_percent?: number
    platform_fee_cents?: number
    payment_type?: string
    metadata?: Record<string, unknown>
  }, options?: RequestOptions): Promise<ApiResponse<Payment>> {
    return this.post<Payment>('/payments', data, options)
  }

  async getPayment(id: string, options?: RequestOptions): Promise<ApiResponse<Payment>> {
    return this._get<Payment>(`/payments/${id}`, options)
  }

  async listPayments(params?: PaymentListParams, options?: RequestOptions): Promise<PaginatedResponse<Payment>> {
    return this._list<Payment>('/payments', params as Record<string, unknown>, options)
  }

  // --------------------------------------------------------------------------
  // Refunds
  // --------------------------------------------------------------------------

  async refundPayment(
    id: string,
    data?: { amount_cents?: number; reason?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Refund>> {
    return this.post<Refund>(`/payments/${id}/refund`, data, options)
  }

  // --------------------------------------------------------------------------
  // Payouts
  // --------------------------------------------------------------------------

  async getPayoutHistory(accountId: string, params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Payout>> {
    return this._list<Payout>(`/connected-accounts/${accountId}/payouts`, params, options)
  }

  async getPayoutSchedule(accountId: string, options?: RequestOptions): Promise<ApiResponse<PayoutSchedule>> {
    return this._get<PayoutSchedule>(`/connected-accounts/${accountId}/payout-schedule`, options)
  }

  async setPayoutSchedule(
    accountId: string,
    data: {
      schedule_interval: string
      minimum_amount_cents?: number
      day_of_week?: number
      day_of_month?: number
    },
    options?: RequestOptions
  ): Promise<ApiResponse<PayoutSchedule>> {
    return this.put<PayoutSchedule>(`/connected-accounts/${accountId}/payout-schedule`, data, options)
  }

  // --------------------------------------------------------------------------
  // Ledger
  // --------------------------------------------------------------------------

  async getTransactions(params?: TransactionListParams, options?: RequestOptions): Promise<PaginatedResponse<Transaction>> {
    return this._list<Transaction>('/transactions', params as Record<string, unknown>, options)
  }

  async getTransactionSummary(params?: TransactionSummaryParams, options?: RequestOptions): Promise<ApiResponse<TransactionSummary>> {
    return this._get<TransactionSummary>(this.withQuery('/transactions/summary', params as Record<string, unknown>), options)
  }

  // --------------------------------------------------------------------------
  // Setup Sessions
  // --------------------------------------------------------------------------

  async createSetupSession(data: {
    return_url: string
    cancel_url: string
  }, options?: RequestOptions): Promise<ApiResponse<{ client_secret: string }>> {
    return this.post<{ client_secret: string }>('/setup-sessions', data, options)
  }

  // --------------------------------------------------------------------------
  // Connected Account Operations: Products, Prices, Subscriptions, Transfers
  // --------------------------------------------------------------------------

  async createProduct(data: {
    connected_account_id: string
    name: string
    description?: string
    metadata?: Record<string, unknown>
  }, options?: RequestOptions): Promise<ApiResponse<Product>> {
    return this.post<Product>('/products', data, options)
  }

  async createPrice(data: {
    connected_account_id: string
    product_id: string
    unit_amount_cents: number
    currency?: string
    recurring_interval?: string
  }, options?: RequestOptions): Promise<ApiResponse<Price>> {
    return this.post<Price>('/prices', data, options)
  }

  async deactivatePrice(id: string, options?: RequestOptions): Promise<ApiResponse<Price>> {
    return this.post<Price>(`/prices/${id}/deactivate`, undefined, options)
  }

  async createConnectedSubscription(data: {
    connected_account_id: string
    price_id: string
    email: string
    payment_method_id?: string
    setup_intent_id?: string
  }, options?: RequestOptions): Promise<ApiResponse<ConnectedAccountSubscription>> {
    return this.post<ConnectedAccountSubscription>('/connected-subscriptions', data, options)
  }

  async cancelConnectedSubscription(
    id: string,
    data?: { at_period_end?: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<ConnectedAccountSubscription>> {
    return this.post<ConnectedAccountSubscription>(`/connected-subscriptions/${id}/cancel`, data, options)
  }

  async listConnectedSubscriptions(
    params?: ConnectedSubscriptionListParams,
    options?: RequestOptions
  ): Promise<PaginatedResponse<ConnectedAccountSubscription>> {
    return this._list<ConnectedAccountSubscription>('/connected-subscriptions', params as Record<string, unknown>, options)
  }

  async createConnectedSetupIntent(data: {
    connected_account_id: string
    return_url: string
  }, options?: RequestOptions): Promise<ApiResponse<ConnectedSetupIntentResponse>> {
    return this.post<ConnectedSetupIntentResponse>('/connected-setup-intents', data, options)
  }

  async createTransfer(data: {
    connected_account_id: string
    amount_cents: number
    currency?: string
    payment_id?: string
    idempotency_key: string
    metadata?: Record<string, unknown>
  }, options?: RequestOptions): Promise<ApiResponse<Transfer>> {
    return this.post<Transfer>('/transfers', data, options)
  }

  async syncPaymentStatus(id: string, options?: RequestOptions): Promise<ApiResponse<PaymentStatusResponse>> {
    return this.post<PaymentStatusResponse>(`/payments/${id}/sync`, undefined, options)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use subscribe() instead */
  async createSubscription(data: { customer_id: string; plan_id: string }) {
    return this.subscribe(data)
  }

  /** @deprecated Use listInvoices() instead */
  async getInvoices(params?: PaginationParams) {
    return this.listInvoices(params)
  }
}
