import { describe, expect, it } from 'vitest';
import type { QuoteCell } from '@kansoku/shared/types';
import { buildWatchRows, nextSort, sortWatchRows } from './watchRows';

const q = (
  symbol: string,
  last: number,
  pct: number | null,
  extra: Partial<QuoteCell> = {},
): QuoteCell => ({
  symbol,
  session: '日盘',
  last,
  pct,
  regularLast: last,
  regularPct: pct,
  ...extra,
});

const quotes = [
  q('600519.SH', 1258.62, 1.86, { volume: 3_833_098, turnover: 4.797e9 }),
  q('000001.SZ', 11.58, -0.6, { volume: 104_535_745, turnover: 1.2e9 }),
  q('NVDA.US', 180, 2),
  q('000001.SH', 3300, 0.3),
  q('688330.SH', 44.22, 10, { limitUp: 44.22, limitDown: 29.48, volume: 1_110_916 }),
  q('300750.SZ', 250, null),
];

describe('buildWatchRows', () => {
  const rows = buildWatchRows(
    quotes,
    { '600519.SH': { name: '贵州茅台' } },
    new Set(['000001.SH']),
  );

  it('keeps A-share stocks only, in watchlist order, with bare codes', () => {
    expect(rows.map((r) => r.code)).toEqual(['600519', '000001', '688330', '300750']);
    expect(rows[0]).toMatchObject({ name: '贵州茅台', order: 0, volume: 3_833_098 });
    expect(rows[1].name).toBe('');
  });

  it('derives the change amount from last and percent, and flags limit-up', () => {
    expect(rows[0].change).toBeCloseTo(1258.62 - 1258.62 / 1.0186, 6);
    expect(rows[2].atLimit).toBe('up');
    expect(rows[3].change).toBeNull();
  });
});

describe('sortWatchRows', () => {
  const rows = buildWatchRows(quotes, {}, new Set(['000001.SH']));
  it('sorts by percent with missing values last in both directions', () => {
    expect(sortWatchRows(rows, 'pct', 'desc').map((r) => r.code)).toEqual([
      '688330',
      '600519',
      '000001',
      '300750',
    ]);
    expect(sortWatchRows(rows, 'pct', 'asc').map((r) => r.code)).toEqual([
      '000001',
      '600519',
      '688330',
      '300750',
    ]);
  });

  it('sorts by turnover and by code', () => {
    expect(sortWatchRows(rows, 'turnover', 'desc')[0].code).toBe('600519');
    expect(sortWatchRows(rows, 'code', 'asc').map((r) => r.code)).toEqual([
      '000001',
      '300750',
      '600519',
      '688330',
    ]);
  });
});

describe('nextSort', () => {
  it('cycles desc → asc → watchlist order like 同花顺', () => {
    let s = nextSort({ key: 'order', dir: 'asc' }, 'pct');
    expect(s).toEqual({ key: 'pct', dir: 'desc' });
    s = nextSort(s, 'pct');
    expect(s).toEqual({ key: 'pct', dir: 'asc' });
    s = nextSort(s, 'pct');
    expect(s).toEqual({ key: 'order', dir: 'asc' });
    expect(nextSort({ key: 'pct', dir: 'desc' }, 'code')).toEqual({ key: 'code', dir: 'asc' });
  });
});
