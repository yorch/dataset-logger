import { flattenNestedObject } from '../src/flatten-nested-object';

describe('utils', () => {
  describe('flattenNestedObject', () => {
    test('should convert object successfully', () => {
      const obj = {
        a: 1,
        b: 2,
        c: {
          d: 3,
          e: {
            f: 'string',
            g: true,
          },
        },
        h: ['123'],
        i: [
          {
            j: 123,
          },
          {
            k: false,
          },
        ],
      };
      expect(flattenNestedObject(obj)).toEqual({
        a: 1,
        b: 2,
        'c.d': 3,
        'c.e.f': 'string',
        'c.e.g': true,
        'h.0': '123',
        'i.0.j': 123,
        'i.1.k': false,
      });
    });
  });
});
