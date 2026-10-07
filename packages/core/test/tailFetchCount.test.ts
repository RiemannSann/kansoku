import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { MACD_MIN_BARS } from '../src/analysis/intraday/constants.js';
import { coerceIntradayTimeframe } from '../src/analysis/intraday/timeframe.js';
import { tailFetchCount } from '../src/realtime/charts.js';

const M5 = 5 * 60_000;

describe('tailFetchCount', () => {
  it('never asks for fewer bars than the chart rebuild needs', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(now, now)).toBe(MACD_MIN_BARS);
    // 600487.SH：缓存 2.5 小时后补尾巴，以前只拉 30 + 5 = 35 根，重算时报"至少要 60 根"
    expect(tailFetchCount(now - 150 * 60_000, now)).toBe(MACD_MIN_BARS);
  });

  it('a tail-sized fetch is enough for coerceIntradayTimeframe (the rebuild that used to throw)', () => {
    const now = 1_000_000_000;
    const count = tailFetchCount(now - 150 * 60_000, now);
    const bars: RawBar[] = Array.from({ length: count }, (_, i) => ({
      time: new Date(Date.UTC(2026, 8, 30, 1, 30) + i * M5).toISOString(),
      open: 10 + i * 0.01,
      high: 10.05 + i * 0.01,
      low: 9.95 + i * 0.01,
      close: 10 + i * 0.01,
      volume: 1000,
    }));
    expect(() => coerceIntradayTimeframe(bars, 'm5', undefined, 'CN')).not.toThrow();
    expect(() => coerceIntradayTimeframe(bars.slice(0, 35), 'm5', undefined, 'CN')).toThrow(
      /needs at least 60 bars/,
    );
  });

  it('grows with elapsed time at m5 granularity once past the floor', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(now - 6 * 60 * 60_000, now)).toBe(72 + 5);
  });

  it('caps at the full fetch count after long idling', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(0, now)).toBe(1000);
    expect(tailFetchCount(now - 1000 * M5, now)).toBe(1000);
  });

  it('respects an enlarged full count for history views', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(0, now, 2000)).toBe(2000);
    expect(tailFetchCount(now, now, 2000)).toBe(MACD_MIN_BARS);
  });
});
