import { Request, Response } from 'express';
import { z } from 'zod';
import {
  registerUser,
  loginUser,
  logoutUser,
  registerSchema,
  loginSchema,
  updateProfile,
  changePassword,
  updateProfileSchema,
  changePasswordSchema,
} from '../services/auth.service';
import { sendSuccess, sendError, asyncHandler, validateBody } from '../utils/api';

export const register = [
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await registerUser(
      req.body,
      req.ip,
      req.headers['user-agent']
    );
    sendSuccess(res, result, 201);
  }),
];

export const login = [
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await loginUser(req.body, req.ip, req.headers['user-agent']);

      // Set secure cookie for browser clients
      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      sendSuccess(res, result);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'INVALID_CREDENTIALS') {
        sendError(res, 401, 'INVALID_CREDENTIALS', error.message);
      } else {
        throw err;
      }
    }
  }),
];

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.sessionId) {
    await logoutUser(req.user.sessionId);
  }
  res.clearCookie('auth_token');
  sendSuccess(res, { message: 'Logged out successfully' });
});

export const patchProfile = [
  validateBody(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await updateProfile(req.user!.userId, req.body);
    sendSuccess(res, user);
  }),
];

export const postChangePassword = [
  validateBody(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await changePassword(req.user!.userId, req.user!.sessionId, req.body);
      sendSuccess(res, { message: 'Password updated. Other devices have been signed out.' });
    } catch (err) {
      const error = err as Error & { code?: string };
      const statusByCode: Record<string, number> = {
        INVALID_CREDENTIALS: 400,
        SAME_PASSWORD: 400,
        NO_PASSWORD: 400,
      };
      const status = error.code ? statusByCode[error.code] : undefined;
      if (status && error.code) {
        sendError(res, status, error.code, error.message);
      } else {
        throw err;
      }
    }
  }),
];

export const me = asyncHandler(async (req: Request, res: Response) => {
  const { prisma } = await import('../config/database');
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      timezone: true,
      createdAt: true,
      preferences: true,
    },
  });

  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'User not found');
    return;
  }

  sendSuccess(res, user);
});
