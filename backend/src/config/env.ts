import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Encrypts OAuth tokens at rest (AES-256-GCM needs exactly 32 bytes)
  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters'),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Google Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),

  // LinkedIn OAuth
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URI: z.string().optional(),

  // Instagram / Meta OAuth
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().optional(),

  // Business logic
  APPROVAL_EXPIRY_HOURS: z.coerce.number().positive().default(24),
  DAILY_POST_CRON: z.string().default('0 9 * * *'),

  // Request limits
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
});

function loadConfig() {
  // Treat empty strings (e.g. `LINKEDIN_CLIENT_ID=`) as "not set"
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== '')
  );

  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
export type Config = typeof config;
