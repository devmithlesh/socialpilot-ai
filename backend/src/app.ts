import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { logger } from './config/logger';
import { globalErrorHandler } from './utils/api';
import routes from './routes';

export function createApp() {
  const app = express();

  // Behind a hosting proxy (Render/Railway/...) req.ip and rate limiting need the forwarded client IP
  if (config.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // ─── Security headers ────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ─── CORS ─────────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: config.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ─── Rate limiting (Disabled / Unlimited for development and rapid prompting) ──
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: 1000000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000000,
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts' } },
  });

  app.use('/api', limiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // ─── Body parsing ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: `${config.MAX_UPLOAD_SIZE_MB}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.MAX_UPLOAD_SIZE_MB}mb` }));
  app.use(cookieParser());
  app.use(compression());

  // ─── Logging ──────────────────────────────────────────────────────────────────
  if (config.NODE_ENV !== 'test') {
    app.use(morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
    }));
  }

  // ─── Routes ───────────────────────────────────────────────────────────────────
  app.use('/api', routes);

  // ─── 404 handler ──────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });

  // ─── Error handler ────────────────────────────────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}
