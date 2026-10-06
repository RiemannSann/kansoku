import { describe, expect, it } from 'vitest';
import { isCnTradingTime } from './cnSession';

// 北京时间 = UTC+8
const bj = (iso: string) => new Date(`${iso}+08:00`);

describe('isCnTradingTime', () => {
  it('covers the call auction, morning and afternoon sessions on weekdays', () => {
    expect(isCnTradingTime(bj('2026-10-09T09:14:00'))).toBe(false);
    expect(isCnTradingTime(bj('2026-10-09T09:15:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T11:29:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T12:00:00'))).toBe(false);
    expect(isCnTradingTime(bj('2026-10-09T14:59:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T15:00:00'))).toBe(false);
  });

  it('is closed on weekends', () => {
    expect(isCnTradingTime(bj('2026-10-10T10:00:00'))).toBe(false);
  });
});
