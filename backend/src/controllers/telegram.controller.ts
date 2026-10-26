import { Request, Response } from 'express';
import { asyncHandler, sendError, sendSuccess } from '../utils/api';
import { config } from '../config/env';
import { telegramService } from '../integrations/telegram/telegram.service';

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = await telegramService.getStatus(req.user!.userId);
  sendSuccess(res, status);
});

export const createConnectLink = asyncHandler(async (req: Request, res: Response) => {
  try {
    const link = await telegramService.createConnectLink(req.user!.userId);
    sendSuccess(res, link);
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'TELEGRAM_NOT_CONFIGURED') {
      sendError(res, 503, error.code, error.message);
      return;
    }
    throw err;
  }
});

export const disconnect = asyncHandler(async (req: Request, res: Response) => {
  await telegramService.disconnect(req.user!.userId);
  sendSuccess(res, { message: 'Telegram disconnected' });
});

export const webhook = asyncHandler(async (req: Request, res: Response) => {
  if (config.TELEGRAM_WEBHOOK_SECRET) {
    const header = req.header('x-telegram-bot-api-secret-token');
    if (header !== config.TELEGRAM_WEBHOOK_SECRET) {
      sendError(res, 401, 'UNAUTHORIZED', 'Invalid Telegram webhook secret');
      return;
    }
  }
  await telegramService.handleUpdate(req.body);
  res.status(200).json({ ok: true });
});
