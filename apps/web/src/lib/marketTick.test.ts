import { describe, expect, it } from 'vitest';
import { formatMarketTick } from '@kansoku/shared/time';

// A 股 2026-09-30 09:30 北京时间开盘那根 K 线
const cnOpen = Date.parse('2026-09-30T01:30:00Z') / 1000;
// A 股日线记在北京时间 0 点（UTC 前一天 16:00）
const cnDay = Date.parse('2026-09-29T16:00:00Z') / 1000;

describe('formatMarketTick', () => {
  it('labels A-share bars in Beijing time', () => {
    expect(formatMarketTick(cnOpen, 3, 'CN')).toBe('09:30');
    expect(formatMarketTick(cnDay, 2, 'CN')).toBe('09-30');
  });

  it('keeps US charts on Eastern time by default', () => {
    expect(formatMarketTick(cnOpen, 3)).toBe('21:30');
    expect(formatMarketTick(cnDay, 2)).toBe('09-29');
  });
});
