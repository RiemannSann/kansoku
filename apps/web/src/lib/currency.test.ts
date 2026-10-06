import { describe, expect, it } from 'vitest';
import { localizePriceText, pricePrefix } from './currency';

describe('price prefix by market', () => {
  it('uses $ for US, HK$ for Hong Kong and nothing for A-shares', () => {
    expect(pricePrefix('NVDA.US')).toBe('$');
    expect(pricePrefix('700.HK')).toBe('HK$');
    expect(pricePrefix('600519.SH')).toBe('');
    expect(pricePrefix('000001.SZ')).toBe('');
  });

  it('rewrites kernel-written "$ + number" text for non-US symbols only', () => {
    const payload = {
      markers: [{ tooltip: '① 09:35 $1236.5 → ② 10:00 $1258.62', text: 'H2' }],
      zones: [{ label: '价值区', sources: ['MA50 $1240.00'] }],
      note: 'R/R 2.0，费用 $ 不变',
      level: -1,
    };
    expect(localizePriceText(payload, '600519.SH')).toEqual({
      markers: [{ tooltip: '① 09:35 1236.5 → ② 10:00 1258.62', text: 'H2' }],
      zones: [{ label: '价值区', sources: ['MA50 1240.00'] }],
      note: 'R/R 2.0，费用 $ 不变',
      level: -1,
    });
    expect(localizePriceText({ t: '止损 $-1.5' }, '700.HK')).toEqual({ t: '止损 HK$-1.5' });
    expect(localizePriceText(payload, 'NVDA.US')).toBe(payload);
  });
});
