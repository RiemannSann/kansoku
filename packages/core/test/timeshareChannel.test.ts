import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteCell, RawBar } from '@kansoku/shared/types';

const mocks = vi.hoisted(() => {
  const listeners = new Set<(cell: QuoteCell) => void>();
  const snapshots = new Map<string, QuoteCell>();
  return {
    listeners,
    snapshots,
    stream: {
      retain: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      onUpdate: vi.fn((cb: (cell: QuoteCell) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      }),
      getSnapshot: vi.fn((symbol: string) => snapshots.get(symbol)),
      getDepth: vi.fn(() => ({ prevClose: 100 })),
    },
    provider: { getKline: vi.fn() },
  };
});

vi.mock('../src/marketdata/registry.js', () => ({
  getStream: () => mocks.stream,
  getProvider: () => mocks.provider,
}));
vi.mock('../src/marketdata/ricequantGuard.js', () => ({
  getRicequantGuard: () => ({ isTradingDay: () => true }),
}));

const { subscribeTimeshare } = await import('../src/realtime/timeshare.js');
const { parseWsMessage } = await import('../src/realtime/channelProtocol.js');

const iso = (clock: string) => new Date(`${clock}+08:00`).toISOString();
const bar = (clock: string, close: number, volume: number): RawBar => ({
  time: iso(clock),
  open: close,
  high: close,
  low: close,
  close,
  volume,
  turnover: close * volume,
});
const cell = (clock: string, last: number, volume: number): QuoteCell => ({
  symbol: '600519.SH',
  session: '日盘',
  last,
  pct: 0,
  regularLast: last,
  regularPct: 0,
  volume,
  turnover: last * volume,
  asOf: iso(clock),
});
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('timeshare channel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    mocks.provider.getKline.mockImplementation(async (_s: string, period: string) =>
      period === '1m'
        ? [bar('2026-09-30T09:30:00', 101, 1000), bar('2026-09-30T09:31:00', 102, 500)]
        : [bar('2026-09-29T00:00:00', 100, 1), bar('2026-09-30T00:00:00', 102, 1)],
    );
  });
  afterEach(() => vi.useRealTimers());

  it('parses subscriptions', () => {
    expect(parseWsMessage({ op: 'sub', key: 't', kind: 'timeshare', symbol: '600519.SH' })).toEqual(
      {
        op: 'sub',
        key: 't',
        kind: 'timeshare',
        symbol: '600519.SH',
      },
    );
    expect(parseWsMessage({ op: 'sub', key: 't', kind: 'timeshare' })).toBeNull();
  });

  it('pushes the 1m-bar chart, then extends it with live quotes', async () => {
    const got: string[] = [];
    const unsub = subscribeTimeshare('600519.SH', (env) => got.push(env));
    await flush();
    const first = JSON.parse(got.at(-1)!).data;
    expect(first).toMatchObject({ date: '2026-09-30', prevClose: 100, partial: false });
    expect(first.points.map((p: { slot: number }) => p.slot)).toEqual([0, 1]);
    // 分时不复权
    for (const args of mocks.provider.getKline.mock.calls) expect(args[4]).toBe('none');

    for (const l of mocks.listeners) l(cell('2026-09-30T09:32:10', 103, 1600));
    await vi.advanceTimersByTimeAsync(1_000);
    const next = JSON.parse(got.at(-1)!).data;
    expect(next.points.at(-1)).toMatchObject({ slot: 2, price: 103, volume: 100 });

    unsub();
    expect(mocks.stream.release).toHaveBeenCalledWith(['600519.SH']);
  });
});
