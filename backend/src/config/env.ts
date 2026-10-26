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

  // OpenAI ChatGPT
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-2'),

  // LinkedIn OAuth
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URI: z.string().optional(),

  // Instagram / Meta OAuth
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().optional(),

  // Telegram Bot API (free). Create a bot with @BotFather and paste the token.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Business logic
  APPROVAL_EXPIRY_HOURS: z.coerce.number().positive().default(24),
  DAILY_POST_CRON: z.string().default('0 9 * * *'),

  // Request limits
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
});

/**
 * Hosting dashboards (Railway "Raw Editor", etc.) often keep the quotes from a pasted `KEY="value"` line,
 * which breaks URLs such as DATABASE_URL. Strip one pair of wrapping quotes and surrounding whitespace.
 * Done on process.env itself because Prisma reads DATABASE_URL directly from it.
 */
function normalizeProcessEnv(): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    const unquoted = /^(["'])(.*)\1$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
    if (unquoted !== value) process.env[key] = unquoted;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    process.env.DATABASE_URL = normalizeDatabaseUrl(databaseUrl);
  }
}

/**
 * Railway / Prisma + Supabase pooler needs `sslmode=require` and `pgbouncer=true`.
 * The URL itself is never logged — only whether those params were added.
 */
function normalizeDatabaseUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (!parsed.searchParams.has('sslmode')) parsed.searchParams.set('sslmode', 'require');
    if (parsed.hostname.includes('pooler.supabase.com') && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function loadConfig() {
  normalizeProcessEnv();

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
