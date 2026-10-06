import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteCell, QuoteDepth } from '@kansoku/shared/types';

const stream = vi.hoisted(() => {
  const depth = new Map<string, QuoteDepth>();
  const listeners = new Set<(cell: QuoteCell) => void>();
  return {
    depth,
    listeners,
    retain: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn((cb: (cell: QuoteCell) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    getDepth: vi.fn((symbol: string) => depth.get(symbol)),
    push(symbol: string, last: number) {
      depth.set(symbol, book(symbol, last));
      const cell = { symbol, session: '日盘', last, pct: 0, regularLast: last, regularPct: 0 };
      for (const l of listeners) l(cell);
    },
  };
});

vi.mock('../src/marketdata/registry.js', () => ({ getStream: () => stream }));

const { subscribeDepth } = await import('../src/realtime/depth.js');
const { parseWsMessage } = await import('../src/realtime/channelProtocol.js');

function book(symbol: string, last: number): QuoteDepth {
  return {
    symbol,
    asOf: '2026-09-30T02:00:00.000Z',
    last,
    prevClose: 100,
    open: 100,
    high: last,
    low: 100,
    volume: 1000,
    turnover: 100_000,
    limitUp: 110,
    limitDown: 90,
    bids: [{ price: last, volume: 100 }],
    asks: [{ price: last + 0.01, volume: 100 }],
    auction: false,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('depth channel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stream.depth.clear();
    stream.retain.mockClear();
    stream.release.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('parses depth subscriptions and rejects a missing symbol', () => {
    expect(parseWsMessage({ op: 'sub', key: 'd', kind: 'depth', symbol: '600519.SH' })).toEqual({
      op: 'sub',
      key: 'd',
      kind: 'depth',
      symbol: '600519.SH',
    });
    expect(parseWsMessage({ op: 'sub', key: 'd', kind: 'depth' })).toBeNull();
    expect(parseWsMessage({ op: 'sub', key: 'd', kind: 'depth', symbol: '' })).toBeNull();
  });

  it('pushes the current book, throttles updates for its symbol only, and releases on last unsubscribe', async () => {
    stream.depth.set('600519.SH', book('600519.SH', 101));
    const got: string[] = [];
    const unsub = subscribeDepth('600519.SH', (env) => got.push(env));
    await vi.runAllTimersAsync();
    await flush();
    expect(stream.retain).toHaveBeenCalledWith(['600519.SH']);
    expect(got).toHaveLength(1);
    expect(JSON.parse(got[0])).toMatchObject({ type: 'data', data: { last: 101, limitUp: 110 } });

    stream.push('000001.SZ', 12);
    stream.push('600519.SH', 102);
    stream.push('600519.SH', 103);
    await vi.advanceTimersByTimeAsync(500);
    expect(got).toHaveLength(2);
    expect(JSON.parse(got[1]).data.last).toBe(103);

    // 第二个订阅者直接拿到最近一次
    const second: string[] = [];
    const unsub2 = subscribeDepth('600519.SH', (env) => second.push(env));
    expect(JSON.parse(second[0]).data.last).toBe(103);

    unsub();
    expect(stream.release).not.toHaveBeenCalled();
    unsub2();
    expect(stream.release).toHaveBeenCalledWith(['600519.SH']);
  });

  it('pushes null when the market has no book (stream without getDepth data)', async () => {
    const got: string[] = [];
    const unsub = subscribeDepth('NVDA.US', (env) => got.push(env));
    await flush();
    expect(JSON.parse(got[0])).toEqual({ type: 'data', data: null });
    unsub();
  });
});
