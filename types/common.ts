/**
 * Common type definitions used across the application
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface User {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
}

export interface Guild {
  id: string;
  name: string;
  icon?: string;
  memberCount?: number;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'category';
  guildId: string;
}
