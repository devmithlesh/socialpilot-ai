import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { config } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Structured output schema for generated social media content.
 * Gemini output is always validated with Zod before it reaches the caller.
 */
export const generatedContentSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  callToAction: z.string().optional().nullable(),
  imageAltText: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  platformNotes: z.string().optional().nullable(),
});

export type GeneratedContent = z.infer<typeof generatedContentSchema>;

export type GenerationOperation =
  | 'generate'
  | 'regenerate'
  | 'improve'
  | 'shorten'
  | 'lengthen'
  | 'change_tone'
  | 'improve_hook'
  | 'generate_hooks'
  | 'generate_hashtags'
  | 'improve_cta'
  | 'rewrite_linkedin'
  | 'rewrite_instagram'
  | 'generate_variations';

export interface GenerationRequest {
  topic: string;
  instructions?: string;
  platform: 'LINKEDIN' | 'INSTAGRAM';
  targetAudience?: string;
  brandVoice?: string;
  tone?: string;
  objective?: string;
  language?: string;
  keywords?: string[];
  hashtagPreferences?: string;
  ctaPreferences?: string;
  contentLength?: 'short' | 'medium' | 'long';
  brandGuidelines?: string;
  existingContent?: string; // For improvement/rewrite operations
  operation?: GenerationOperation;
  imageBase64?: string;
  imageMimeType?: string;
}

const PLATFORM_CONSTRAINTS = {
  LINKEDIN: {
    maxChars: 3000,
    hashtagLimit: 5,
    style:
      'Professional, insightful, and thought-leadership focused. Use paragraph breaks for readability. Suitable for B2B audiences.',
  },
  INSTAGRAM: {
    maxChars: 2200,
    hashtagLimit: 30,
    style:
      'Visual, engaging, and community-focused. Use emojis sparingly and appropriately. Conversational and authentic.',
  },
};

const OPERATION_INSTRUCTIONS: Record<GenerationOperation, (request: GenerationRequest) => string> = {
  generate: () => 'Generate a new social media post',
  regenerate: () => 'Generate a fresh, creative alternative version of the post',
  improve: () => 'Improve the writing quality so it is concise, punchy, and compelling',
  shorten: () => 'Make this post considerably shorter while keeping its core message',
  lengthen: () => 'Expand this post with 1-2 more key insights',
  change_tone: (r) => `Rewrite this post with a ${r.tone ?? 'different'} tone`,
  improve_hook: () => 'Rewrite the opening hook so it is much more scroll-stopping and compelling',
  generate_hooks: () => 'Rewrite the post starting with a powerful opening hook',
  generate_hashtags: () => 'Keep the post content and generate fresh, relevant hashtags tailored to the topic',
  improve_cta: () => 'Rewrite and strengthen the call-to-action at the end of the post',
  rewrite_linkedin: () => 'Adapt and optimize this content specifically for LinkedIn',
  rewrite_instagram: () => 'Adapt and optimize this content specifically for Instagram',
  generate_variations: () => 'Generate an alternative, distinct variation of this post',
};

/** Candidate models tried in order when the primary model is overloaded or rate-limited. */
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash'];
const REQUEST_TIMEOUT_MS = 18_000;
const IMAGE_TIMEOUT_MS = 60_000;

/**
 * Gemini content generation service.
 * All API calls go through this module — the API key never leaves the backend.
 */
export class GeminiService {
  private readonly client: GoogleGenAI | null;
  private readonly modelName: string;

  constructor() {
    this.modelName = config.GEMINI_MODEL;

    if (!config.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY is not configured. AI generation will be unavailable.');
      this.client = null;
    } else {
      this.client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Generates social media content and returns validated, structured output.
   * Throws when every candidate model fails — we never substitute fabricated content.
   */
  async generateContent(request: GenerationRequest): Promise<{
    content: GeneratedContent;
    durationMs: number;
  }> {
    if (!this.client) {
      throw Object.assign(new Error('AI generation is not available. GEMINI_API_KEY is not configured.'), {
        code: 'AI_NOT_CONFIGURED',
      });
    }

    const startMs = Date.now();
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: this.buildPrompt(request) },
    ];

    if (request.imageBase64) {
      parts.push({ inlineData: parseImagePayload(request.imageBase64, request.imageMimeType) });
    }

    const candidateModels = [this.modelName, ...FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);
    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const rawText = await this.callModel(model, parts);
        const content = this.parseResponse(rawText);

        // A user-supplied image is kept as the post visual; Gemini only describes it.
        if (request.imageBase64) {
          content.imageUrl = request.imageBase64;
        }

        const durationMs = Date.now() - startMs;
        logger.info('Content generated', { model, durationMs, platform: request.platform, operation: request.operation });
        return { content, durationMs };
      } catch (err) {
        lastError = err as Error;
        logger.warn(`Gemini model ${model} failed: ${lastError.message}`);
      }
    }

    throw Object.assign(
      new Error(`AI generation failed. Please try again. (${lastError?.message ?? 'unknown error'})`),
      { code: 'AI_GENERATION_FAILED' }
    );
  }

  /**
   * Generates a post image that visually matches the caption.
   * Returns a PNG/JPEG data URL (the same shape as user-uploaded images), so it flows through
   * the existing editor and LinkedIn image-upload path unchanged.
   */
  async generateImage(request: {
    caption: string;
    topic?: string;
    platform: 'LINKEDIN' | 'INSTAGRAM';
    style?: string;
  }): Promise<{ dataUrl: string; altText: string; durationMs: number }> {
    try {
      return await this.generateImageWithGemini(request);
    } catch (geminiErr) {
      // Gemini image output needs a billed plan; fall back to a free keyless generator so the feature still works.
      try {
        return await this.generateImageWithPollinations(request);
      } catch (fallbackErr) {
        throw Object.assign(
          new Error(
            `Image generation failed. Gemini: ${(geminiErr as Error).message.slice(0, 160)} | Fallback: ${(fallbackErr as Error).message}`
          ),
          { code: 'IMAGE_GENERATION_FAILED' }
        );
      }
    }
  }

  /** Free fallback (no API key). Quality is lower than Gemini and the images carry a small provider watermark. */
  private async generateImageWithPollinations(request: {
    caption: string;
    topic?: string;
    platform: 'LINKEDIN' | 'INSTAGRAM';
    style?: string;
  }): Promise<{ dataUrl: string; altText: string; durationMs: number }> {
    const startMs = Date.now();
    const subject = (request.topic?.trim() || request.caption).replace(/\s+/g, ' ').slice(0, 280);
    const style = request.style?.trim() || 'modern clean professional editorial illustration, cohesive colour palette';
    const prompt = `${style}. Subject: ${subject}. No text, no letters, no logos.`;
    const [width, height] = request.platform === 'INSTAGRAM' ? [1080, 1080] : [1200, 628];
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${width}&height=${height}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1_000_000)}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !mimeType.startsWith('image/')) {
      throw new Error(`fallback image service returned ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const durationMs = Date.now() - startMs;
    logger.info('Image generated (fallback provider)', { durationMs, platform: request.platform });

    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      altText: `AI-generated illustration for: ${subject.slice(0, 120)}`,
      durationMs,
    };
  }

  private async generateImageWithGemini(request: {
    caption: string;
    topic?: string;
    platform: 'LINKEDIN' | 'INSTAGRAM';
    style?: string;
  }): Promise<{ dataUrl: string; altText: string; durationMs: number }> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const startMs = Date.now();
    const model = config.GEMINI_IMAGE_MODEL;
    const aspect = request.platform === 'INSTAGRAM' ? 'square 1:1' : 'landscape 1.91:1';
    const subject = (request.topic?.trim() || request.caption).slice(0, 700);

    const prompt = [
      `Create a ${aspect} image to accompany a ${request.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'} post.`,
      `The image must visually represent this post's core idea:`,
      `"""${subject}"""`,
      request.caption !== subject ? `Full post for context:\n"""${request.caption.slice(0, 1200)}"""` : '',
      `Style: ${request.style?.trim() || 'modern, clean, professional editorial illustration with a cohesive colour palette'}.`,
      'Do NOT include any text, letters, numbers, logos or watermarks in the image. Avoid photorealistic faces of real people.',
    ]
      .filter(Boolean)
      .join('\n');

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Image generation timed out')), IMAGE_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        this.client.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
        timeout,
      ]);

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'));
      if (!imagePart?.inlineData?.data) {
        throw new Error('The image model returned no image. Try rephrasing the post or retry.');
      }

      const mimeType = imagePart.inlineData.mimeType ?? 'image/png';
      const durationMs = Date.now() - startMs;
      logger.info('Image generated', { model, durationMs, platform: request.platform });

      return {
        dataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}`,
        altText: `AI-generated illustration for: ${subject.slice(0, 120)}`,
        durationMs,
      };
    } catch (err) {
      const message = (err as Error).message;
      logger.warn(`Gemini image model ${model} failed: ${message}`);
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }

  private async callModel(
    model: string,
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
  ): Promise<string> {
    if (!this.client) throw new Error('Gemini client is not initialised');

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Model ${model} timed out`)), REQUEST_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        this.client.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: 2048 },
        }),
        timeout,
      ]);

      if (!response.text) throw new Error(`Model ${model} returned an empty response`);
      return response.text;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Parses and validates the model's JSON, tolerating markdown fences and `#` hashtag prefixes. */
  private parseResponse(rawText: string): GeneratedContent {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?/, '')
      .replace(/```$/, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error('Gemini returned invalid JSON');
    }

    const rawHashtags = parsed.hashtags;
    const hashtagList: unknown[] =
      typeof rawHashtags === 'string' ? rawHashtags.split(/[,\s]+/) : Array.isArray(rawHashtags) ? rawHashtags : [];
    parsed.hashtags = hashtagList.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean);

    const validated = generatedContentSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn('Gemini response failed schema validation', { errors: validated.error.flatten() });
      throw new Error('AI response did not match the expected structure');
    }
    return validated.data;
  }

  private buildPrompt(request: GenerationRequest): string {
    const platform = PLATFORM_CONSTRAINTS[request.platform];
    const operation = request.operation ?? 'generate';

    const optionalLines = [
      request.topic && `TOPIC/IDEA: ${request.topic}`,
      request.instructions && `SPECIFIC INSTRUCTIONS: ${request.instructions}`,
      request.targetAudience && `TARGET AUDIENCE: ${request.targetAudience}`,
      request.brandVoice && `BRAND VOICE: ${request.brandVoice}`,
      request.tone && `TONE: ${request.tone}`,
      request.objective && `CONTENT OBJECTIVE: ${request.objective}`,
      request.language && `LANGUAGE: ${request.language}`,
      request.keywords?.length && `KEYWORDS TO INCLUDE: ${request.keywords.join(', ')}`,
      request.hashtagPreferences && `HASHTAG PREFERENCES: ${request.hashtagPreferences}`,
      request.ctaPreferences && `CALL-TO-ACTION PREFERENCES: ${request.ctaPreferences}`,
      request.contentLength && `CONTENT LENGTH: ${request.contentLength}`,
      request.brandGuidelines && `BRAND GUIDELINES: ${request.brandGuidelines}`,
      request.existingContent && `EXISTING CONTENT TO WORK FROM:\n${request.existingContent}`,
    ].filter(Boolean);

    const imageSection = request.imageBase64
      ? `
An image is attached. Read its visible text and content, write the post about what it actually shows,
and set "imageAltText" to an accurate, descriptive summary of the image.`
      : '';

    return `You are an expert social media strategist and copywriter.

TASK: ${OPERATION_INSTRUCTIONS[operation](request)}

PLATFORM: ${request.platform}
Platform style: ${platform.style}
Maximum characters: ${platform.maxChars}
Hashtag limit: ${platform.hashtagLimit}

${optionalLines.join('\n')}
${imageSection}

RULES:
1. Write about the exact topic provided; do not invent statistics or claims.
2. Keep the caption readable and appropriately sized for the platform.
3. Hashtags must be relevant and returned WITHOUT the '#' prefix.
4. Return ONLY valid JSON matching the schema below (no markdown fences).

REQUIRED JSON SCHEMA:
{
  "caption": "The post text",
  "hashtags": ["hashtag1", "hashtag2"],
  "callToAction": "A short call-to-action",
  "imageAltText": "Description of the attached image, if any",
  "platformNotes": "Optional notes for the author"
}`;
  }
}

/** Accepts either a raw base64 string or a `data:<mime>;base64,<data>` URL. */
function parseImagePayload(imageBase64: string, fallbackMimeType?: string): { mimeType: string; data: string } {
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: fallbackMimeType || 'image/jpeg', data: imageBase64 };
}

export const geminiService = new GeminiService();
