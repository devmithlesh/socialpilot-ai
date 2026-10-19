import axios from 'axios';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { encrypt, decrypt } from '../../utils/crypto';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const LINKEDIN_OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';

/**
 * LinkedIn OAuth 2.0 required scopes.
 * w_member_social: Required for publishing posts
 * r_basicprofile: Required for profile information
 * openid + profile + email: OIDC scopes for identity
 */
const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

/**
 * Decodes an uploaded `data:` URL image. Only device uploads are accepted:
 * the server never fetches arbitrary URLs on a user's behalf.
 */
function decodeImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match || !SUPPORTED_IMAGE_TYPES.includes(match[1])) {
    throw Object.assign(
      new Error('LinkedIn supports JPG, PNG or GIF images uploaded from your device. Replace or remove the image, then re-approve.'),
      { code: 'INVALID_IMAGE' }
    );
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('The image is larger than 8 MB. Use a smaller image, then re-approve.'), {
      code: 'INVALID_IMAGE',
    });
  }
  return { mimeType: match[1], buffer };
}

export interface LinkedInTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
}

export interface LinkedInProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

/**
 * LinkedIn integration service.
 *
 * IMPORTANT: This integration requires:
 * 1. A LinkedIn Developer App with Marketing Developer Platform access
 * 2. Approved app with w_member_social permission
 * 3. LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET configured
 *
 * Without valid credentials, OAuth flows will fail gracefully
 * with a clear configuration error message.
 */
export class LinkedInService {
  get isConfigured(): boolean {
    return !!(config.LINKEDIN_CLIENT_ID && config.LINKEDIN_CLIENT_SECRET && config.LINKEDIN_REDIRECT_URI);
  }

  /**
   * Generates the LinkedIn OAuth authorization URL.
   * State parameter should be a server-generated random value stored in session
   * to prevent CSRF attacks on the OAuth callback.
   */
  getAuthorizationUrl(state: string): string {
    if (!this.isConfigured) {
      throw Object.assign(new Error('LinkedIn integration is not configured'), {
        code: 'NOT_CONFIGURED',
      });
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.LINKEDIN_CLIENT_ID!,
      redirect_uri: config.LINKEDIN_REDIRECT_URI!,
      scope: LINKEDIN_SCOPES.join(' '),
      state,
    });

    return `${LINKEDIN_OAUTH_BASE}/authorization?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access tokens.
   */
  async exchangeCode(code: string): Promise<LinkedInTokens> {
    try {
      const response = await axios.post(
        `${LINKEDIN_OAUTH_BASE}/accessToken`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.LINKEDIN_REDIRECT_URI!,
          client_id: config.LINKEDIN_CLIENT_ID!,
          client_secret: config.LINKEDIN_CLIENT_SECRET!,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        scope: response.data.scope,
      };
    } catch (err) {
      logger.error('LinkedIn token exchange failed', { error: (err as Error).message });
      throw Object.assign(new Error('Failed to exchange LinkedIn authorization code'), {
        code: 'OAUTH_ERROR',
      });
    }
  }

  /**
   * Fetches the authenticated LinkedIn user's profile.
   */
  async getProfile(accessToken: string): Promise<LinkedInProfile> {
    try {
      const response = await axios.get(`${LINKEDIN_API_BASE}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return {
        id: response.data.sub,
        name: response.data.name,
        email: response.data.email,
        avatarUrl: response.data.picture,
      };
    } catch (err) {
      logger.error('LinkedIn profile fetch failed', { error: (err as Error).message });
      throw Object.assign(new Error('Failed to fetch LinkedIn profile'), { code: 'PROFILE_ERROR' });
    }
  }

  /**
   * Publishes a post to LinkedIn: text only, or text with one image.
   * Returns the LinkedIn post URN on success.
   */
  async publishPost(
    encryptedAccessToken: string,
    authorId: string,
    caption: string,
    hashtags: string[],
    image?: { dataUrl: string; altText?: string | null }
  ): Promise<{ platformPostId: string; platformUrl: string }> {
    const accessToken = decrypt(encryptedAccessToken);
    const authorUrn = `urn:li:person:${authorId}`;

    // Append hashtags to caption (LinkedIn convention)
    const hashtagsText = hashtags.length > 0 ? '\n\n' + hashtags.map((h) => `#${h}`).join(' ') : '';
    const fullText = caption + hashtagsText;

    try {
      // Decode first so an unsupported image fails loudly instead of posting text only.
      const decodedImage = image ? decodeImageDataUrl(image.dataUrl) : null;
      const assetUrn = decodedImage ? await this.uploadImage(accessToken, authorUrn, decodedImage) : null;

      const payload = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: fullText },
            shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
            ...(assetUrn
              ? {
                  media: [
                    {
                      status: 'READY',
                      media: assetUrn,
                      ...(image?.altText ? { description: { text: image.altText.slice(0, 4000) } } : {}),
                    },
                  ],
                }
              : {}),
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

      const response = await axios.post(`${LINKEDIN_API_BASE}/ugcPosts`, payload, {
        headers: this.jsonHeaders(accessToken),
      });

      const postId = response.headers['x-restli-id'] ?? response.data.id;

      logger.info('LinkedIn post published', { authorUrn, postId, withImage: !!assetUrn });

      return {
        platformPostId: postId,
        platformUrl: `https://www.linkedin.com/feed/update/${postId}`,
      };
    } catch (err) {
      throw this.toPublishError(err);
    }
  }

  private jsonHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  /** Two-step LinkedIn image upload: register an upload slot, then PUT the binary. Returns the asset URN. */
  private async uploadImage(
    accessToken: string,
    ownerUrn: string,
    image: { mimeType: string; buffer: Buffer }
  ): Promise<string> {
    const register = await axios.post(
      `${LINKEDIN_API_BASE}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: ownerUrn,
          serviceRelationships: [
            { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
          ],
        },
      },
      { headers: this.jsonHeaders(accessToken) }
    );

    const uploadUrl: string | undefined =
      register.data?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const assetUrn: string | undefined = register.data?.value?.asset;
    if (!uploadUrl || !assetUrn) {
      throw Object.assign(new Error('LinkedIn did not return an image upload URL'), { code: 'IMAGE_UPLOAD_FAILED' });
    }

    await axios.put(uploadUrl, image.buffer, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': image.mimeType },
      maxBodyLength: Infinity,
    });

    return assetUrn;
  }

  /** Maps LinkedIn/axios failures to user-readable errors with stable codes. */
  private toPublishError(err: unknown): Error {
    if ((err as { code?: string }).code === 'INVALID_IMAGE') {
      return err as Error;
    }

    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      logger.error('LinkedIn publish failed', { status, detail: err.response?.data });

      if (status === 401) {
        return Object.assign(new Error('LinkedIn access token has expired. Please reconnect your account.'), {
          code: 'TOKEN_EXPIRED',
        });
      }
      if (status === 403) {
        return Object.assign(
          new Error('Your LinkedIn app does not have permission to publish posts. Verify w_member_social scope is approved.'),
          { code: 'PERMISSION_DENIED' }
        );
      }
      if (err.config?.url?.includes('/assets') || err.config?.method === 'put') {
        return Object.assign(new Error('LinkedIn rejected the image upload. Try a smaller JPG or PNG.'), {
          code: 'IMAGE_UPLOAD_FAILED',
        });
      }
    }

    return Object.assign(new Error('Failed to publish to LinkedIn'), { code: 'PUBLISH_ERROR' });
  }
  /**
   * Encrypts tokens before database storage.
   */
  encryptTokens(tokens: LinkedInTokens): {
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt: Date;
  } {
    return {
      encryptedAccessToken: encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    };
  }
}

export const linkedInService = new LinkedInService();
