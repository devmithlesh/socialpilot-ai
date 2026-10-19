import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { sendError } from '../utils/api';

export interface JwtPayload {
  userId: string;
  sessionId: string;
  email: string;
}

// Extend Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Authentication middleware.
 * Validates the JWT from the Authorization header or session cookie.
 * Verifies the session still exists in the database (allows server-side revocation).
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenFromCookie = req.cookies?.auth_token as string | undefined;
  const token = tokenFromHeader ?? tokenFromCookie;

  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  try {
    // Pin the algorithm so a token signed with a different/"none" algorithm is rejected
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;

    // Verify session exists, belongs to the token's user, and has not been revoked or expired
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.userId !== payload.userId || session.expiresAt < new Date()) {
      sendError(res, 401, 'SESSION_EXPIRED', 'Session has expired. Please log in again.');
      return;
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      sendError(res, 401, 'TOKEN_EXPIRED', 'Token has expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      sendError(res, 401, 'INVALID_TOKEN', 'Invalid authentication token');
    } else {
      next(err);
    }
  }
}