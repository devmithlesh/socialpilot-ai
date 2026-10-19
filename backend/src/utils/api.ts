import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../config/logger';

/**
 * Standard API response envelope.
 * All endpoints must use this format for consistency.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: ApiResponse['meta']): void {
  res.status(status).json({ success: true, data, meta });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void {
  res.status(status).json({ success: false, error: { code, message, details } });
}

/**
 * Middleware factory that validates req.body against a Zod schema.
 * Returns 400 with structured errors on validation failure.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.flatten());
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory that validates req.query against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Query validation failed', result.error.flatten());
      return;
    }
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}

/**
 * Global async error handler wrapper.
 * Wraps route handlers to catch promise rejections without try/catch boilerplate.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Express error handler middleware.
 * Must be registered as the last middleware in app.ts.
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  if (res.headersSent) return;

  const isProd = process.env.NODE_ENV === 'production';
  sendError(
    res,
    500,
    'INTERNAL_ERROR',
    isProd ? 'An internal error occurred' : err.message
  );
}
