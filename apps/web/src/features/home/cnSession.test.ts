import { describe, expect, it } from 'vitest';
import { homeTradingLayout, isCnTradingTime } from './cnSession';

// 北京时间 = UTC+8
const bj = (iso: string) => new Date(`${iso}+08:00`);

describe('isCnTradingTime', () => {
  it('covers the call auction, both sessions and the lunch break on weekdays', () => {
    expect(isCnTradingTime(bj('2026-10-09T09:14:00'))).toBe(false);
    expect(isCnTradingTime(bj('2026-10-09T09:15:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T11:29:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T12:00:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T14:59:00'))).toBe(true);
    expect(isCnTradingTime(bj('2026-10-09T15:00:00'))).toBe(false);
  });

  it('is closed on weekends', () => {
    expect(isCnTradingTime(bj('2026-10-10T10:00:00'))).toBe(false);
  });
});

describe('homeTradingLayout', () => {
  it('stays on the watching layout through the A-share lunch break', () => {
    // 北京 12:00 是美东半夜，美股 session 是 overnight
    expect(homeTradingLayout('overnight', ['CN'], bj('2026-10-09T12:00:00')).trading).toBe(true);
    expect(homeTradingLayout('overnight', ['US', 'CN'], bj('2026-10-09T12:00:00')).trading).toBe(
      true,
    );
  });

  it('ignores the US pre-market when only A-shares are watched', () => {
    const evening = bj('2026-10-09T17:00:00');
    expect(homeTradingLayout('pre', ['CN'], evening)).toEqual({
      trading: false,
      overnightLabel: false,
    });
    expect(homeTradingLayout('pre', ['US', 'CN'], evening)).toEqual({
      trading: true,
      overnightLabel: true,
    });
  });

  it('defaults to US when no market preference is loaded yet', () => {
    expect(homeTradingLayout('regular', null, bj('2026-10-09T23:00:00')).trading).toBe(true);
    expect(homeTradingLayout('post', undefined, bj('2026-10-09T23:00:00')).trading).toBe(false);
  });
});
