import { encrypt, decrypt, hashContent } from './crypto';

describe('Crypto Utility', () => {
  describe('encrypt and decrypt', () => {
    it('should accurately encrypt and decrypt a plaintext string', () => {
      const originalText = 'my_super_secret_oauth_token_12345';
      const ciphertext = encrypt(originalText);

      expect(ciphertext).not.toBe(originalText);
      expect(ciphertext.split(':')).toHaveLength(3); // iv:authTag:encrypted

      const decrypted = decrypt(ciphertext);
      expect(decrypted).toBe(originalText);
    });

    it('should produce different ciphertexts for the same plaintext due to random IV', () => {
      const plaintext = 'consistent_secret_string';
      const cipher1 = encrypt(plaintext);
      const cipher2 = encrypt(plaintext);

      expect(cipher1).not.toBe(cipher2);
      expect(decrypt(cipher1)).toBe(plaintext);
      expect(decrypt(cipher2)).toBe(plaintext);
    });

    it('should throw an error for malformed ciphertext', () => {
      expect(() => decrypt('invalid_format_without_colons')).toThrow('Invalid ciphertext format');
      expect(() => decrypt('part1:part2')).toThrow('Invalid ciphertext format');
    });

    it('should fail decryption if ciphertext has been tampered with', () => {
      const ciphertext = encrypt('tamper_proof_text');
      const parts = ciphertext.split(':');
      // Modify the encrypted payload
      const tamperedParts = [parts[0], parts[1], Buffer.from('tampered_data').toString('base64')];
      const tamperedCiphertext = tamperedParts.join(':');

      expect(() => decrypt(tamperedCiphertext)).toThrow();
    });
  });

  describe('hashContent', () => {
    it('should produce consistent SHA-256 hash for identical objects', () => {
      const content1 = { caption: 'Hello world', hashtags: ['#ai', '#tech'], callToAction: 'Click here' };
      const content2 = { caption: 'Hello world', hashtags: ['#ai', '#tech'], callToAction: 'Click here' };

      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 is 64 hex characters
    });

    it('should produce different hashes when content changes', () => {
      const original = { caption: 'Version 1 content', hashtags: ['#v1'] };
      const modified = { caption: 'Version 2 content edited', hashtags: ['#v1'] };

      const hash1 = hashContent(original);
      const hash2 = hashContent(modified);

      expect(hash1).not.toBe(hash2);
    });
  });
});
