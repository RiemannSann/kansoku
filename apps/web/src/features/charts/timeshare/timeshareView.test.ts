import { describe, expect, it } from 'vitest';
import type { Timeshare } from '@kansoku/shared/types';
import { buildTimeshareView, SLOTS, slotClock } from './timeshareView';

function ts(points: Timeshare['points'], prevClose: number | null = 100): Timeshare {
  return { symbol: '600519.SH', date: '2026-09-30', prevClose, points, partial: false, asOf: null };
}

describe('slotClock', () => {
  it('labels each minute by its end time with lunch squeezed out', () => {
    expect(slotClock(0)).toBe('09:31');
    expect(slotClock(119)).toBe('11:30');
    expect(slotClock(120)).toBe('13:01');
    expect(slotClock(239)).toBe('15:00');
  });
});

describe('buildTimeshareView', () => {
  it('always lays out 240 minutes so the axis stays fixed during the day', () => {
    const view = buildTimeshareView(
      ts([
        { slot: 0, price: 101, avg: 100.8, volume: 1000 },
        { slot: 1, price: 100.5, avg: 100.7, volume: 300 },
      ]),
    );
    expect(view.rows).toHaveLength(SLOTS);
    expect(view.rows[0]).toMatchObject({ price: 101, tone: 'up' });
    expect(view.rows[1]).toMatchObject({ price: 100.5, tone: 'down' });
    expect(view.rows[2]).toMatchObject({ price: null, volume: null });
    expect(view.last).toMatchObject({ slot: 1, price: 100.5 });
  });

  it('centres the price axis on the previous close, symmetric, at least ±1%', () => {
    const small = buildTimeshareView(ts([{ slot: 0, price: 100.2, avg: 100.1, volume: 1 }]));
    expect(small.domain[0]).toBeCloseTo(100 - 1.05, 6);
    expect(small.domain[1]).toBeCloseTo(100 + 1.05, 6);
    expect(small.ticks[2]).toBe(100);

    const big = buildTimeshareView(
      ts([
        { slot: 0, price: 104, avg: 103, volume: 1 },
        { slot: 1, price: 97, avg: 101, volume: 1 },
      ]),
    );
    expect(big.domain[1] - 100).toBeCloseTo(100 - big.domain[0], 6);
    expect(big.domain[1]).toBeCloseTo(100 + 4 * 1.05, 6);
  });

  it('an empty auction-phase chart still has an axis around the previous close', () => {
    const view = buildTimeshareView(ts([]));
    expect(view.last).toBeNull();
    expect(view.domain[0]).toBeLessThan(100);
    expect(view.domain[1]).toBeGreaterThan(100);
  });
});
