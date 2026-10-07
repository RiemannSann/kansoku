import { describe, expect, it } from 'vitest';
import { buildCnLiveView } from './cnLiveView';

describe('buildCnLiveView', () => {
  it('explains a closed dashboard and an absent symbol', () => {
    expect(buildCnLiveView({ connected: false, updatedAt: null, parts: [] }).note).toMatch(
      /live_view_web\.py/,
    );
    expect(buildCnLiveView({ connected: true, updatedAt: '10:31', parts: [] }).note).toBe(
      '实盘里没有这只票',
    );
  });

  it('formats each section as one row', () => {
    const view = buildCnLiveView({
      connected: true,
      updatedAt: '10:31:05 CST',
      parts: [
        {
          section: 'buy',
          label: '今日买入',
          shares: 1500,
          avgPx: 20.1,
          notional: 30150,
          retPct: 1.99,
        },
        {
          section: 'available',
          label: '可卖',
          shares: null,
          avgPx: null,
          notional: 1.2e8,
          retPct: -0.5,
        },
      ],
    });
    expect(view.note).toBeNull();
    expect(view.rows[0]).toEqual({
      label: '今日买入',
      shares: '1,500 股',
      avgPx: '20.10',
      notional: '3万',
      ret: '+1.99%',
      tone: 'up',
    });
    expect(view.rows[1]).toMatchObject({
      shares: '—',
      avgPx: '—',
      notional: '1.20亿',
      tone: 'down',
    });
  });
});
