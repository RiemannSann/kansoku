import { describe, expect, it } from 'vitest';
import { limitState } from './limitState';

describe('limitState', () => {
  it('flags quotes sitting at the limit price', () => {
    expect(limitState({ last: 11, limitUp: 11, limitDown: 9 })).toBe('up');
    expect(limitState({ last: 9, limitUp: 11, limitDown: 9 })).toBe('down');
    expect(limitState({ last: 10.99, limitUp: 11, limitDown: 9 })).toBeNull();
  });

  it('ignores quotes without limit prices (indices, US/HK)', () => {
    expect(limitState({ last: 3300 })).toBeNull();
    expect(limitState({ last: 0, limitUp: 0, limitDown: 0 })).toBeNull();
    expect(limitState(null)).toBeNull();
  });
});
