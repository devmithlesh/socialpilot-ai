import axios from 'axios';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { encrypt, decrypt } from '../../utils/crypto';

const META_GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const META_OAUTH_BASE = 'https://api.instagram.com/oauth';

/**
 * Instagram (Meta) integration service.
 *
 * IMPORTANT PREREQUISITES:
 * 1. User must have an Instagram Professional account (Creator or Business)
 * 2. Instagram account must be connected to a Facebook Page
 * 3. Meta App must have instagram_basic and instagram_content_publish permissions approved
 * 4. App must be in live mode (not development mode) for external users
 *
 * The publishing flow uses the Content Publishing API:
 * 1. Create a media container (returns container ID)
 * 2. Wait for container to process (poll status)
 * 3. Publish the container
 */
export class InstagramService {
  get isConfigured(): boolean {
    return !!(config.INSTAGRAM_APP_ID && config.INSTAGRAM_APP_SECRET && config.INSTAGRAM_REDIRECT_URI);
  }

  getAuthorizationUrl(state: string): string {
    if (!this.isConfigured) {
      throw Object.assign(new Error('Instagram integration is not configured'), {
        code: 'NOT_CONFIGURED',
      });
    }

    const params = new URLSearchParams({
      client_id: config.INSTAGRAM_APP_ID!,
      redirect_uri: config.INSTAGRAM_REDIRECT_URI!,
      scope: 'instagram_basic,instagram_content_publish,pages_read_engagement',
      response_type: 'code',
      state,
    });

    return `${META_OAUTH_BASE}/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    userId: string;
  }> {
    try {
      const response = await axios.post(
        `${META_OAUTH_BASE}/access_token`,
        new URLSearchParams({
          client_id: config.INSTAGRAM_APP_ID!,
          client_secret: config.INSTAGRAM_APP_SECRET!,
          grant_type: 'authorization_code',
          redirect_uri: config.INSTAGRAM_REDIRECT_URI!,
          code,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Exchange for long-lived token
      const longLived = await this.exchangeForLongLivedToken(response.data.access_token);

      return { accessToken: longLived, userId: response.data.user_id };
    } catch (err) {
      logger.error('Instagram token exchange failed', { error: (err as Error).message });
      throw Object.assign(new Error('Failed to exchange Instagram authorization code'), {
        code: 'OAUTH_ERROR',
      });
    }
  }

  private async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
    const response = await axios.get(`${META_GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: config.INSTAGRAM_APP_SECRET,
        access_token: shortLivedToken,
      },
    });
    return response.data.access_token;
  }

  async getProfile(accessToken: string, userId: string): Promise<{
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
  }> {
    try {
      const response = await axios.get(`${META_GRAPH_BASE}/${userId}`, {
        params: {
          fields: 'id,name,username,profile_picture_url',
          access_token: accessToken,
        },
      });

      return {
        id: response.data.id,
        name: response.data.name ?? response.data.username,
        username: response.data.username,
        avatarUrl: response.data.profile_picture_url,
      };
    } catch (err) {
      logger.error('Instagram profile fetch failed', { error: (err as Error).message });
      throw Object.assign(new Error('Failed to fetch Instagram profile'), { code: 'PROFILE_ERROR' });
    }
  }

  /**
   * Publishes an image post to Instagram via the Content Publishing API.
   * imageUrl must be a publicly accessible HTTPS URL.
   */
  async publishImagePost(
    encryptedAccessToken: string,
    igUserId: string,
    caption: string,
    hashtags: string[],
    imageUrl: string
  ): Promise<{ platformPostId: string; platformUrl: string }> {
    const accessToken = decrypt(encryptedAccessToken);
    const fullCaption = caption + (hashtags.length ? '\n\n' + hashtags.map((h) => `#${h}`).join(' ') : '');

    try {
      // Step 1: Create media container
      const containerResponse = await axios.post(
        `${META_GRAPH_BASE}/${igUserId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            caption: fullCaption,
            access_token: accessToken,
          },
        }
      );

      const containerId = containerResponse.data.id;

      // Step 2: Wait for container to finish processing
      await this.waitForContainerReady(containerId, accessToken);

      // Step 3: Publish container
      const publishResponse = await axios.post(
        `${META_GRAPH_BASE}/${igUserId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerId,
            access_token: accessToken,
          },
        }
      );

      const postId = publishResponse.data.id;
      logger.info('Instagram post published', { igUserId, postId });

      return {
        platformPostId: postId,
        platformUrl: `https://www.instagram.com/p/${postId}`,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const errorData = err.response?.data?.error;
        logger.error('Instagram publish failed', { errorData });

        const code = errorData?.code;
        if (code === 190) {
          throw Object.assign(new Error('Instagram access token has expired. Please reconnect your account.'), {
            code: 'TOKEN_EXPIRED',
          });
        }
        if (code === 10 || code === 200) {
          throw Object.assign(new Error('Your app does not have permission to publish to Instagram. Ensure instagram_content_publish is approved.'), {
            code: 'PERMISSION_DENIED',
          });
        }
        if (errorData?.message) {
          throw Object.assign(new Error(`Instagram error: ${errorData.message}`), {
            code: 'PLATFORM_ERROR',
          });
        }
      }
      throw Object.assign(new Error('Failed to publish to Instagram'), { code: 'PUBLISH_ERROR' });
    }
  }

  /**
   * Polls the container status until it is FINISHED or errors out.
   * Instagram requires media to be processed before publishing.
   */
  private async waitForContainerReady(
    containerId: string,
    accessToken: string,
    maxAttempts = 10,
    intervalMs = 3000
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await axios.get(`${META_GRAPH_BASE}/${containerId}`, {
        params: {
          fields: 'status_code',
          access_token: accessToken,
        },
      });

      const status = response.data.status_code;

      if (status === 'FINISHED') return;
      if (status === 'ERROR') {
        throw new Error('Instagram media container processing failed');
      }
      if (status === 'EXPIRED') {
        throw new Error('Instagram media container expired before publishing');
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Instagram media container processing timed out');
  }

  encryptToken(accessToken: string): string {
    return encrypt(accessToken);
  }
}

export const instagramService = new InstagramService();
