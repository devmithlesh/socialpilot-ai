import { generatedContentSchema, limitCaptionToTwoLines, OpenAIService } from './openai.service';

// Isolate from the developer's real .env so tests never call OpenAI.
jest.mock('../../config/env', () => ({
  config: { NODE_ENV: 'test', OPENAI_API_KEY: undefined, OPENAI_MODEL: 'test-model', OPENAI_IMAGE_MODEL: 'test-image' },
}));

describe('OpenAI Service & Schemas', () => {
  describe('generatedContentSchema', () => {
    it('should validate complete valid generated content', () => {
      const validContent = {
        caption: 'Exciting news! We are launching our new AI platform today.',
        hashtags: ['#AI', '#TechInnovation', '#Startups'],
        callToAction: 'Check out the link in bio to learn more!',
        imageAltText: 'A high tech dashboard displaying analytics',
        platformNotes: 'Best posted on Tuesday morning',
      };

      const result = generatedContentSchema.safeParse(validContent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.caption).toBe(validContent.caption);
        expect(result.data.hashtags).toHaveLength(3);
      }
    });

    it('should validate minimal valid content with optional fields omitted', () => {
      const minimalContent = {
        caption: 'Just a simple post caption',
        hashtags: [],
      };

      const result = generatedContentSchema.safeParse(minimalContent);
      expect(result.success).toBe(true);
    });

    it('should reject content with empty caption', () => {
      const invalid = {
        caption: '',
        hashtags: ['#test'],
      };

      const result = generatedContentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should default missing hashtags to an empty array', () => {
      const result = generatedContentSchema.safeParse({ caption: 'Valid caption here' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hashtags).toEqual([]);
      }
    });
  });

  describe('limitCaptionToTwoLines', () => {
    it('keeps only the first two lines', () => {
      expect(limitCaptionToTwoLines('Line one\nLine two\nLine three')).toBe('Line one\nLine two');
    });

    it('splits a multi-sentence paragraph into two lines', () => {
      expect(limitCaptionToTwoLines('Learn HTML first. Then practice by building a simple page.')).toBe(
        'Learn HTML first.\nThen practice by building a simple page.'
      );
    });
  });

  describe('OpenAIService availability', () => {
    it('should report availability correctly when API key is not set', () => {
      const service = new OpenAIService();
      expect(service.isAvailable).toBe(false);
    });

    it('should throw descriptive AI_NOT_CONFIGURED error when generating without API key', async () => {
      const service = new OpenAIService();
      await expect(
        service.generateContent({
          topic: 'Future of Web Development',
          platform: 'LINKEDIN',
        })
      ).rejects.toThrow('AI generation is not available. OPENAI_API_KEY is not configured.');
    });
  });
});
