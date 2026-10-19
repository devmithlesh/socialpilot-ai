import winston from 'winston';
import { config } from './env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    config.NODE_ENV === 'production' ? json() : combine(colorize(), devFormat)
  ),
  transports: [new winston.transports.Console()],
  // Never log secrets — callers must redact before passing to logger
  silent: config.NODE_ENV === 'test',
});

export default logger;
