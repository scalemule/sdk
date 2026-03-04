/**
 * Events Service Module
 *
 * Event management: CRUD, registration, attendees, check-in.
 *
 * Routes:
 *   POST   /                  → create event
 *   GET    /{id}              → get event
 *   PATCH  /{id}              → update event
 *   DELETE /{id}              → delete event
 *   GET    /                  → list events
 *   POST   /{id}/register     → register for event
 *   DELETE /{id}/register     → unregister
 *   GET    /{id}/attendees    → list attendees
 *   POST   /{id}/check-in     → check in
 */

import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface CalendarEvent {
  id: string
  title: string
  description: string
  start_date: string
  end_date?: string
  location?: string
  capacity?: number
  attendee_count?: number
  status: string
  created_at: string
  updated_at: string
}

export interface Attendee {
  user_id: string
  event_id: string
  status: string
  checked_in_at?: string
  registered_at: string
}

// ============================================================================
// Events Service
// ============================================================================

export class EventsService extends ServiceModule {
  protected basePath = '/v1/events'

  async create(data: { title: string; description: string; start_date: string; end_date?: string }, options?: RequestOptions): Promise<ApiResponse<CalendarEvent>> {
    return this.post<CalendarEvent>('', data, options)
  }

  async get(eventId: string, options?: RequestOptions): Promise<ApiResponse<CalendarEvent>> {
    return this._get<CalendarEvent>(`/${eventId}`, options)
  }

  async update(eventId: string, data: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<CalendarEvent>> {
    return this.patch<CalendarEvent>(`/${eventId}`, data, options)
  }

  async delete(eventId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${eventId}`, options)
  }

  async list(filters?: PaginationParams & Record<string, unknown>, requestOptions?: RequestOptions): Promise<PaginatedResponse<CalendarEvent>> {
    return this._list<CalendarEvent>('', filters, requestOptions)
  }

  async register(eventId: string, options?: RequestOptions): Promise<ApiResponse<Attendee>> {
    return this.post<Attendee>(`/${eventId}/register`, undefined, options)
  }

  async unregister(eventId: string, options?: RequestOptions): Promise<ApiResponse<{ unregistered: boolean }>> {
    return this.del<{ unregistered: boolean }>(`/${eventId}/register`, options)
  }

  async getAttendees(eventId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Attendee>> {
    return this._list<Attendee>(`/${eventId}/attendees`, params, requestOptions)
  }

  async checkIn(eventId: string, options?: RequestOptions): Promise<ApiResponse<Attendee>> {
    return this.post<Attendee>(`/${eventId}/check-in`, undefined, options)
  }

  /** @deprecated Use create() instead */
  async createEvent(data: { title: string; description: string; start_date: string; end_date: string }) {
    return this.create(data)
  }

  /** @deprecated Use list() instead */
  async listEvents(filters?: PaginationParams & Record<string, unknown>) {
    return this.list(filters)
  }
}
