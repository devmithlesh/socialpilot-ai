import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { geminiService } from '../integrations/gemini/gemini.service';
import { createPost } from './post.service';

const RECENT_POSTS_TO_AVOID = 10;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Generates one LinkedIn draft for the user and places it in the approval queue.
 *
 * The draft is never approved or published here: the user must still review it,
 * approve it, and confirm publishing (or scheduling) themselves.
 *
 * @param force When false (scheduled job) a user gets at most one daily draft per day.
 *              When true (manual button) a draft is generated regardless.
 * @returns The created post id, or null when a draft already exists for today.
 */
export async function generateDailyDraft(
  userId: string,
  { force }: { force: boolean }
): Promise<string | null> {
  if (!geminiService.isAvailable) {
    throw Object.assign(new Error('AI generation is not configured (GEMINI_API_KEY).'), {
      code: 'AI_NOT_CONFIGURED',
    });
  }

  const account = await prisma.connectedAccount.findFirst({
    where: { userId, platform: 'LINKEDIN', isActive: true },
    orderBy: { connectedAt: 'asc' },
  });
  if (!account) {
    throw Object.assign(new Error('Connect a LinkedIn account before generating daily posts.'), {
      code: 'NO_LINKEDIN_ACCOUNT',
    });
  }

  if (!force) {
    const alreadyGenerated = await prisma.activityLog.findFirst({
      where: { userId, action: 'post.daily_generated', createdAt: { gte: startOfToday() } },
      select: { id: true },
    });
    if (alreadyGenerated) return null;
  }

  const [brand, recentVersions] = await Promise.all([
    prisma.brandSettings.findUnique({ where: { userId } }),
    prisma.postVersion.findMany({
      where: { isLatest: true, post: { userId } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_POSTS_TO_AVOID,
      select: { caption: true },
    }),
  ]);

  const focus = brand?.keywords.length
    ? brand.keywords.join(', ')
    : brand?.brandName || brand?.targetAudience || 'practical professional growth';
  const recentOpeners = recentVersions.map((v) => `- ${v.caption.slice(0, 80).replace(/\s+/g, ' ')}`);

  const { content, durationMs } = await geminiService.generateContent({
    platform: 'LINKEDIN',
    operation: 'generate',
    topic: `Choose ONE fresh, specific, useful topic related to: ${focus}`,
    instructions: recentOpeners.length
      ? `Do not repeat or closely resemble these recent posts:\n${recentOpeners.join('\n')}`
      : undefined,
    brandVoice: brand?.brandVoice ?? undefined,
    targetAudience: brand?.targetAudience ?? undefined,
    brandGuidelines: brand?.guidelines ?? undefined,
    tone: brand?.tonePreferences[0],
    keywords: brand?.keywords,
  });

  const post = await createPost(
    userId,
    { platform: 'LINKEDIN', connectedAccountId: account.id },
    {
      caption: content.caption,
      hashtags: content.hashtags,
      callToAction: content.callToAction ?? undefined,
      imageAltText: content.imageAltText ?? undefined,
    }
  );

  await prisma.$transaction([
    prisma.post.update({ where: { id: post.id }, data: { status: 'PENDING_APPROVAL' } }),
    prisma.generationHistory.create({
      data: {
        postId: post.id,
        model: 'gemini',
        prompt: { source: 'daily', focus },
        response: content,
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
        title: 'Your daily post draft is ready',
        body: 'Review and approve it before it can be published.',
        data: { postId: post.id },
      },
    }),
  ]);

  logger.info('Daily draft generated', { userId, postId: post.id });
  return post.id;
}

/** Generates a draft for every user who enabled daily posts. One user's failure never blocks others. */
export async function generateDailyDraftsForOptedInUsers(): Promise<void> {
  const optedIn = await prisma.brandSettings.findMany({
    where: { dailyPostEnabled: true },
    select: { userId: true },
  });

  for (const { userId } of optedIn) {
    try {
      await generateDailyDraft(userId, { force: false });
    } catch (err) {
      logger.warn('Daily draft skipped', { userId, error: (err as Error).message });
    }
  }
}
