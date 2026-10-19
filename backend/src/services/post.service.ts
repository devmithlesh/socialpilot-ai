import { z } from 'zod';
import { prisma } from '../config/database';
import { hashContent } from '../utils/crypto';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { Prisma, type SocialPlatform, type PostStatus } from '@prisma/client';

export const createPostSchema = z.object({
  platform: z.enum(['LINKEDIN', 'INSTAGRAM']),
  connectedAccountId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
});

export const postVersionSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()),
  callToAction: z.string().optional(),
  imageUrl: z.string().optional(),
  imageAltText: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type PostVersionInput = z.infer<typeof postVersionSchema>;

/**
 * Creates a new post draft with an initial version.
 */
export async function createPost(
  userId: string,
  input: CreatePostInput,
  versionContent: PostVersionInput
) {
  const contentHash = hashContent({
    caption: versionContent.caption,
    hashtags: versionContent.hashtags,
    callToAction: versionContent.callToAction ?? null,
    imageUrl: versionContent.imageUrl ?? null,
  });

  const post = await prisma.post.create({
    data: {
      userId,
      platform: input.platform as SocialPlatform,
      connectedAccountId: input.connectedAccountId,
      status: 'DRAFT',
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      timezone: input.timezone,
      versions: {
        create: {
          version: 1,
          caption: versionContent.caption,
          hashtags: versionContent.hashtags,
          callToAction: versionContent.callToAction,
          imageUrl: versionContent.imageUrl,
          imageAltText: versionContent.imageAltText,
          metadata: versionContent.metadata ? (versionContent.metadata as Prisma.InputJsonValue) : undefined,
          contentHash,
          isLatest: true,
        },
      },
    },
    include: {
      versions: { where: { isLatest: true } },
    },
  });

  logger.info('Post created', { postId: post.id, userId });
  return post;
}

/**
 * Updates a post's content by creating a new version.
 * Editing content automatically invalidates any existing approval.
 */
export async function updatePostContent(
  postId: string,
  userId: string,
  versionContent: PostVersionInput
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
    include: {
      versions: { where: { isLatest: true } },
      approval: true,
    },
  });

  if (!post) {
    throw Object.assign(new Error('Post not found'), { code: 'NOT_FOUND' });
  }

  if (['PUBLISHED', 'PUBLISHING'].includes(post.status)) {
    throw Object.assign(new Error('Cannot edit a post that is being published or already published'), {
      code: 'INVALID_STATE',
    });
  }

  const latestVersion = post.versions[0];
  const newVersionNumber = (latestVersion?.version ?? 0) + 1;

  const contentHash = hashContent({
    caption: versionContent.caption,
    hashtags: versionContent.hashtags,
    callToAction: versionContent.callToAction ?? null,
    imageUrl: versionContent.imageUrl ?? null,
  });

  // Check if content actually changed
  const contentChanged = latestVersion?.contentHash !== contentHash;

  return prisma.$transaction(async (tx) => {
    // Mark previous version as not latest
    if (latestVersion) {
      await tx.postVersion.update({
        where: { id: latestVersion.id },
        data: { isLatest: false },
      });
    }

    // Create new version
    const newVersion = await tx.postVersion.create({
      data: {
        postId,
        version: newVersionNumber,
        caption: versionContent.caption,
        hashtags: versionContent.hashtags,
        callToAction: versionContent.callToAction,
        imageUrl: versionContent.imageUrl,
        imageAltText: versionContent.imageAltText,
        metadata: versionContent.metadata ? (versionContent.metadata as Prisma.InputJsonValue) : undefined,
        contentHash,
        isLatest: true,
      },
    });

    // If content changed, invalidate any existing approval
    // This is a critical business rule — approvals are version-bound
    if (contentChanged && post.approval) {
      await tx.approval.delete({ where: { postId } });
      logger.info('Approval invalidated due to content change', { postId });
    }

    // An approved or scheduled post whose content changed must be re-approved,
    // and a scheduled post loses its slot so it cannot publish unapproved content.
    const wasApprovedOrScheduled = post.status === 'APPROVED' || post.status === 'SCHEDULED';
    const needsReapproval = contentChanged && wasApprovedOrScheduled;
    const newStatus: PostStatus = needsReapproval ? 'PENDING_APPROVAL' : post.status;

    await tx.post.update({
      where: { id: postId },
      data: { status: newStatus, ...(needsReapproval ? { scheduledAt: null } : {}) },
    });

    logger.info('Post version created', { postId, version: newVersionNumber, contentChanged });
    return newVersion;
  });
}

/**
 * Records user approval of a specific post version.
 * Binds the approval to the exact content hash at time of approval.
 */
export async function approvePost(
  postId: string,
  userId: string,
  connectedAccountId: string
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
    include: {
      versions: { where: { isLatest: true } },
      connectedAccount: true,
    },
  });

  if (!post) {
    throw Object.assign(new Error('Post not found'), { code: 'NOT_FOUND' });
  }

  const latestVersion = post.versions[0];
  if (!latestVersion) {
    throw Object.assign(new Error('Post has no content to approve'), { code: 'NO_CONTENT' });
  }

  // Verify the connected account belongs to the user
  const account = await prisma.connectedAccount.findFirst({
    where: { id: connectedAccountId, userId, isActive: true },
  });

  if (!account) {
    throw Object.assign(new Error('Connected account not found or not active'), {
      code: 'ACCOUNT_NOT_FOUND',
    });
  }

  if (account.platform !== post.platform) {
    throw Object.assign(new Error('Account platform does not match post platform'), {
      code: 'PLATFORM_MISMATCH',
    });
  }

  const approvalExpiresAt = new Date(
    Date.now() + config.APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000
  );

  // Batch transaction: statements run atomically in order without an interactive
  // session, so a slow database connection cannot expire it mid-flight.
  const [, approval] = await prisma.$transaction([
    // Remove any existing approval for this post
    prisma.approval.deleteMany({ where: { postId } }),
    prisma.approval.create({
      data: {
        postId,
        userId,
        postVersionId: latestVersion.id,
        approvedContentHash: latestVersion.contentHash,
        approvedCaption: latestVersion.caption,
        approvedHashtags: latestVersion.hashtags,
        approvedCallToAction: latestVersion.callToAction,
        approvedImageUrl: latestVersion.imageUrl,
        platform: post.platform,
        connectedAccountId,
        expiresAt: approvalExpiresAt,
      },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { status: 'APPROVED', connectedAccountId },
    }),
  ]);

  logger.info('Post approved', {
    postId,
    userId,
    versionId: latestVersion.id,
    contentHash: latestVersion.contentHash,
  });

  return approval;
}

/**
 * Validates that an approval is still valid before publishing.
 * This runs on the server immediately before any publish attempt.
 * Returns null if the approval is invalid or expired.
 */
export async function validateApprovalForPublishing(postId: string, userId: string) {
  const approval = await prisma.approval.findUnique({
    where: { postId },
    include: {
      post: {
        include: { versions: { where: { isLatest: true } } },
      },
    },
  });

  if (!approval) return { valid: false, reason: 'NO_APPROVAL' };
  if (approval.userId !== userId) return { valid: false, reason: 'UNAUTHORIZED' };
  if (approval.isConsumed) return { valid: false, reason: 'ALREADY_CONSUMED' };
  if (approval.expiresAt < new Date()) return { valid: false, reason: 'EXPIRED' };

  const currentVersion = approval.post.versions[0];
  if (!currentVersion) return { valid: false, reason: 'NO_CONTENT' };

  // Critical check: content hash must match exactly
  if (currentVersion.contentHash !== approval.approvedContentHash) {
    return { valid: false, reason: 'CONTENT_MODIFIED' };
  }

  return { valid: true, approval };
}
