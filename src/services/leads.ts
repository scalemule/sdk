/**
 * Leads Service Module
 *
 * Sales lead capture — e.g. the "Contact us" form on a custom/enterprise plan.
 * Callable by a not-logged-in visitor (only the app's API key is required).
 *
 * Routes:
 *   POST /   → create a lead (tenant-scoped by the app credential)
 *
 * The leads table has native contact fields (name/email/phone) plus a free-form
 * `metadata` JSON. Enterprise-form extras (company, job title, employees,
 * country, message) and the plan context are placed into `metadata`.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export interface CreateLeadInput {
  /** Required. Full contact name (e.g. `${firstName} ${lastName}`). */
  contactName: string;
  /** Required. */
  contactEmail: string;
  contactPhone?: string;
  /** Defaults to 'sales_inquiry'. */
  serviceCategory?: string;
  /** Defaults to 'form'. */
  leadSource?: string;
  /** Free-text "how can sales help you?". Stored in metadata. */
  message?: string;
  company?: string;
  jobTitle?: string;
  employees?: string;
  country?: string;
  /** The plan the enquiry is about (custom/enterprise tier). */
  planId?: string;
  planName?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** Extra fields merged into the lead's metadata. */
  metadata?: Record<string, unknown>;
}

export interface Lead {
  id: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  service_category: string;
  lead_source: string;
  lead_status: string;
  created_at: string;
}

export class LeadsService extends ServiceModule {
  protected basePath = '/v1/leads';

  /**
   * Submit a sales lead. Enterprise-form extras and the plan context are folded
   * into `metadata` (the leads table has no native company/employees columns).
   */
  async create(input: CreateLeadInput, options?: RequestOptions): Promise<ApiResponse<Lead>> {
    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.company ? { company: input.company } : {}),
      ...(input.jobTitle ? { job_title: input.jobTitle } : {}),
      ...(input.employees ? { employees: input.employees } : {}),
      ...(input.country ? { country: input.country } : {}),
      ...(input.planId ? { plan_id: input.planId } : {}),
      ...(input.planName ? { plan_name: input.planName } : {})
    };
    const body: Record<string, unknown> = {
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      service_category: input.serviceCategory ?? 'sales_inquiry',
      lead_source: input.leadSource ?? 'form',
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      // Backend stores metadata as a JSON string (matches admin client shape).
      metadata: JSON.stringify(metadata)
    };
    return this.post<Lead>('', body, options);
  }
}
