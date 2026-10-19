import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { validateApprovalForPublishing } from './post.service';
import { linkedInService } from '../integrations/linkedin/linkedin.service';
import { instagramService } from '../integrations/instagram/instagram.service';
import type { SocialPlatform } from '@prisma/client';

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  attemptId: string;
}

/**
 * Core publishing service.
 *
 * Security model:
 * 1. Re-validates approval server-side (not trusted from client)
 * 2. Verifies content hash matches approved version
 * 3. Uses idempotency key to prevent duplicate publishes
 * 4. Marks approval as consumed after successful publish
 * 5. Records full audit trail including request/response payloads
 */
export async function publishPost(
  postId: string,
  userId: string
): Promise<PublishResult> {
  // Step 1: Server-side approval validation
  const validation = await validateApprovalForPublishing(postId, userId);

  if (!validation.valid || !validation.approval) {
    const reasonMessages: Record<string, string> = {
      NO_APPROVAL: 'This post has not been approved for publishing',
      UNAUTHORIZED: 'You are not authorized to publish this post',
      ALREADY_CONSUMED: 'This approval has already been used. The post may have been published.',
      EXPIRED: 'The approval has expired. Please re-approve before publishing.',
      CONTENT_MODIFIED: 'The post content was modified after approval. Please review and re-approve.',
      NO_CONTENT: 'The post has no content to publish',
    };

    return {
      success: false,
      errorCode: validation.reason ?? 'APPROVAL_INVALID',
      errorMessage: reasonMessages[validation.reason ?? ''] ?? 'Approval is not valid',
      attemptId: '',
    };
  }

  const { approval } = validation;

  // Step 2: Fetch connected account
  const account = await prisma.connectedAccount.findFirst({
    where: {
      id: approval.connectedAccountId,
      userId,
      isActive: true,
    },
  });

  if (!account) {
    return {
      success: false,
      errorCode: 'ACCOUNT_NOT_FOUND',
      errorMessage: 'The connected account is no longer active. Please reconnect.',
      attemptId: '',
    };
  }

  // Step 3: Idempotency key — prevents duplicate publishes on retry
  const idempotencyKey = `publish:${postId}:${approval.id}`;

  // Check if this exact publish was already attempted
  const existingAttempt = await prisma.publishingAttempt.findUnique({
    where: { idempotencyKey },
  });

  if (existingAttempt?.status === 'SUCCESS') {
    logger.warn('Duplicate publish prevented', { postId, idempotencyKey });
    return {
      success: false,
      errorCode: 'DUPLICATE_PREVENTED',
      errorMessage: 'This post has already been published',
      attemptId: existingAttempt.id,
      platformPostId: existingAttempt.platformPostId ?? undefined,
      platformUrl: existingAttempt.platformUrl ?? undefined,
    };
  }

  // Step 4: Set post to PUBLISHING status
  await prisma.post.update({
    where: { id: postId },
    data: { status: 'PUBLISHING' },
  });

  // Step 5: Create publishing attempt record
  const attempt = await prisma.publishingAttempt.create({
    data: {
      postId,
      connectedAccountId: account.id,
      idempotencyKey,
      status: 'PENDING',
      requestPayload: {
        platform: account.platform,
        caption: approval.approvedCaption,
        hashtags: approval.approvedHashtags,
        callToAction: approval.approvedCallToAction,
        imageUrl: approval.approvedImageUrl,
      },
    },
  });

  try {
    // Step 6: Delegate to platform-specific publisher
    let result: { platformPostId: string; platformUrl: string };

    if (account.platform === 'LINKEDIN') {
      result = await linkedInService.publishPost(
        account.encryptedAccessToken,
        account.platformUserId,
        approval.approvedCaption,
        approval.approvedHashtags,
        approval.approvedImageUrl
          ? {
              dataUrl: approval.approvedImageUrl,
              altText: approval.post.versions[0]?.imageAltText,
            }
          : undefined
      );
    } else if (account.platform === 'INSTAGRAM') {
      if (!approval.approvedImageUrl) {
        throw Object.assign(
          new Error('Instagram posts require an image. Please add an image and re-approve.'),
          { code: 'IMAGE_REQUIRED' }
        );
      }
      result = await instagramService.publishImagePost(
        account.encryptedAccessToken,
        account.platformUserId,
        approval.approvedCaption,
        approval.approvedHashtags,
        approval.approvedImageUrl
      );
    } else {
      throw new Error(`Unsupported platform: ${account.platform as SocialPlatform}`);
    }

    // Step 7: Mark approval consumed and update post status
    await prisma.$transaction([
      prisma.approval.update({
        where: { id: approval.id },
        data: { isConsumed: true, consumedAt: new Date() },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
      prisma.publishingAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCESS',
          platformPostId: result.platformPostId,
          platformUrl: result.platformUrl,
          completedAt: new Date(),
          responsePayload: result,
        },
      }),
      prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastUsedAt: new Date() },
      }),
    ]);

    logger.info('Post published successfully', {
      postId,
      platform: account.platform,
      platformPostId: result.platformPostId,
    });

    return {
      success: true,
      platformPostId: result.platformPostId,
      platformUrl: result.platformUrl,
      attemptId: attempt.id,
    };
  } catch (err) {
    const error = err as Error & { code?: string };

    logger.error('Publishing failed', {
      postId,
      platform: account.platform,
      error: error.message,
      code: error.code,
    });

    await prisma.$transaction([
      prisma.post.update({
        where: { id: postId },
        data: { status: 'FAILED' },
      }),
      prisma.publishingAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          errorCode: error.code ?? 'UNKNOWN_ERROR',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      }),
    ]);

    return {
      success: false,
      errorCode: error.code ?? 'PUBLISH_FAILED',
      errorMessage: error.message,
      attemptId: attempt.id,
    };
  }
}
