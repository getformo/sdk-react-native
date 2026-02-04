import { hash, generateUUID } from '../utils/hash';

describe('hash utilities', () => {
  describe('hash()', () => {
    it('should return a 64-character hex string (full SHA-256)', async () => {
      const result = await hash('test input');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for the same input', async () => {
      const input = 'consistent input';
      const hash1 = await hash(input);
      const hash2 = await hash(input);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await hash('input 1');
      const hash2 = await hash('input 2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const result = await hash('');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle unicode characters', async () => {
      const result = await hash('Hello 世界 🌍');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle long strings', async () => {
      const longString = 'a'.repeat(10000);
      const result = await hash(longString);
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should match known SHA-256 hash', async () => {
      // SHA-256 of "hello" is well-known
      const result = await hash('hello');
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
  });

  describe('generateUUID()', () => {
    it('should return a valid UUID v4 format', () => {
      const uuid = generateUUID();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('should have version 4 in the correct position', () => {
      const uuid = generateUUID();
      expect(uuid.charAt(14)).toBe('4');
    });

    it('should have valid variant bits', () => {
      const uuid = generateUUID();
      // Position 19 should be 8, 9, a, or b
      expect(['8', '9', 'a', 'b']).toContain(uuid.charAt(19));
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('should have the correct length (36 characters with hyphens)', () => {
      const uuid = generateUUID();
      expect(uuid).toHaveLength(36);
    });
  });
});
