import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { openaiService } from '../integrations/openai/openai.service';
import { createPost } from './post.service';
type PublishPlatform = 'LINKEDIN' | 'INSTAGRAM';

const RECENT_POSTS_TO_AVOID = 10;
const MAX_DAYS = 7;

const DAY_ANGLES = [
  'beginner overview: explain the idea so a newcomer understands it',
  'one practical tip they can use today',
  'a common mistake and how to avoid it',
  'a simple step-by-step they can follow',
  'a real example or tool that makes it clearer',
  'myth vs reality about this topic',
  'a short checklist to remember',
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseScheduledTimes(scheduledTimes?: string[]): Date[] {
  const times = (scheduledTimes ?? [])
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (times.length === 0) return [new Date()];
  return times.slice(0, MAX_DAYS);
}

export interface DailyDraftInput {
  force: boolean;
  topic?: string;
  platforms?: Array<'LINKEDIN' | 'INSTAGRAM'>;
  withImage?: boolean;
  scheduledTimes?: string[];
}

/**
 * Generates draft posts and places them in the approval queue.
 * The drafts are never approved or published here.
 */
export async function generateDailyDraft(
  userId: string,
  { force, topic, platforms, withImage = true, scheduledTimes }: DailyDraftInput
): Promise<string[]> {
  if (!openaiService.isAvailable) {
    throw Object.assign(new Error('AI generation is not configured (OPENAI_API_KEY).'), {
      code: 'AI_NOT_CONFIGURED',
    });
  }

  const selectedPlatforms: PublishPlatform[] = platforms?.length ? platforms : ['LINKEDIN'];

  if (!force) {
    const alreadyGenerated = await prisma.activityLog.findFirst({
      where: { userId, action: 'post.daily_generated', createdAt: { gte: startOfToday() } },
      select: { id: true },
    });
    if (alreadyGenerated) return [];
  }

  const focus = topic?.trim();
  if (!focus) {
    throw Object.assign(new Error('Enter what the post should be about'), { code: 'TOPIC_REQUIRED' });
  }

  const recentVersions = await prisma.postVersion.findMany({
    where: { isLatest: true, post: { userId } },
    orderBy: { createdAt: 'desc' },
    take: RECENT_POSTS_TO_AVOID,
    select: { caption: true },
  });
  const recentOpeners = recentVersions.map((v) => `- ${v.caption.slice(0, 80).replace(/\s+/g, ' ')}`);
  const generatedTopic = recentOpeners.length
    ? `${focus}. Do not repeat these recent posts:\n${recentOpeners.join('\n')}`
    : focus;

  const times = parseScheduledTimes(scheduledTimes);
  const postIds: string[] = [];

  for (let dayIndex = 0; dayIndex < times.length; dayIndex++) {
    const plannedAt = times[dayIndex];
    const angle = DAY_ANGLES[dayIndex % DAY_ANGLES.length];
    const dayLabel = plannedAt.toISOString().slice(0, 10);
    const dayTopic = `${generatedTopic}. This is post ${dayIndex + 1} of ${times.length} for ${dayLabel}. Angle: ${angle}. Keep the caption exactly two short lines.`;

    let sharedImageUrl: string | undefined;
    let sharedImageAlt: string | undefined;

    for (const platform of selectedPlatforms) {
      const account = await prisma.connectedAccount.findFirst({
        where: { userId, platform, isActive: true },
        orderBy: { connectedAt: 'asc' },
      });

      const { content, durationMs, model } = await openaiService.generateContent({
        platform,
        topic: dayTopic,
      });

      if (withImage) {
        if (sharedImageUrl) {
          content.imageUrl = sharedImageUrl;
          content.imageAltText = sharedImageAlt;
        } else {
          try {
            const image = await openaiService.generateImage({
              caption: content.caption,
              topic: `${focus}. ${angle}`,
              platform,
            });
            content.imageUrl = image.dataUrl;
            content.imageAltText = image.altText;
            sharedImageUrl = image.dataUrl;
            sharedImageAlt = image.altText;
          } catch (err) {
            logger.warn('Daily draft image skipped', { platform, error: (err as Error).message });
          }
        }
      }

      const post = await createPost(
        userId,
        {
          platform,
          connectedAccountId: account?.id,
          scheduledAt: plannedAt.toISOString(),
        },
        {
          caption: content.caption,
          hashtags: content.hashtags,
          callToAction: content.callToAction ?? undefined,
          imageUrl: content.imageUrl ?? undefined,
          imageAltText: content.imageAltText ?? undefined,
        }
      );

      await prisma.$transaction([
        prisma.post.update({ where: { id: post.id }, data: { status: 'PENDING_APPROVAL' } }),
        prisma.generationHistory.create({
          data: {
            postId: post.id,
            model,
            prompt: { source: 'daily', focus, platform, plannedAt: plannedAt.toISOString(), dayIndex },
            response: { ...content, imageUrl: content.imageUrl ? '[image omitted]' : null },
            durationMs,
            wasSuccessful: true,
          },
        }),
        prisma.activityLog.create({
          data: { userId, postId: post.id, action: 'post.daily_generated', actor: 'system' },
        }),
        prisma.notification.create({
          data: {
            userId,
            type: 'APPROVAL_REQUIRED',
            title: times.length > 1 ? `Draft ready for ${dayLabel}` : 'Your post draft is ready',
            body: 'Review and approve it before it can be published.',
            data: { postId: post.id },
          },
        }),
      ]);

      logger.info('Daily draft generated', { userId, postId: post.id, platform, plannedAt });
      postIds.push(post.id);
    }
  }

  return postIds;
}
