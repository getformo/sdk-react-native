import {
  clampNumber,
  isUndefined,
  toSnakeCase,
  mergeDeepRight,
  getActionDescriptor,
  isNetworkError,
} from '../utils/helpers';

describe('helper utilities', () => {
  describe('clampNumber()', () => {
    it('should return value when within range', () => {
      expect(clampNumber(5, 10, 0)).toBe(5);
    });

    it('should return min when value is below min', () => {
      expect(clampNumber(-5, 10, 0)).toBe(0);
    });

    it('should return max when value is above max', () => {
      expect(clampNumber(15, 10, 0)).toBe(10);
    });

    it('should handle equal min and max', () => {
      expect(clampNumber(5, 5, 5)).toBe(5);
    });

    it('should handle negative ranges', () => {
      expect(clampNumber(-15, -5, -20)).toBe(-15);
      expect(clampNumber(-25, -5, -20)).toBe(-20);
      expect(clampNumber(0, -5, -20)).toBe(-5);
    });

    it('should handle decimal values', () => {
      expect(clampNumber(0.5, 1.0, 0.0)).toBe(0.5);
      expect(clampNumber(-0.1, 1.0, 0.0)).toBe(0.0);
      expect(clampNumber(1.5, 1.0, 0.0)).toBe(1.0);
    });
  });

  describe('isUndefined()', () => {
    it('should return true for undefined', () => {
      expect(isUndefined(undefined)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isUndefined(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isUndefined('')).toBe(false);
    });

    it('should return false for 0', () => {
      expect(isUndefined(0)).toBe(false);
    });

    it('should return false for false', () => {
      expect(isUndefined(false)).toBe(false);
    });

    it('should return false for objects', () => {
      expect(isUndefined({})).toBe(false);
      expect(isUndefined([])).toBe(false);
    });
  });

  describe('toSnakeCase()', () => {
    it('should convert simple camelCase keys', () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(toSnakeCase(input)).toEqual(expected);
    });

    it('should handle PascalCase', () => {
      const input = { FirstName: 'John' };
      const expected = { first_name: 'John' };
      expect(toSnakeCase(input)).toEqual(expected);
    });

    it('should handle acronyms correctly', () => {
      const input = { userID: 123, xmlParser: true, getHTTPResponse: 'ok' };
      const expected = { user_id: 123, xml_parser: true, get_http_response: 'ok' };
      expect(toSnakeCase(input)).toEqual(expected);
    });

    it('should handle nested objects', () => {
      const input = {
        userInfo: {
          firstName: 'John',
          addressDetails: { streetName: 'Main St' },
        },
      };
      const expected = {
        user_info: {
          first_name: 'John',
          address_details: { street_name: 'Main St' },
        },
      };
      expect(toSnakeCase(input)).toEqual(expected);
    });

    it('should handle arrays with objects', () => {
      const input = {
        users: [
          { firstName: 'John' },
          { firstName: 'Jane' },
        ],
      };
      const expected = {
        users: [
          { first_name: 'John' },
          { first_name: 'Jane' },
        ],
      };
      expect(toSnakeCase(input)).toEqual(expected);
    });

    it('should preserve non-object array items', () => {
      const input = { items: ['one', 'two', 3, null] };
      const expected = { items: ['one', 'two', 3, null] };
      expect(toSnakeCase(input)).toEqual(expected);
    });

    it('should preserve Date objects', () => {
      const date = new Date('2024-01-01');
      const input = { createdAt: date };
      const result = toSnakeCase(input) as Record<string, unknown>;
      expect(result['created_at']).toBe(date);
    });

    it('should handle empty objects', () => {
      expect(toSnakeCase({})).toEqual({});
    });

    it('should handle already snake_case keys', () => {
      const input = { already_snake: 'value' };
      expect(toSnakeCase(input)).toEqual({ already_snake: 'value' });
    });
  });

  describe('mergeDeepRight()', () => {
    it('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      expect(mergeDeepRight(target, source)).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should merge nested objects deeply', () => {
      const target = { a: { x: 1, y: 2 }, b: 3 } as Record<string, unknown>;
      const source = { a: { y: 3, z: 4 } } as Record<string, unknown>;
      expect(mergeDeepRight(target, source)).toEqual({
        a: { x: 1, y: 3, z: 4 },
        b: 3,
      });
    });

    it('should not mutate original objects', () => {
      const target = { a: 1 } as Record<string, unknown>;
      const source = { b: 2 } as Record<string, unknown>;
      const result = mergeDeepRight(target, source);
      expect(target).toEqual({ a: 1 });
      expect(source).toEqual({ b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should handle arrays by replacing', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };
      expect(mergeDeepRight(target, source)).toEqual({ items: [4, 5] });
    });

    it('should handle null values in source', () => {
      const target = { a: 1, b: { c: 2 } } as Record<string, unknown>;
      const source = { b: null } as Record<string, unknown>;
      const result = mergeDeepRight(target, source);
      expect(result.b).toBeNull();
    });

    it('should ignore undefined values in source', () => {
      const target = { a: 1, b: 2 };
      const source = { b: undefined };
      expect(mergeDeepRight(target, source)).toEqual({ a: 1, b: 2 });
    });

    it('should handle empty objects', () => {
      expect(mergeDeepRight({}, { a: 1 })).toEqual({ a: 1 });
      expect(mergeDeepRight({ a: 1 }, {})).toEqual({ a: 1 });
    });
  });

  describe('getActionDescriptor()', () => {
    it('should return track:event for track type with event property', () => {
      expect(getActionDescriptor('track', { event: 'button_click' })).toBe(
        'track:button_click'
      );
    });

    it('should return screen:name for screen type with name property', () => {
      expect(getActionDescriptor('screen', { name: 'HomeScreen' })).toBe(
        'screen:HomeScreen'
      );
    });

    it('should return type for track without event', () => {
      expect(getActionDescriptor('track', { other: 'value' })).toBe('track');
    });

    it('should return type for screen without name', () => {
      expect(getActionDescriptor('screen', { other: 'value' })).toBe('screen');
    });

    it('should return type for other event types', () => {
      expect(getActionDescriptor('connect', { address: '0x...' })).toBe('connect');
      expect(getActionDescriptor('disconnect', {})).toBe('disconnect');
    });

    it('should handle null/undefined properties', () => {
      expect(getActionDescriptor('track', null)).toBe('track');
      expect(getActionDescriptor('screen', undefined)).toBe('screen');
    });
  });

  describe('isNetworkError()', () => {
    it('should return true for "Network request failed"', () => {
      expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    });

    it('should return true for "Failed to fetch"', () => {
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    });

    it('should return true for "Network Error"', () => {
      expect(isNetworkError(new Error('Network Error'))).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(isNetworkError(new Error('Request timeout'))).toBe(true);
      expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return true for connection errors', () => {
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isNetworkError(new Error('NETWORK REQUEST FAILED'))).toBe(true);
      expect(isNetworkError(new Error('network error'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isNetworkError(new Error('Invalid JSON'))).toBe(false);
      expect(isNetworkError(new Error('Unauthorized'))).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });

    it('should handle string errors', () => {
      expect(isNetworkError('Network request failed')).toBe(true);
      expect(isNetworkError('Some other error')).toBe(false);
    });
  });
});
