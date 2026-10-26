import { randomBytes } from 'crypto';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../config/database';
import { approvePost } from '../../services/post.service';
import { publishPost } from '../../services/publishing.service';

const API = 'https://api.telegram.org';

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { username?: string };
    message?: { chat: { id: number }; message_id: number };
  };
};

function botUrl(method: string): string {
  return `${API}/bot${config.TELEGRAM_BOT_TOKEN}/${method}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; filename: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: match[1] }),
    filename: match[1].includes('png') ? 'post.png' : 'post.jpg',
  };
}

export class TelegramService {
  private offset = 0;
  private polling = false;
  private botUsername: string | null = null;
  private pollAbort: AbortController | null = null;

  get isAvailable(): boolean {
    return Boolean(config.TELEGRAM_BOT_TOKEN);
  }

  async getBotUsername(): Promise<string | null> {
    if (!this.isAvailable) return null;
    if (this.botUsername) return this.botUsername;
    const data = await this.call('getMe');
    const username = data?.result?.username as string | undefined;
    this.botUsername = username ?? null;
    return this.botUsername;
  }

  async createConnectLink(userId: string): Promise<{ url: string; botUsername: string }> {
    if (!this.isAvailable) {
      throw Object.assign(new Error('Add TELEGRAM_BOT_TOKEN to backend/.env. Create a free bot with @BotFather.'), {
        code: 'TELEGRAM_NOT_CONFIGURED',
      });
    }
    const botUsername = await this.getBotUsername();
    if (!botUsername) {
      throw Object.assign(new Error('Could not reach Telegram. Check TELEGRAM_BOT_TOKEN.'), {
        code: 'TELEGRAM_NOT_CONFIGURED',
      });
    }
    const code = randomBytes(16).toString('hex');
    await prisma.user.update({
      where: { id: userId },
      data: { telegramConnectCode: code },
    });
    return {
      botUsername,
      url: `https://t.me/${botUsername}?start=${code}`,
    };
  }

  async getStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true, telegramUsername: true },
    });
    return {
      configured: this.isAvailable,
      connected: Boolean(user?.telegramChatId),
      telegramUsername: user?.telegramUsername ?? null,
      botUsername: await this.getBotUsername(),
    };
  }

  async disconnect(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramUsername: null, telegramConnectCode: null },
    });
  }

  async notifyDrafts(userId: string, postIds: string[]): Promise<void> {
    if (!this.isAvailable || postIds.length === 0) return;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) return;

    for (const postId of postIds) {
      try {
        await this.sendDraft(user.telegramChatId, postId);
      } catch (err) {
        logger.warn('Telegram draft notify failed', { postId, error: (err as Error).message });
      }
    }
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.message?.text?.startsWith('/start')) {
      const payload = update.message.text.slice('/start'.length).trim();
      await this.linkChat(String(update.message.chat.id), update.message.from?.username, payload);
      return;
    }
    if (update.callback_query?.data && update.callback_query.message) {
      await this.handleCallback(update.callback_query);
    }
  }

  stopPolling(): void {
    this.pollAbort?.abort();
    this.polling = false;
  }

  async startPolling(): Promise<void> {
    if (!this.isAvailable || this.polling || config.TELEGRAM_WEBHOOK_URL) return;
    this.polling = true;
    this.pollAbort = new AbortController();
    try {
      await this.call('deleteWebhook', { drop_pending_updates: false });
    } catch (err) {
      logger.warn('Telegram deleteWebhook failed', { error: (err as Error).message });
    }
    logger.info('Telegram polling started');
    while (this.polling) {
      try {
        const data = await this.call('getUpdates', {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }, 30_000, this.pollAbort?.signal);
        const updates = (data?.result ?? []) as TelegramUpdate[];
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (err) {
        if (!this.polling || this.pollAbort?.signal.aborted) break;
        logger.warn('Telegram poll error', { error: (err as Error).message });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    this.polling = false;
  }

  async setupWebhook(): Promise<void> {
    if (!this.isAvailable || !config.TELEGRAM_WEBHOOK_URL) return;
    await this.call('setWebhook', {
      url: config.TELEGRAM_WEBHOOK_URL,
      secret_token: config.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
    });
    logger.info('Telegram webhook set');
  }

  private async sendDraft(chatId: string, postId: string): Promise<void> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { versions: { where: { isLatest: true } } },
    });
    const latest = post?.versions[0];
    if (!post || !latest) return;

    const platform = post.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram';
    const caption = [
      `<b>New ${platform} draft</b>`,
      escapeHtml(latest.caption),
      latest.hashtags.length ? escapeHtml(latest.hashtags.map((tag) => `#${tag}`).join(' ')) : '',
      'Approve to publish, or reject it.',
    ].filter(Boolean).join('\n\n').slice(0, 1024);

    const keyboard = {
      inline_keyboard: [
        [{ text: `Approve & post to ${platform}`, callback_data: `approve:${postId}` }],
        [{ text: 'Reject', callback_data: `reject:${postId}` }],
      ],
    };

    const image = latest.imageUrl ? dataUrlToBlob(latest.imageUrl) : null;
    if (image) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      form.append('reply_markup', JSON.stringify(keyboard));
      form.append('photo', image.blob, image.filename);
      const res = await fetch(botUrl('sendPhoto'), { method: 'POST', body: form });
      if (res.ok) return;
      logger.warn('Telegram sendPhoto failed, sending caption only', { postId, status: res.status });
    }

    await this.call('sendMessage', {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  private async linkChat(chatId: string, username: string | undefined, code: string): Promise<void> {
    if (!code) {
      await this.call('sendMessage', {
        chat_id: chatId,
        text: 'Open SocialPilot AI → Profile and tap Connect Telegram, then Start this bot from that link.',
      });
      return;
    }

    const user = await prisma.user.findFirst({ where: { telegramConnectCode: code } });
    if (!user) {
      await this.call('sendMessage', {
        chat_id: chatId,
        text: 'That connect link expired. Generate a new one from Profile.',
      });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: chatId,
        telegramUsername: username ?? null,
        telegramConnectCode: null,
      },
    });

    await this.call('sendMessage', {
      chat_id: chatId,
      text: 'Telegram is connected. Daily drafts will arrive here. Approve to publish on LinkedIn, or Reject.',
    });
  }

  private async handleCallback(query: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
    const chatId = query.message?.chat.id;
    const [action, postId] = (query.data ?? '').split(':');
    if (!chatId || !postId || (action !== 'approve' && action !== 'reject')) {
      await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Unknown action' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { telegramChatId: String(chatId) },
      select: { id: true },
    });
    if (!user) {
      await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Telegram is not linked' });
      return;
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: user.id },
      select: { id: true, platform: true, status: true },
    });
    if (!post) {
      await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Post not found' });
      return;
    }

    if (action === 'reject') {
      await prisma.post.update({ where: { id: post.id }, data: { status: 'REJECTED' } });
      await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Rejected' });
      await this.finishButtons(query, 'Rejected. It will not be published.');
      return;
    }

    const account = await prisma.connectedAccount.findFirst({
      where: { userId: user.id, platform: post.platform, isActive: true },
      orderBy: { connectedAt: 'asc' },
    });
    if (!account) {
      await this.call('answerCallbackQuery', {
        callback_query_id: query.id,
        text: `Connect ${post.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'} in the app first`,
        show_alert: true,
      });
      return;
    }

    try {
      await approvePost(post.id, user.id, account.id);
      const result = await publishPost(post.id, user.id);
      if (result.success) {
        const link = result.platformUrl ? `\n${result.platformUrl}` : '';
        await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Published' });
        await this.finishButtons(query, `Published to ${post.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}.${link}`);
        return;
      }
      await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Approved, publish failed' });
      await this.finishButtons(query, `Approved, but publish failed: ${result.errorMessage ?? 'unknown error'}`);
    } catch (err) {
      await this.call('answerCallbackQuery', {
        callback_query_id: query.id,
        text: (err as Error).message.slice(0, 180),
        show_alert: true,
      });
    }
  }

  private async finishButtons(query: NonNullable<TelegramUpdate['callback_query']>, text: string): Promise<void> {
    if (!query.message) return;
    await this.call('editMessageReplyMarkup', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
    await this.call('sendMessage', { chat_id: query.message.chat.id, text });
  }

  private async call(
    method: string,
    body?: Record<string, unknown>,
    timeoutMs = 15_000,
    signal?: AbortSignal
  ): Promise<any> {
    if (!config.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    const res = await fetch(botUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json() as { ok?: boolean; description?: string; result?: unknown };
    if (!res.ok || data.ok === false) {
      throw new Error(data.description ?? `${method} failed`);
    }
    return data;
  }
}

export const telegramService = new TelegramService();
