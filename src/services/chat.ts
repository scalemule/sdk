/**
 * Chat Service Module
 *
 * Conversations, messages, typing indicators, read receipts, reactions.
 *
 * Routes:
 *   POST   /conversations                           → create conversation
 *   GET    /conversations                            → list conversations
 *   GET    /conversations/{id}                       → get conversation
 *   POST   /conversations/{id}/participants          → add participant
 *   DELETE /conversations/{id}/participants/{userId} → remove participant
 *   POST   /conversations/{id}/messages              → send message
 *   GET    /conversations/{id}/messages              → get messages
 *   PATCH  /messages/{id}                            → edit message
 *   DELETE /messages/{id}                            → delete message
 *   POST   /messages/{id}/reactions                  → add reaction
 *   POST   /conversations/{id}/typing                → send typing indicator
 *   POST   /conversations/{id}/read                  → mark as read
 *   GET    /conversations/{id}/read-status            → get read status
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Participant {
  user_id: string;
  role: string;
  joined_at: string;
}

export interface Conversation {
  id: string;
  conversation_type: 'direct' | 'group';
  name?: string;
  created_by?: string;
  participant_count: number;
  last_message_at?: string;
  unread_count?: number;
  created_at: string;
  updated_at?: string;
  participants?: Participant[];
}

export interface Attachment {
  file_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system';
  sender_id: string;
  sender_type: string;
  sender_agent_model?: string;
  attachments?: Attachment[];
  is_edited: boolean;
  created_at: string;
  thread_id?: string;
  reply_count?: number;
  latest_reply_at?: string;
  reply_user_ids?: string[];
  is_thread_broadcast?: boolean;
}

export interface ReadStatus {
  user_id: string;
  last_read_at?: string;
}

export interface ChatReaction {
  emoji: string;
  user_id: string;
  message_id: string;
  created_at: string;
}

// ============================================================================
// Chat Service
// ============================================================================

export class ChatService extends ServiceModule {
  protected basePath = '/v1/chat';

  // --------------------------------------------------------------------------
  // Conversations
  // --------------------------------------------------------------------------

  async createConversation(
    data: { name?: string; participant_ids: string[] },
    options?: RequestOptions
  ): Promise<ApiResponse<Conversation>> {
    return this.post<Conversation>('/conversations', data, options);
  }

  async listConversations(
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Conversation>> {
    return this._list<Conversation>('/conversations', params, requestOptions);
  }

  async getConversation(id: string, options?: RequestOptions): Promise<ApiResponse<Conversation>> {
    return this._get<Conversation>(`/conversations/${id}`, options);
  }

  async addParticipant(
    conversationId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ added: boolean }>> {
    return this.post<{ added: boolean }>(`/conversations/${conversationId}/participants`, { user_id: userId }, options);
  }

  async removeParticipant(
    conversationId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ removed: boolean }>> {
    return this.del<{ removed: boolean }>(`/conversations/${conversationId}/participants/${userId}`, options);
  }

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------

  async sendMessage(
    conversationId: string,
    data: { content: string; type?: string; thread_id?: string; is_thread_broadcast?: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<ChatMessage>> {
    return this.post<ChatMessage>(`/conversations/${conversationId}/messages`, data, options);
  }

  async getThreadReplies(
    messageId: string,
    params?: { limit?: number; before?: string; after?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<ChatMessage[]>> {
    return this._get<ChatMessage[]>(
      this.withQuery(`/messages/${messageId}/replies`, params),
      requestOptions
    );
  }

  async getMessages(
    conversationId: string,
    options?: { limit?: number; before?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<ChatMessage[]>> {
    return this._get<ChatMessage[]>(
      this.withQuery(`/conversations/${conversationId}/messages`, options),
      requestOptions
    );
  }

  async editMessage(
    messageId: string,
    data: { content: string },
    options?: RequestOptions
  ): Promise<ApiResponse<ChatMessage>> {
    return this.patch<ChatMessage>(`/messages/${messageId}`, data, options);
  }

  async deleteMessage(messageId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/messages/${messageId}`, options);
  }

  async addReaction(
    messageId: string,
    data: { emoji: string },
    options?: RequestOptions
  ): Promise<ApiResponse<ChatReaction>> {
    return this.post<ChatReaction>(`/messages/${messageId}/reactions`, data, options);
  }

  // --------------------------------------------------------------------------
  // Typing & Read Receipts
  // --------------------------------------------------------------------------

  async sendTyping(conversationId: string, options?: RequestOptions): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>(`/conversations/${conversationId}/typing`, undefined, options);
  }

  async markRead(conversationId: string, options?: RequestOptions): Promise<ApiResponse<{ marked: boolean }>> {
    return this.post<{ marked: boolean }>(`/conversations/${conversationId}/read`, undefined, options);
  }

  async getReadStatus(conversationId: string, options?: RequestOptions): Promise<ApiResponse<ReadStatus[]>> {
    return this._get<ReadStatus[]>(`/conversations/${conversationId}/read-status`, options);
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use createConversation() instead */
  async createChat(data: { participant_ids: string[]; name?: string }) {
    return this.createConversation(data);
  }
}
