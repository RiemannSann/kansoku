import { describe, expect, it } from 'vitest';
import type { QuoteDepth } from '@kansoku/shared/types';
import { buildDepthView, formatAmount, formatLots } from './depthView';

function depth(over: Partial<QuoteDepth> = {}): QuoteDepth {
  return {
    symbol: '600519.SH',
    asOf: '2026-09-30T02:00:00.000Z',
    last: 1450.5,
    prevClose: 1440,
    open: 1441,
    high: 1455,
    low: 1438,
    volume: 1_234_500,
    turnover: 1_790_000_000,
    limitUp: 1584,
    limitDown: 1296,
    bids: [
      { price: 1450.5, volume: 300 },
      { price: 1450.4, volume: 1200 },
    ],
    asks: [
      { price: 1450.6, volume: 600 },
      { price: 1450.7, volume: 100 },
      { price: 1450.8, volume: 50 },
    ],
    auction: false,
    ...over,
  };
}

describe('buildDepthView', () => {
  it('lays out 卖五…卖一 above 买一…买五 in 手, padding empty levels', () => {
    const view = buildDepthView(depth());
    expect(view.asks.map((r) => r.label)).toEqual(['卖五', '卖四', '卖三', '卖二', '卖一']);
    expect(view.bids.map((r) => r.label)).toEqual(['买一', '买二', '买三', '买四', '买五']);
    expect(view.asks.at(-1)).toMatchObject({ price: '1450.60', lots: '6', tone: 'up' });
    expect(view.asks[0]).toMatchObject({ price: '—', lots: '', share: 0 });
    expect(view.bids[1]).toMatchObject({ price: '1450.40', lots: '12', share: 1 });
    expect(view.bids[4].price).toBe('—');
  });

  it('formats headline, limits and day stats', () => {
    const view = buildDepthView(depth());
    expect(view).toMatchObject({
      last: '1450.50',
      pct: '+0.73%',
      tone: 'up',
      atLimit: null,
      limitUp: '1584.00',
      limitDown: '1296.00',
    });
    expect(Object.fromEntries(view.stats.map((s) => [s.label, s.value]))).toEqual({
      今开: '1441.00',
      昨收: '1440.00',
      最高: '1455.00',
      最低: '1438.00',
      成交量: '1.23万手',
      成交额: '17.90亿',
    });
  });

  it('flags a stock sitting at its limit price', () => {
    expect(buildDepthView(depth({ last: 1584, asks: [] })).atLimit).toBe('up');
    expect(buildDepthView(depth({ last: 1296, bids: [] })).atLimit).toBe('down');
  });

  it('uses three decimals for ETF-style prices', () => {
    const view = buildDepthView(
      depth({ last: 1.234, prevClose: 1.2, bids: [{ price: 1.233, volume: 100 }], asks: [] }),
    );
    expect(view.last).toBe('1.234');
    expect(view.bids[0].price).toBe('1.233');
  });

  it('handles a missing previous close without a percent', () => {
    const view = buildDepthView(depth({ prevClose: null }));
    expect(view.pct).toBeNull();
    expect(view.tone).toBe('flat');
  });
});

describe('lots and amount formatting', () => {
  it('converts shares to 手 and big numbers to 万/亿', () => {
    expect(formatLots(0)).toBe('0');
    expect(formatLots(50)).toBe('0.50');
    expect(formatLots(12_345_600)).toBe('12.35万');
    expect(formatAmount(5_000)).toBe('5000');
    expect(formatAmount(123_456)).toBe('12万');
    expect(formatAmount(2.5e8)).toBe('2.50亿');
  });
});
