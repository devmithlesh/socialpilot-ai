import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';
import * as postsController from '../controllers/posts.controller';
import * as telegramController from '../controllers/telegram.controller';

const router = Router();

// ─── Auth Routes ──────────────────────────────────────────────────────────────
router.post('/auth/register', ...authController.register);
router.post('/auth/login', ...authController.login);
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.me);
router.patch('/auth/profile', authenticate, ...authController.patchProfile);
router.post('/auth/change-password', authenticate, ...authController.postChangePassword);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard/stats', authenticate, postsController.getDashboardStats);

// ─── Posts ────────────────────────────────────────────────────────────────────
router.post('/posts', authenticate, ...postsController.createNewPost);
router.get('/posts', authenticate, ...postsController.getPosts);
router.get('/posts/:postId', authenticate, postsController.getPost);
router.patch('/posts/:postId/content', authenticate, ...postsController.updatePost);
router.post('/posts/:postId/approve', authenticate, ...postsController.approve);
router.post('/posts/:postId/publish', authenticate, postsController.publish);
router.post('/posts/:postId/schedule', authenticate, ...postsController.schedule);
router.post('/posts/generate-daily', authenticate, postsController.generateDaily);

// ─── AI Generation ────────────────────────────────────────────────────────────
router.post('/generate', authenticate, ...postsController.generateContent);
router.post('/generate-image', authenticate, ...postsController.generateImage);

// ─── Connected Accounts ───────────────────────────────────────────────────────
router.get('/accounts', authenticate, async (req, res) => {
  const { asyncHandler, sendSuccess } = await import('../utils/api.js');
  const { prisma } = await import('../config/database.js');

  return asyncHandler(async () => {
    const accounts = await prisma.connectedAccount.findMany({
      where: { userId: req.user!.userId, isActive: true },
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        platformUsername: true,
        platformDisplayName: true,
        platformAvatarUrl: true,
        scopes: true,
        tokenExpiresAt: true,
        connectedAt: true,
        lastUsedAt: true,
      },
    });
    sendSuccess(res, accounts);
  })(req, res, () => {});
});

// LinkedIn OAuth
router.get('/auth/linkedin', authenticate, async (req, res) => {
  const { linkedInService } = await import('../integrations/linkedin/linkedin.service.js');
  const { sendSuccess, sendError } = await import('../utils/api.js');
  const crypto = await import('crypto');

  if (!linkedInService.isConfigured) {
    sendError(res, 503, 'NOT_CONFIGURED', 'LinkedIn integration requires LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI environment variables.');
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  // In production, store state in session for CSRF validation
  const url = linkedInService.getAuthorizationUrl(state);
  sendSuccess(res, { url, state });
});

router.post('/auth/linkedin/callback', authenticate, async (req, res) => {
  const { linkedInService } = await import('../integrations/linkedin/linkedin.service.js');
  const { sendSuccess, sendError } = await import('../utils/api.js');
  const { prisma } = await import('../config/database.js');

  const { code } = req.body;
  if (!code) { sendError(res, 400, 'MISSING_CODE', 'Authorization code is required'); return; }

  try {
    const tokens = await linkedInService.exchangeCode(code);
    const profile = await linkedInService.getProfile(tokens.accessToken);
    const encrypted = linkedInService.encryptTokens(tokens);

    const account = await prisma.connectedAccount.upsert({
      where: { userId_platform_platformUserId: { userId: req.user!.userId, platform: 'LINKEDIN', platformUserId: profile.id } },
      update: {
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        tokenExpiresAt: encrypted.tokenExpiresAt,
        scopes: tokens.scope.split(' '),
        isActive: true,
        platformDisplayName: profile.name,
        platformAvatarUrl: profile.avatarUrl,
      },
      create: {
        userId: req.user!.userId,
        platform: 'LINKEDIN',
        platformUserId: profile.id,
        platformUsername: profile.email,
        platformDisplayName: profile.name,
        platformAvatarUrl: profile.avatarUrl,
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        tokenExpiresAt: encrypted.tokenExpiresAt,
        scopes: tokens.scope.split(' '),
      },
    });

    sendSuccess(res, { account: { id: account.id, platform: account.platform, displayName: account.platformDisplayName } });
  } catch (err) {
    const error = err as Error & { code?: string };
    sendError(res, 400, error.code ?? 'OAUTH_ERROR', error.message);
  }
});

// Instagram OAuth
router.get('/auth/instagram', authenticate, async (req, res) => {
  const { instagramService } = await import('../integrations/instagram/instagram.service.js');
  const { sendSuccess, sendError } = await import('../utils/api.js');
  const crypto = await import('crypto');

  if (!instagramService.isConfigured) {
    sendError(res, 503, 'NOT_CONFIGURED', 'Instagram integration requires INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI environment variables.');
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  const url = instagramService.getAuthorizationUrl(state);
  sendSuccess(res, { url, state });
});

router.post('/auth/instagram/callback', authenticate, async (req, res) => {
  const { instagramService } = await import('../integrations/instagram/instagram.service.js');
  const { sendSuccess, sendError } = await import('../utils/api.js');
  const { prisma } = await import('../config/database.js');

  const { code } = req.body;
  if (!code) { sendError(res, 400, 'MISSING_CODE', 'Authorization code is required'); return; }

  try {
    const { accessToken, userId: igUserId } = await instagramService.exchangeCode(code);
    const profile = await instagramService.getProfile(accessToken, igUserId);
    const encryptedToken = instagramService.encryptToken(accessToken);

    const account = await prisma.connectedAccount.upsert({
      where: { userId_platform_platformUserId: { userId: req.user!.userId, platform: 'INSTAGRAM', platformUserId: profile.id } },
      update: {
        encryptedAccessToken: encryptedToken,
        // Instagram long-lived tokens expire in ~60 days
        tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        isActive: true,
        platformDisplayName: profile.name,
        platformAvatarUrl: profile.avatarUrl,
        platformUsername: profile.username,
      },
      create: {
        userId: req.user!.userId,
        platform: 'INSTAGRAM',
        platformUserId: profile.id,
        platformUsername: profile.username,
        platformDisplayName: profile.name,
        platformAvatarUrl: profile.avatarUrl,
        encryptedAccessToken: encryptedToken,
        tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        scopes: ['instagram_basic', 'instagram_content_publish'],
      },
    });

    sendSuccess(res, { account: { id: account.id, platform: account.platform, displayName: account.platformDisplayName } });
  } catch (err) {
    const error = err as Error & { code?: string };
    sendError(res, 400, error.code ?? 'OAUTH_ERROR', error.message);
  }
});

// Disconnect account
router.delete('/accounts/:accountId', authenticate, async (req, res) => {
  const { asyncHandler, sendSuccess, sendError } = await import('../utils/api.js');
  const { prisma } = await import('../config/database.js');

  return asyncHandler(async () => {
    const account = await prisma.connectedAccount.findFirst({
      where: { id: req.params.accountId as string, userId: req.user!.userId },
    });

    if (!account) {
      sendError(res, 404, 'NOT_FOUND', 'Account not found');
      return;
    }

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { isActive: false },
    });

    sendSuccess(res, { message: 'Account disconnected' });
  })(req, res, () => {});
});

// Telegram review / approve (Approve publishes to the post's platform, usually LinkedIn)
router.get('/telegram/status', authenticate, telegramController.getStatus);
router.post('/telegram/connect', authenticate, telegramController.createConnectLink);
router.delete('/telegram/connect', authenticate, telegramController.disconnect);
router.post('/telegram/webhook', telegramController.webhook);

// Notifications
router.get('/notifications', authenticate, async (req, res) => {
  const { asyncHandler, sendSuccess } = await import('../utils/api.js');
  const { prisma } = await import('../config/database.js');

  return asyncHandler(async () => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    sendSuccess(res, notifications);
  })(req, res, () => {});
});

router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  const { asyncHandler, sendSuccess } = await import('../utils/api.js');
  const { prisma } = await import('../config/database.js');

  return asyncHandler(async () => {
    await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: { isRead: true, readAt: new Date() },
    });
    sendSuccess(res, { message: 'Notification marked as read' });
  })(req, res, () => {});
});

// Health check (unauthenticated)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
