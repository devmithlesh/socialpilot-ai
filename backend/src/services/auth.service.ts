import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { logger } from '../config/logger';
import type { JwtPayload } from '../middleware/auth';

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  timezone: z.string().refine(isValidTimezone, 'Invalid timezone'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    timezone: string;
  };
}

/**
 * Registers a new user and creates a session.
 */
export async function registerUser(
  input: RegisterInput,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw Object.assign(new Error('Email is already registered'), { code: 'EMAIL_TAKEN' });
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      preferences: { create: {} },
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      timezone: true,
    },
  });

  logger.info('User registered', { userId: user.id });

  return createSessionAndToken(user, ipAddress, userAgent);
}

/**
 * Authenticates existing credentials and creates a new session.
 */
export async function loginUser(
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      timezone: true,
      passwordHash: true,
    },
  });

  // Use constant-time comparison even when user doesn't exist to prevent timing attacks
  const dummyHash = '$2a$12$invalidhashfortimingresilience.invalid';
  const passwordMatch = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? dummyHash
  );

  if (!user || !passwordMatch) {
    throw Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logger.info('User logged in', { userId: user.id });

  return createSessionAndToken(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      timezone: user.timezone,
    },
    ipAddress,
    userAgent
  );
}

/**
 * Updates the display name and timezone of the signed-in user.
 */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: input.name, timezone: input.timezone },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      timezone: true,
      createdAt: true,
    },
  });
}

/**
 * Changes the password after verifying the current one, and revokes every
 * other session so a stolen token cannot outlive the password change.
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) {
    throw Object.assign(new Error('This account has no password set'), { code: 'NO_PASSWORD' });
  }

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw Object.assign(new Error('Current password is incorrect'), { code: 'INVALID_CREDENTIALS' });
  }

  if (input.currentPassword === input.newPassword) {
    throw Object.assign(new Error('New password must be different from the current one'), {
      code: 'SAME_PASSWORD',
    });
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId, id: { not: currentSessionId } } }),
  ]);

  logger.info('Password changed', { userId });
}

/**
 * Revokes all active sessions for a user (full logout).
 */
export async function logoutUser(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } });
}

/**
 * Creates a new database session and signs a JWT.
 * Internal — callers do not need to construct sessions directly.
 */
async function createSessionAndToken(
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null | undefined;
    role: string;
    timezone: string;
  },
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResult> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const token = jwt.sign(
    { userId: user.id, sessionId, email: user.email } satisfies JwtPayload,
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role,
      timezone: user.timezone,
    },
  };
}
