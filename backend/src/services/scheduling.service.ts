import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { validateApprovalForPublishing } from './post.service';
import { publishPost } from './publishing.service';

const MIN_LEAD_TIME_MS = 60_000;
/** Keeps the approval alive slightly past the slot so the scheduler can still publish it. */
const APPROVAL_GRACE_MS = 60 * 60 * 1000;

const BLOCKING_REASONS: Record<string, string> = {
  NO_APPROVAL: 'Approve this post before scheduling it',
  UNAUTHORIZED: 'You are not authorized to schedule this post',
  ALREADY_CONSUMED: 'This post has already been published',
  EXPIRED: 'The approval has expired. Please re-approve before scheduling.',
  CONTENT_MODIFIED: 'The post was edited after approval. Please review and re-approve.',
  NO_CONTENT: 'The post has no content to schedule',
};

/**
 * Schedules an approved post. Scheduling is itself an explicit user action:
 * it reuses the existing version-bound approval, so unapproved or edited
 * content can never be scheduled.
 */
export async function schedulePost(postId: string, userId: string, scheduledAt: Date) {
  if (scheduledAt.getTime() < Date.now() + MIN_LEAD_TIME_MS) {
    throw Object.assign(new Error('Choose a time at least one minute in the future'), {
      code: 'INVALID_SCHEDULE_TIME',
    });
  }

  const post = await prisma.post.findFirst({ where: { id: postId, userId } });
  if (!post) {
    throw Object.assign(new Error('Post not found'), { code: 'NOT_FOUND' });
  }
  if (post.status !== 'APPROVED' && post.status !== 'SCHEDULED') {
    throw Object.assign(new Error('Only approved posts can be scheduled'), { code: 'INVALID_STATE' });
  }

  const validation = await validateApprovalForPublishing(postId, userId);
  if (!validation.valid || !validation.approval) {
    throw Object.assign(
      new Error(BLOCKING_REASONS[validation.reason ?? ''] ?? 'Approval is not valid'),
      { code: validation.reason ?? 'APPROVAL_INVALID' }
    );
  }

  const { approval } = validation;
  const requiredExpiry = new Date(scheduledAt.getTime() + APPROVAL_GRACE_MS);

  return prisma.$transaction(async (tx) => {
    // Status guard prevents scheduling a post that started publishing in the meantime.
    const updated = await tx.post.updateMany({
      where: { id: postId, userId, status: { in: ['APPROVED', 'SCHEDULED'] } },
      data: { status: 'SCHEDULED', scheduledAt },
    });
    if (updated.count === 0) {
      throw Object.assign(new Error('Post state changed. Please refresh and try again.'), {
        code: 'INVALID_STATE',
      });
    }

    if (approval.expiresAt < requiredExpiry) {
      await tx.approval.update({ where: { id: approval.id }, data: { expiresAt: requiredExpiry } });
    }

    await tx.activityLog.create({
      data: {
        userId,
        postId,
        action: 'post.scheduled',
        actor: userId,
        metadata: { scheduledAt: scheduledAt.toISOString(), approvalId: approval.id },
      },
    });

    return tx.post.findUniqueOrThrow({ where: { id: postId } });
  });
}

/**
 * Publishes every scheduled post whose time has come.
 * Each post is claimed atomically (SCHEDULED -> PUBLISHING) so overlapping ticks
 * or multiple server instances cannot publish the same post twice.
 */
export async function publishDueScheduledPosts(): Promise<void> {
  const due = await prisma.post.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    select: { id: true, userId: true },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
  });

  for (const { id, userId } of due) {
    const claimed = await prisma.post.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'PUBLISHING' },
    });
    if (claimed.count === 0) continue;

    // publishPost re-validates approval and content hash server-side.
    const result = await publishPost(id, userId);

    if (result.success) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'POST_PUBLISHED',
          title: 'Scheduled post published',
          data: { postId: id, platformUrl: result.platformUrl ?? null },
        },
      });
      continue;
    }

    logger.warn('Scheduled publish failed', { postId: id, code: result.errorCode });
    // Validation failures return before publishPost touches the status; don't leave it stuck.
    await prisma.post.updateMany({ where: { id, status: 'PUBLISHING' }, data: { status: 'FAILED' } });
    await prisma.notification.create({
      data: {
        userId,
        type: 'POST_FAILED',
        title: 'Scheduled post failed to publish',
        body: result.errorMessage ?? 'Publishing failed',
        data: { postId: id, errorCode: result.errorCode ?? null },
      },
    });
  }
}
