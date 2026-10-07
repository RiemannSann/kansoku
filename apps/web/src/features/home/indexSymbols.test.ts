import { describe, expect, it } from 'vitest';
import { INDEX_LABELS, indexCellExtras, indexSymbolsFor } from './indexSymbols';

describe('indexSymbolsFor', () => {
  it('gives A-share watchers the seven 同花顺 home indices, each with a Chinese label', () => {
    const cn = indexSymbolsFor(['CN']);
    expect(cn).toEqual([
      '000001.SH',
      '399001.SZ',
      '399006.SZ',
      '000688.SH',
      '000300.SH',
      '000905.SH',
      '000852.SH',
    ]);
    for (const symbol of cn) expect(INDEX_LABELS[symbol]).toBeTruthy();
  });

  it('falls back to US indices when nothing is watched', () => {
    expect(indexSymbolsFor(null)).toContain('SPY.US');
  });
});

describe('indexCellExtras', () => {
  it('shows the A-share index level and only flags the opening auction', () => {
    expect(indexCellExtras({ symbol: '000001.SH', last: 3312.456, session: '休市' })).toEqual({
      point: '3312.46',
      badge: null,
    });
    expect(indexCellExtras({ symbol: '000001.SH', last: 3300, session: '集合竞价' }).badge).toBe(
      '集合竞价',
    );
  });

  it('keeps the US behaviour: no level, session badge outside regular hours', () => {
    expect(indexCellExtras({ symbol: 'SPY.US', last: 600, session: '盘前' })).toEqual({
      point: null,
      badge: '盘前',
    });
    expect(indexCellExtras({ symbol: 'SPY.US', last: 600, session: '日盘' }).badge).toBeNull();
  });
});
