// ─── Shared domain types used across frontend ─────────────────────────────────

export type SocialPlatform = 'LINKEDIN' | 'INSTAGRAM';

export type PostStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  timezone: string;
  createdAt: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  language: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  approvalReminderHours: number;
}

export interface ConnectedAccount {
  id: string;
  platform: SocialPlatform;
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string;
  platformAvatarUrl: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
}

export interface PostVersion {
  id: string;
  postId: string;
  version: number;
  caption: string;
  hashtags: string[];
  callToAction: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  metadata?: Record<string, unknown> | null;
  contentHash: string;
  isLatest: boolean;
  createdAt: string;
}

export interface PostApproval {
  id: string;
  approvedAt: string;
  expiresAt: string;
  isConsumed: boolean;
}

export interface PublishingAttempt {
  id: string;
  postId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  errorMessage?: string | null;
  platformPostId?: string | null;
  platformUrl?: string | null;
  attemptedAt: string;
}

export interface Post {
  id: string;
  userId: string;
  platform: SocialPlatform;
  connectedAccountId: string | null;
  status: PostStatus;
  scheduledAt: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  versions: PostVersion[];
  approval: PostApproval | null;
  connectedAccount: {
    platform: SocialPlatform;
    platformUsername: string;
    platformDisplayName: string;
    platformAvatarUrl: string | null;
  } | null;
  publishingAttempts?: PublishingAttempt[];
}

export interface GeneratedContent {
  caption: string;
  hashtags: string[];
  callToAction?: string;
  imageAltText?: string;
  imageUrl?: string;
}

export interface GenerationRequest {
  postId?: string;
  topic: string;
  platform: SocialPlatform;
  existingContent?: string;
  operation?: string;
  connectedAccountId?: string;
  withImage?: boolean;
  existingImageUrl?: string;
}

export interface DashboardStats {
  stats: {
    drafts: number;
    pendingApproval: number;
    published: number;
    failed: number;
    scheduled: number;
  };
  recentPosts: Post[];
  connectedAccounts: Pick<ConnectedAccount, 'platform' | 'platformUsername' | 'platformDisplayName' | 'platformAvatarUrl'>[];
}

export interface BrandSettings {
  id: string;
  brandName: string | null;
  brandVoice: string | null;
  targetAudience: string | null;
  tonePreferences: string[];
  keywords: string[];
  preferredHashtags: string[];
  guidelines: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  dailyPostEnabled: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data?: { postId?: string } | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
