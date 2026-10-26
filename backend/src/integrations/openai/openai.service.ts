import { z } from 'zod';
import { config } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Structured output schema for generated social media content.
 * ChatGPT output is always validated with Zod before it reaches the caller.
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
  | 'improve_hook'
  | 'generate_hashtags'
  | 'improve_cta';

export interface GenerationRequest {
  topic: string;
  platform: 'LINKEDIN' | 'INSTAGRAM';
  existingContent?: string;
  operation?: GenerationOperation;
}

const PLATFORM_CONSTRAINTS = {
  LINKEDIN: {
    maxChars: 220,
    hashtagLimit: 5,
    style:
      'Professional and useful. Exactly two short lines. No long thought-leadership essays.',
  },
  INSTAGRAM: {
    maxChars: 220,
    hashtagLimit: 8,
    style:
      'Conversational and clear. Exactly two short lines. Use at most one emoji.',
  },
};

const OPERATION_INSTRUCTIONS: Record<GenerationOperation, (request: GenerationRequest) => string> = {
  generate: () => 'Write a new two-line social media post',
  regenerate: () => 'Write a fresh two-line alternative of the post',
  improve: () => 'Tighten the two-line caption so it is punchy and clear',
  shorten: () => 'Keep exactly two short lines and make each line even tighter',
  lengthen: () => 'Keep exactly two lines, but make each line a bit richer and more useful',
  improve_hook: () => 'Rewrite line 1 so it is a stronger hook. Keep the whole caption at two lines.',
  generate_hashtags: () => 'Keep the two-line caption and generate fresh, relevant hashtags',
  improve_cta: () => 'Keep the two-line caption and strengthen the separate call-to-action field',
};

const FALLBACK_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 45_000;
const IMAGE_TIMEOUT_MS = 90_000;
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const IMAGES_URL = 'https://api.openai.com/v1/images/generations';

/**
 * ChatGPT content generation service.
 * All API calls go through this module — the API key never leaves the backend.
 */
export class OpenAIService {
  private readonly apiKey: string | null;
  private readonly modelName: string;

  constructor() {
    this.modelName = config.OPENAI_MODEL;

    if (!config.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY is not configured. AI generation will be unavailable.');
      this.apiKey = null;
    } else {
      this.apiKey = config.OPENAI_API_KEY;
    }
  }

  get isAvailable(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Generates social media content and returns validated, structured output.
   * Throws when every candidate model fails — we never substitute fabricated content.
   */
  async generateContent(request: GenerationRequest): Promise<{
    content: GeneratedContent;
    durationMs: number;
    model: string;
  }> {
    if (!this.apiKey) {
      throw Object.assign(new Error('AI generation is not available. OPENAI_API_KEY is not configured.'), {
        code: 'AI_NOT_CONFIGURED',
      });
    }

    const startMs = Date.now();
    const prompt = this.buildPrompt(request);
    const candidateModels = [this.modelName, FALLBACK_MODEL].filter((m, i, arr) => arr.indexOf(m) === i);
    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const rawText = await this.callModel(model, prompt);
        const content = this.parseResponse(rawText);

        const durationMs = Date.now() - startMs;
        logger.info('Content generated', { model, durationMs, platform: request.platform, operation: request.operation });
        return { content, durationMs, model };
      } catch (err) {
        lastError = err as Error;
        logger.warn(`OpenAI model ${model} failed: ${lastError.message}`);
        if (/credits remaining|insufficient_quota|billing/i.test(lastError.message)) break;
      }
    }

    throw Object.assign(
      new Error(`AI generation failed. Please try again. (${lastError?.message ?? 'unknown error'})`),
      { code: 'AI_GENERATION_FAILED' }
    );
  }

  /**
   * Generates a post image that visually matches the caption.
   * Returns a PNG/JPEG data URL so it flows through the existing editor unchanged.
   */
  async generateImage(request: {
    caption: string;
    topic?: string;
    platform: 'LINKEDIN' | 'INSTAGRAM';
    style?: string;
  }): Promise<{ dataUrl: string; altText: string; durationMs: number }> {
    if (!this.apiKey) {
      throw Object.assign(new Error('AI generation is not available. OPENAI_API_KEY is not configured.'), {
        code: 'AI_NOT_CONFIGURED',
      });
    }

    const startMs = Date.now();
    const model = config.OPENAI_IMAGE_MODEL;
    const topic = (request.topic?.trim() || request.caption).replace(/\s+/g, ' ').slice(0, 280);
    const caption = request.caption.replace(/\s+/g, ' ').slice(0, 280);
    const style =
      request.style?.trim() ||
      'high-detail educational illustration, clear visual storytelling, vivid but professional colours';
    const aspect = request.platform === 'INSTAGRAM' ? 'square 1:1' : 'landscape 16:9';

    const prompt = [
      `Create a highly detailed ${aspect} image for a ${request.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'} post.`,
      `TOPIC that must be obvious at a glance: "${topic}".`,
      caption && caption !== topic ? `Caption for context: "${caption}".` : '',
      'A complete beginner should understand the topic just by looking at the image.',
      'Show a concrete scene that teaches the topic: real objects, people at work, tools, steps, or the process involved.',
      'Use a clear visual story: starting point, the key steps, and the result.',
      'Add short readable labels of 2-5 words on the important parts, plus arrows or numbered steps if it is a process or roadmap.',
      'Include rich everyday detail so the scene looks specific, not generic: environment, materials, lighting, and context.',
      `Style: ${style}.`,
      'Do not make an abstract gradient, empty decorative art, logo, icon collage, or unrelated scenery.',
      'Do not invent a different topic. Avoid photorealistic faces of real celebrities. No watermarks.',
    ]
      .filter(Boolean)
      .join(' ');

    const isGptImage = model.startsWith('gpt-image');
    const body: Record<string, unknown> = {
      model,
      prompt: prompt.slice(0, 3900),
      n: 1,
      size: isGptImage ? 'auto' : request.platform === 'INSTAGRAM' ? '1024x1024' : '1792x1024',
      quality: isGptImage ? 'high' : 'hd',
    };
    if (isGptImage) {
      body.output_format = 'png';
    } else {
      body.response_format = 'b64_json';
    }

    try {
      const response = await fetch(IMAGES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        data?: Array<{ b64_json?: string }>;
      };

      if (!response.ok) {
        throw new Error(payload.error?.message || `Image request failed (${response.status})`);
      }

      const b64 = payload.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error('The image model returned no image. Try rephrasing the post or retry.');
      }

      const durationMs = Date.now() - startMs;
      logger.info('Image generated', { model, durationMs, platform: request.platform });

      return {
        dataUrl: `data:image/png;base64,${b64}`,
        altText: `Detailed illustration explaining: ${topic.slice(0, 120)}`,
        durationMs,
      };
    } catch (err) {
      const message = (err as Error).message;
      logger.warn(`OpenAI image model ${model} failed: ${message}`);
      throw Object.assign(new Error(`Image generation failed. ${message}`), { code: 'IMAGE_GENERATION_FAILED' });
    }
  }

  private async callModel(model: string, prompt: string): Promise<string> {
    if (!this.apiKey) throw new Error('OpenAI client is not initialised');

    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        ...(model.startsWith('gpt-4') || model.startsWith('gpt-3') ? { temperature: 0.8 } : {}),
        max_completion_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an expert social media copywriter. Captions are always exactly two short lines. Respond with a single JSON object only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    if (!response.ok) {
      throw new Error(payload.error?.message || `Chat request failed (${response.status})`);
    }

    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Model ${model} returned an empty response`);
    return text;
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
      throw new Error('ChatGPT returned invalid JSON');
    }

    const rawHashtags = parsed.hashtags;
    const hashtagList: unknown[] =
      typeof rawHashtags === 'string' ? rawHashtags.split(/[,\s]+/) : Array.isArray(rawHashtags) ? rawHashtags : [];
    parsed.hashtags = hashtagList.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean);

    if (typeof parsed.caption === 'string') {
      parsed.caption = limitCaptionToTwoLines(parsed.caption);
    }

    const validated = generatedContentSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn('ChatGPT response failed schema validation', { errors: validated.error.flatten() });
      throw new Error('AI response did not match the expected structure');
    }
    return validated.data;
  }

  private buildPrompt(request: GenerationRequest): string {
    const platform = PLATFORM_CONSTRAINTS[request.platform];
    const operation = request.operation ?? 'generate';

    const optionalLines = [
      request.topic && `TOPIC/IDEA: ${request.topic}`,
      request.existingContent && `EXISTING CONTENT TO WORK FROM:\n${request.existingContent}`,
    ].filter(Boolean);

    return `You are an expert social media strategist and copywriter.

TASK: ${OPERATION_INSTRUCTIONS[operation](request)}

PLATFORM: ${request.platform}
Platform style: ${platform.style}
Maximum characters: ${platform.maxChars}
Hashtag limit: ${platform.hashtagLimit}

${optionalLines.join('\n')}

RULES:
1. Write about the exact topic provided; do not invent statistics or claims.
2. The caption MUST be exactly 2 short lines and nothing more. Line 1 is the hook. Line 2 is one useful takeaway.
3. Separate the two lines with a newline. Do not write a third line or a paragraph.
4. Put any call-to-action in "callToAction", not in the caption.
5. Hashtags must be relevant and returned WITHOUT the '#' prefix.
6. Return ONLY valid JSON matching the schema below (no markdown fences).

REQUIRED JSON SCHEMA:
{
  "caption": "Line one hook about the topic\\nLine two takeaway a beginner can use",
  "hashtags": ["hashtag1", "hashtag2"],
  "callToAction": "A short call-to-action",
  "imageAltText": "Description of the attached image, if any",
  "platformNotes": "Optional notes for the author"
}`;
  }
}

/** Keeps generated captions at two readable lines, even if the model writes more. */
export function limitCaptionToTwoLines(caption: string): string {
  const lines = caption
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return lines.slice(0, 2).join('\n');
  }

  const single = (lines[0] ?? caption).trim();
  const sentences = single.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length >= 2) {
    return `${sentences[0]}\n${sentences.slice(1).join(' ')}`;
  }

  const words = single.split(/\s+/).filter(Boolean);
  if (words.length < 8) return single;
  const splitAt = Math.ceil(words.length / 2);
  return `${words.slice(0, splitAt).join(' ')}\n${words.slice(splitAt).join(' ')}`;
}

export const openaiService = new OpenAIService();
