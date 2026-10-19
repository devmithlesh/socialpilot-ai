import { generatedContentSchema, GeminiService } from './gemini.service';

// Isolate from the developer's real .env so tests never call Gemini.
jest.mock('../../config/env', () => ({
  config: { NODE_ENV: 'test', GEMINI_API_KEY: undefined, GEMINI_MODEL: 'test-model' },
}));

describe('Gemini Service & Schemas', () => {
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

  describe('GeminiService availability', () => {
    it('should report availability correctly when API key is not set', () => {
      const service = new GeminiService();
            expect(service.isAvailable).toBe(false);
    });

    it('should throw descriptive AI_NOT_CONFIGURED error when generating without API key', async () => {
      const service = new GeminiService();
      await expect(
        service.generateContent({
          topic: 'Future of Web Development',
          platform: 'LINKEDIN',
        })
      ).rejects.toThrow('AI generation is not available. GEMINI_API_KEY is not configured.');
    });
  });
});
