import MemoryStorage from '../lib/storage/MemoryStorage';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage('test-write-key');
  });

  describe('isAvailable()', () => {
    it('should always return true', () => {
      expect(storage.isAvailable()).toBe(true);
    });
  });

  describe('getKey()', () => {
    it('should generate prefixed key', () => {
      const key = storage.getKey('myKey');
      expect(key).toBe('formo_rn_test-write-key_myKey');
    });

    it('should handle special characters in key', () => {
      const key = storage.getKey('my-special_key.123');
      expect(key).toBe('formo_rn_test-write-key_my-special_key.123');
    });
  });

  describe('set() and get()', () => {
    it('should store and retrieve a value', () => {
      storage.set('testKey', 'testValue');
      expect(storage.get('testKey')).toBe('testValue');
    });

    it('should return null for non-existent key', () => {
      expect(storage.get('nonExistent')).toBeNull();
    });

    it('should overwrite existing value', () => {
      storage.set('key', 'value1');
      storage.set('key', 'value2');
      expect(storage.get('key')).toBe('value2');
    });

    it('should store empty string', () => {
      storage.set('emptyKey', '');
      expect(storage.get('emptyKey')).toBe('');
    });

    it('should handle JSON strings', () => {
      const json = JSON.stringify({ foo: 'bar', num: 123 });
      storage.set('jsonKey', json);
      expect(JSON.parse(storage.get('jsonKey')!)).toEqual({ foo: 'bar', num: 123 });
    });
  });

  describe('setAsync() and getAsync()', () => {
    it('should store and retrieve a value asynchronously', async () => {
      await storage.setAsync('asyncKey', 'asyncValue');
      const value = await storage.getAsync('asyncKey');
      expect(value).toBe('asyncValue');
    });

    it('should return null for non-existent key', async () => {
      const value = await storage.getAsync('nonExistent');
      expect(value).toBeNull();
    });
  });

  describe('remove()', () => {
    it('should remove an existing key', () => {
      storage.set('toRemove', 'value');
      expect(storage.get('toRemove')).toBe('value');

      storage.remove('toRemove');
      expect(storage.get('toRemove')).toBeNull();
    });

    it('should not throw when removing non-existent key', () => {
      expect(() => storage.remove('nonExistent')).not.toThrow();
    });
  });

  describe('removeAsync()', () => {
    it('should remove an existing key asynchronously', async () => {
      await storage.setAsync('toRemove', 'value');
      await storage.removeAsync('toRemove');
      expect(await storage.getAsync('toRemove')).toBeNull();
    });
  });

  describe('clear()', () => {
    it('should remove all stored values', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.set('key3', 'value3');

      storage.clear();

      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
      expect(storage.get('key3')).toBeNull();
    });

    it('should not throw when storage is already empty', () => {
      expect(() => storage.clear()).not.toThrow();
    });
  });

  describe('isolation between instances', () => {
    it('should isolate data between different write keys', () => {
      const storage1 = new MemoryStorage('key1');
      const storage2 = new MemoryStorage('key2');

      storage1.set('shared', 'value1');
      storage2.set('shared', 'value2');

      expect(storage1.get('shared')).toBe('value1');
      expect(storage2.get('shared')).toBe('value2');
    });
  });
});
