import { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError, asyncHandler, validateBody, validateQuery } from '../utils/api';
import { prisma } from '../config/database';
import { geminiService, GenerationRequest } from '../integrations/gemini/gemini.service';
import {
  createPost,
  updatePostContent,
  approvePost,
  createPostSchema,
  postVersionSchema,
} from '../services/post.service';
import { publishPost } from '../services/publishing.service';
import { schedulePost } from '../services/scheduling.service';
import { generateDailyDraft } from '../services/daily-post.service';

const generateContentSchema = z.object({
  postId: z.string().optional(), // If provided, saves to existing post; otherwise creates draft
  topic: z.string().trim().default(''), // May be empty when the post is driven by an uploaded image or instructions
  instructions: z.string().optional(),
  platform: z.enum(['LINKEDIN', 'INSTAGRAM']),
  targetAudience: z.string().optional(),
  brandVoice: z.string().optional(),
  tone: z.string().optional(),
  objective: z.string().optional(),
  language: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  hashtagPreferences: z.string().optional(),
  ctaPreferences: z.string().optional(),
  contentLength: z.enum(['short', 'medium', 'long']).optional(),
  brandGuidelines: z.string().optional(),
  existingContent: z.string().optional(),
  operation: z.enum([
    'generate', 'regenerate', 'improve', 'shorten', 'lengthen',
    'change_tone', 'improve_hook', 'generate_hooks', 'generate_hashtags',
    'improve_cta', 'rewrite_linkedin', 'rewrite_instagram', 'generate_variations',
  ]).optional(),
  connectedAccountId: z.string().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
  withImage: z.boolean().optional(),
  // Keeps the post's current image when only the text is being regenerated/improved
  existingImageUrl: z.string().startsWith('data:image/').optional(),
});

const approvePostSchema = z.object({
  connectedAccountId: z.string().min(1),
});

const postsQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED']).optional(),
  platform: z.enum(['LINKEDIN', 'INSTAGRAM']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ─── Generate Content ─────────────────────────────────────────────────────────

export const generateContent = [
  validateBody(generateContentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!geminiService.isAvailable) {
      sendError(res, 503, 'AI_NOT_CONFIGURED', 'AI generation is not available. Configure GEMINI_API_KEY to enable this feature.');
      return;
    }

    const userId = req.user!.userId;
    const { postId, connectedAccountId, withImage, ...generationParams } = req.body;

    const { content, durationMs } = await geminiService.generateContent(
      generationParams as GenerationRequest
    );

    // Optionally create a matching image. A failure here must not lose the generated text.
    let imageWarning: string | undefined;
    if (withImage && !content.imageUrl) {
      try {
        const image = await geminiService.generateImage({
          caption: content.caption,
          topic: generationParams.topic,
          platform: generationParams.platform,
        });
        content.imageUrl = image.dataUrl;
        content.imageAltText = image.altText;
      } catch (imageErr) {
        imageWarning = (imageErr as Error).message;
      }
    }

    // Save as draft (always — never auto-publish)
    let savedPostId = postId;

    const versionData = {
      caption: content.caption,
      hashtags: content.hashtags,
      callToAction: content.callToAction ?? undefined,
      imageUrl: content.imageUrl ?? undefined,
      imageAltText: content.imageAltText ?? undefined,
    };

    if (postId) {
      try {
        // Add new version to existing post
        await updatePostContent(postId, userId, versionData);
      } catch (updateErr: any) {
        if (updateErr.code === 'NOT_FOUND') {
          const post = await createPost(
            userId,
            { platform: generationParams.platform, connectedAccountId },
            versionData
          );
          savedPostId = post.id;
        } else {
          throw updateErr;
        }
      }
    } else {
      // Create new post with first draft
      const post = await createPost(
        userId,
        { platform: generationParams.platform, connectedAccountId },
        versionData
      );
      savedPostId = post.id;
    }

    // Record generation history safely
    try {
      await prisma.generationHistory.create({
        data: {
          postId: savedPostId,
          model: 'gemini',
          prompt: generationParams,
          response: { ...content, imageUrl: content.imageUrl ? '[image omitted]' : null } as any,
          durationMs,
          wasSuccessful: true,
        },
      });
    } catch {
      // Non-fatal if history logging fails
    }

    sendSuccess(res, { content, postId: savedPostId, durationMs, imageWarning });
  }),
];

// ─── Generate Image ───────────────────────────────────────────────────────────

const generateImageSchema = z.object({
  caption: z.string().trim().min(1).max(5000),
  topic: z.string().trim().max(1000).optional(),
  platform: z.enum(['LINKEDIN', 'INSTAGRAM']),
  style: z.string().trim().max(300).optional(),
});

/** Generates an image for the given caption. Stateless: the client keeps it in the editor until saved. */
export const generateImage = [
  validateBody(generateImageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!geminiService.isAvailable) {
      sendError(res, 503, 'AI_NOT_CONFIGURED', 'AI generation is not available. Configure GEMINI_API_KEY to enable this feature.');
      return;
    }
    try {
      const image = await geminiService.generateImage(req.body);
      sendSuccess(res, { imageUrl: image.dataUrl, imageAltText: image.altText, durationMs: image.durationMs });
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'IMAGE_GENERATION_FAILED') {
        sendError(res, 502, error.code, error.message);
      } else {
        throw err;
      }
    }
  }),
];

// ─── Create Post ──────────────────────────────────────────────────────────────

export const createNewPost = [
  validateBody(z.object({
    post: createPostSchema,
    content: postVersionSchema,
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const post = await createPost(req.user!.userId, req.body.post, req.body.content);
    sendSuccess(res, post, 201);
  }),
];

// ─── Get Posts ────────────────────────────────────────────────────────────────

export const getPosts = [
  validateQuery(postsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = (req as Request & { validatedQuery: z.infer<typeof postsQuerySchema> }).validatedQuery;
    const userId = req.user!.userId;

    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.from || query.to ? {
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      } : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          versions: { where: { isLatest: true } },
          approval: { select: { approvedAt: true, expiresAt: true, isConsumed: true } },
          connectedAccount: {
            select: { platformUsername: true, platformDisplayName: true, platform: true, platformAvatarUrl: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.post.count({ where }),
    ]);

    sendSuccess(res, posts, 200, {
      page: query.page,
      limit: query.limit,
      total,
    });
  }),
];

// ─── Get Single Post ──────────────────────────────────────────────────────────

export const getPost = asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findFirst({
    where: { id: req.params.postId as string, userId: req.user!.userId },
    include: {
      versions: { orderBy: { version: 'desc' } },
      approval: true,
      // Never return the (encrypted) OAuth tokens to the browser
      connectedAccount: {
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          platformUsername: true,
          platformDisplayName: true,
          platformAvatarUrl: true,
          isActive: true,
        },
      },
      publishingAttempts: { orderBy: { attemptedAt: 'desc' } },
      generationHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!post) {
    sendError(res, 404, 'NOT_FOUND', 'Post not found');
    return;
  }

  sendSuccess(res, post);
});

// ─── Update Post Content ──────────────────────────────────────────────────────

export const updatePost = [
  validateBody(postVersionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const version = await updatePostContent(req.params.postId as string, req.user!.userId, req.body);
      sendSuccess(res, version);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'NOT_FOUND') sendError(res, 404, 'NOT_FOUND', error.message);
      else if (error.code === 'INVALID_STATE') sendError(res, 409, 'INVALID_STATE', error.message);
      else throw err;
    }
  }),
];

// ─── Approve Post ─────────────────────────────────────────────────────────────

export const approve = [
  validateBody(approvePostSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const approval = await approvePost(
        req.params.postId as string,
        req.user!.userId,
        req.body.connectedAccountId
      );
      sendSuccess(res, approval);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'NOT_FOUND') sendError(res, 404, 'NOT_FOUND', error.message);
      else if (error.code === 'NO_CONTENT') sendError(res, 422, 'NO_CONTENT', error.message);
      else if (error.code === 'ACCOUNT_NOT_FOUND') sendError(res, 404, 'ACCOUNT_NOT_FOUND', error.message);
      else if (error.code === 'PLATFORM_MISMATCH') sendError(res, 422, 'PLATFORM_MISMATCH', error.message);
      else throw err;
    }
  }),
];

// ─── Publish Post ─────────────────────────────────────────────────────────────

export const publish = asyncHandler(async (req: Request, res: Response) => {
  const result = await publishPost(req.params.postId as string, req.user!.userId);

  if (result.success) {
    sendSuccess(res, result);
  } else {
    const httpStatus =
      result.errorCode === 'DUPLICATE_PREVENTED' ? 409
      : result.errorCode?.includes('EXPIRED') ? 410
      : 422;

    sendError(res, httpStatus, result.errorCode ?? 'PUBLISH_FAILED', result.errorMessage ?? 'Publishing failed');
  }
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const [
    drafts,
    pendingApproval,
    published,
    failed,
    scheduled,
    recentPosts,
    connectedAccounts,
  ] = await Promise.all([
    prisma.post.count({ where: { userId, status: 'DRAFT' } }),
    prisma.post.count({ where: { userId, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } } }),
    prisma.post.count({ where: { userId, status: 'PUBLISHED' } }),
    prisma.post.count({ where: { userId, status: 'FAILED' } }),
    prisma.post.count({ where: { userId, status: 'SCHEDULED' } }),
    prisma.post.findMany({
      where: { userId },
      include: { versions: { where: { isLatest: true } }, connectedAccount: { select: { platform: true, platformUsername: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.connectedAccount.findMany({
      where: { userId, isActive: true },
      select: { platform: true, platformUsername: true, platformDisplayName: true, platformAvatarUrl: true },
    }),
  ]);

  sendSuccess(res, {
    stats: { drafts, pendingApproval, published, failed, scheduled },
    recentPosts,
    connectedAccounts,
  });
});

// ─── Schedule Post ────────────────────────────────────────────────────────────

const SCHEDULE_ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  INVALID_SCHEDULE_TIME: 422,
  NO_APPROVAL: 409,
  UNAUTHORIZED: 403,
  ALREADY_CONSUMED: 409,
  EXPIRED: 410,
  CONTENT_MODIFIED: 409,
  NO_CONTENT: 422,
};

export const schedule = [
  validateBody(z.object({ scheduledAt: z.string().datetime() })),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const post = await schedulePost(
        req.params.postId as string,
        req.user!.userId,
        new Date(req.body.scheduledAt)
      );
      sendSuccess(res, post);
    } catch (err) {
      const error = err as Error & { code?: string };
      const status = error.code ? SCHEDULE_ERROR_STATUS[error.code] : undefined;
      if (!status) throw err;
      sendError(res, status, error.code!, error.message);
    }
  }),
];

// ─── Daily Draft ──────────────────────────────────────────────────────────────

export const generateDaily = asyncHandler(async (req: Request, res: Response) => {
  try {
    const postId = await generateDailyDraft(req.user!.userId, { force: true });
    sendSuccess(res, {
      postId,
      message: 'Daily draft generated. Review and approve it in the queue below.',
    });
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'AI_NOT_CONFIGURED') sendError(res, 503, error.code, error.message);
    else if (error.code === 'NO_LINKEDIN_ACCOUNT') sendError(res, 422, error.code, error.message);
    else throw err;
  }
});
