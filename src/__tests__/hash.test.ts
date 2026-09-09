import { hash, generateUUID, stableStringify } from '../utils/hash';

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

    // The secure path uses Web Crypto (present in jest). These tests force the
    // no-Web-Crypto fallback to confirm it still yields valid, unique UUIDs
    // without crashing (and without Math.random).
    describe('fallback when Web Crypto is unavailable', () => {
      const realCrypto = (globalThis as { crypto?: unknown }).crypto;
      beforeEach(() => {
        Object.defineProperty(globalThis, 'crypto', {
          value: undefined,
          configurable: true,
        });
      });
      afterEach(() => {
        Object.defineProperty(globalThis, 'crypto', {
          value: realCrypto,
          configurable: true,
        });
      });

      it('still produces a valid UUID v4', () => {
        expect(generateUUID()).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
      });

      it('produces unique ids even within the same millisecond (counter)', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) ids.add(generateUUID());
        expect(ids.size).toBe(100);
      });
    });
  });

  describe('stableStringify()', () => {
    it('unboxes primitive wrappers, as JSON.stringify does', () => {
      const a = { amount: new Number(1), ok: new Boolean(true), s: new String('x') };
      expect(stableStringify(a)).toBe(JSON.stringify(a));
      expect(stableStringify({ amount: new Number(1) })).not.toBe(stableStringify({ amount: new Number(2) }));
    });

    it('serializes a self-returning toJSON by its fields, as JSON.stringify does', () => {
      const self: Record<string, unknown> = { b: 2, a: 1 };
      self.toJSON = function () { return this; };
      expect(stableStringify(self)).toBe('{"a":1,"b":2}');
    });

    it('passes the property key to toJSON and unboxes through the built-in methods', () => {
      const keyed = { toJSON: (k: string) => k };
      expect(stableStringify({ x: keyed })).toBe(JSON.stringify({ x: keyed }));
      expect(stableStringify({ x: keyed })).not.toBe(stableStringify({ y: keyed }));
      // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
      const boxed = new String('real') as String & { valueOf: () => string };
      boxed.valueOf = () => 'override';
      expect(stableStringify({ s: boxed })).toBe(JSON.stringify({ s: boxed }));
    });

    it('throws on a cycle, as JSON.stringify does', () => {
      const cyc: Record<string, unknown> = { a: 1 };
      cyc.self = cyc;
      expect(() => stableStringify(cyc)).toThrow(TypeError);
    });

    it('serializes a sparse array hole as null, as JSON.stringify does', () => {
      const sparse: unknown[] = [];
      sparse[2] = 1;
      expect(stableStringify({ a: sparse })).toBe(JSON.stringify({ a: sparse }));
    });

    it('applies toJSON before the cycle check', () => {
      const shared = { toJSON: () => 'x' };
      expect(stableStringify({ a: shared, b: shared })).toBe(JSON.stringify({ a: shared, b: shared }));
    });

    it('sorts object keys recursively', () => {
      expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
        '{"a":{"c":3,"d":2},"b":1}'
      );
    });

    it('keeps array order', () => {
      expect(stableStringify([2, 1])).toBe('[2,1]');
      expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
    });

    it('follows JSON.stringify for primitives and omitted values', () => {
      expect(stableStringify({ a: undefined, b: () => 1, c: null, d: NaN })).toBe(
        '{"c":null,"d":null}'
      );
      expect(stableStringify([undefined])).toBe('[null]');
      expect(stableStringify('x')).toBe('"x"');
      expect(stableStringify(undefined)).toBeUndefined();
      const date = new Date('2026-01-01T00:00:00Z');
      expect(stableStringify({ at: date })).toBe(JSON.stringify({ at: date }));
    });

    it('throws where JSON.stringify throws', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      expect(() => stableStringify(cyclic)).toThrow(TypeError);
      expect(() => stableStringify({ n: BigInt(1) })).toThrow(TypeError);
    });

    it('serializes a repeated sibling object twice, not as a cycle', () => {
      const shared = { a: 1 };
      expect(stableStringify({ x: shared, y: shared })).toBe('{"x":{"a":1},"y":{"a":1}}');
    });
  });
});
