import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandleBar } from '../src/marketdata/candleAggregator.js';
import { parseCnWatchlist, readCnWatchlist } from '../src/marketdata/cnWatchlist.js';
import { longbridgeProvider } from '../src/marketdata/longbridge.js';
import { getProvider, getStream } from '../src/marketdata/registry.js';
import { createRicequantProvider, type BridgeSnapshot } from '../src/marketdata/ricequant.js';
import { RicequantBridgeError } from '../src/marketdata/ricequantBridge.js';
import { RicequantStream } from '../src/marketdata/ricequantStream.js';
import {
  cnBucketStart,
  cnSnapshotFeedsBars,
  isCnActiveWindow,
  isCnOpenAuction,
  parseShanghai,
  rqBarTime,
} from '../src/marketdata/ricequantTime.js';
import { hasAnyWatchlist, readAllWatchlists } from '../src/marketdata/streamRouting.js';

const iso = (label: string) => new Date(parseShanghai(label)).toISOString();

describe('ricequant time rules', () => {
  it('turns minute bar close labels into bar open times', () => {
    expect(rqBarTime('2026-09-30 09:31:00', '1m')).toBe(iso('2026-09-30 09:30:00'));
    expect(rqBarTime('2026-09-30 09:35:00', '5m')).toBe(iso('2026-09-30 09:30:00'));
    expect(rqBarTime('2026-09-30 11:30:00', '5m')).toBe(iso('2026-09-30 11:25:00'));
    expect(rqBarTime('2026-09-30 13:05:00', '5m')).toBe(iso('2026-09-30 13:00:00'));
    expect(rqBarTime('2026-09-30 15:00:00', '15m')).toBe(iso('2026-09-30 14:45:00'));
  });

  it('maps the four hourly bars onto session-aware starts', () => {
    const starts = ['10:30', '11:30', '14:00', '15:00'].map((t) =>
      rqBarTime(`2026-09-30 ${t}:00`, '1h'),
    );
    expect(starts).toEqual(
      ['09:30', '10:30', '13:00', '14:00'].map((t) => iso(`2026-09-30 ${t}:00`)),
    );
  });

  it('stamps day/week/month bars at Shanghai midnight', () => {
    expect(rqBarTime('2026-09-30 00:00:00', 'day')).toBe('2026-09-29T16:00:00.000Z');
    expect(rqBarTime('2026-09-30 00:00:00', 'month')).toBe('2026-09-29T16:00:00.000Z');
  });

  it('buckets auction, lunch and after-close ticks into the adjacent session bar', () => {
    const at = (t: string) => parseShanghai(`2026-09-30 ${t}`);
    expect(cnBucketStart(at('09:25:03'), 5)).toBe(at('09:30:00'));
    expect(cnBucketStart(at('11:30:02'), 5)).toBe(at('11:25:00'));
    expect(cnBucketStart(at('12:10:00'), 60)).toBe(at('10:30:00'));
    expect(cnBucketStart(at('13:00:00'), 60)).toBe(at('13:00:00'));
    expect(cnBucketStart(at('15:00:01'), 5)).toBe(at('14:55:00'));
    expect(cnBucketStart(at('10:44:59'), 15)).toBe(at('10:30:00'));
  });

  it('only lets session snapshots feed bars and flags the open auction', () => {
    const at = (t: string) => parseShanghai(`2026-09-30 ${t}`);
    expect(
      ['09:14:59', '11:31:00', '12:30:00', '15:01:00', '15:10:03'].map((t) =>
        cnSnapshotFeedsBars(at(t)),
      ),
    ).toEqual([false, false, false, false, false]);
    expect(
      ['09:15:00', '09:25:01', '11:30:01', '13:00:01', '15:00:59'].map((t) =>
        cnSnapshotFeedsBars(at(t)),
      ),
    ).toEqual([true, true, true, true, true]);
    expect(isCnOpenAuction(at('09:15:00'))).toBe(true);
    expect(isCnOpenAuction(at('09:29:59'))).toBe(true);
    expect(isCnOpenAuction(at('09:30:00'))).toBe(false);
  });

  it('polls fast only inside weekday trading windows', () => {
    expect(isCnActiveWindow(parseShanghai('2026-09-30 09:20:00'))).toBe(true);
    expect(isCnActiveWindow(parseShanghai('2026-09-30 12:00:00'))).toBe(false);
    expect(isCnActiveWindow(parseShanghai('2026-09-30 14:59:00'))).toBe(true);
    expect(isCnActiveWindow(parseShanghai('2026-09-30 15:05:00'))).toBe(false);
    expect(isCnActiveWindow(parseShanghai('2026-10-03 10:00:00'))).toBe(false);
  });
});

describe('ricequant provider', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is selectable per market without touching the other markets', () => {
    vi.stubEnv('MARKET_PROVIDER_CN', 'ricequant');
    expect(getProvider('CN').name).toBe('ricequant');
    expect(getProvider('US').name).toBe('longbridge');
    expect(getStream('CN')).toBeInstanceOf(RicequantStream);
  });

  it('converts bridge bars and drops bars without prices', async () => {
    const call = vi.fn().mockResolvedValue([
      {
        t: '2026-09-30 14:55:00',
        open: 1,
        high: 2,
        low: 0.5,
        close: 1.5,
        volume: 10,
        turnover: 15,
      },
      {
        t: '2026-09-30 15:00:00',
        open: null,
        high: null,
        low: null,
        close: null,
        volume: 0,
        turnover: 0,
      },
    ]);
    const provider = createRicequantProvider(call);
    const bars = await provider.getKline('600519.SH', '60m', 2);
    expect(call).toHaveBeenCalledWith('kline', { symbol: '600519.SH', period: '1h', count: 2 });
    expect(bars).toEqual([
      { time: iso('2026-09-30 14:00:00'), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    ]);
  });

  it('builds quotes with the longbridge-compatible percentage text', async () => {
    const provider = createRicequantProvider(
      vi.fn().mockResolvedValue([
        {
          symbol: '600519.SH',
          datetime: '2026-09-30 15:00:01',
          last: 1258.62,
          prev_close: 1235.58,
          open: 1,
          high: 1,
          low: 1,
          volume: 5,
          turnover: 100,
        },
        {
          symbol: '000001.SZ',
          datetime: '2026-09-30 15:00:00',
          last: null,
          prev_close: 11,
          open: null,
          high: null,
          low: null,
          volume: 0,
          turnover: 0,
        },
      ]),
    );
    expect(await provider.getQuotes(['600519.SH', '000001.SZ'])).toEqual([
      {
        symbol: '600519.SH',
        last: '1258.62',
        prev_close: '1235.58',
        change_percentage: '1.865',
        turnover: '100',
      },
    ]);
  });

  it('surfaces a missing bridge as a 503 with a setup hint', async () => {
    const provider = createRicequantProvider(
      vi.fn().mockRejectedValue(new RicequantBridgeError('米筐桥脚本不存在', 'BRIDGE_UNAVAILABLE')),
    );
    await expect(provider.getKline('600519.SH', '5m', 10)).rejects.toMatchObject({
      status: 503,
      hint: expect.stringContaining('RQ_PYTHON'),
    });
    expect(await provider.getNews('600519.SH')).toEqual([]);
  });
});

function snap(datetime: string, last: number, volume: number): BridgeSnapshot {
  return {
    symbol: '600519.SH',
    datetime,
    last,
    prev_close: 100,
    open: 100,
    high: last,
    low: last,
    volume,
    turnover: volume * last,
  };
}

describe('ricequant stream', () => {
  function harness(queue: BridgeSnapshot[][]) {
    const fetchSnapshots = vi.fn(async () => queue.shift() ?? []);
    const stream = new RicequantStream({
      fetchSnapshots,
      fetchSeed: async () => undefined,
      now: () => parseShanghai('2026-09-30 10:00:00'),
      schedule: () => 0 as unknown as ReturnType<typeof setTimeout>,
      cancel: () => {},
    });
    return { stream, fetchSnapshots };
  }

  it('publishes quote cells on retain and skips unchanged snapshots', async () => {
    const { stream } = harness([
      [snap('2026-09-30 10:00:00', 101, 1000)],
      [snap('2026-09-30 10:00:00', 101, 1000)],
    ]);
    const seen: number[] = [];
    stream.onUpdate((cell) => seen.push(cell.last));
    await stream.retain(['600519.SH']);
    await stream.poll();
    expect(seen).toEqual([101]);
    expect(stream.getSnapshot('600519.SH')).toMatchObject({ last: 101, regularLast: 101 });
    expect(stream.getSnapshot('600519.SH')?.pct).toBeCloseTo(1, 6);
  });

  it('extends the seeded bar, then opens a new one at the next session bucket', async () => {
    const { stream } = harness([
      [snap('2026-09-30 11:26:00', 101, 1000)],
      [snap('2026-09-30 11:29:30', 103, 1300)],
      [snap('2026-09-30 11:30:02', 102, 1350)],
      [snap('2026-09-30 13:00:03', 104, 1400)],
    ]);
    const bars: CandleBar[] = [];
    stream.subscribeCandlesticks('600519.SH', '5m', (bar) => bars.push(bar), {
      time: iso('2026-09-30 11:25:00'),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 900,
    });
    for (let i = 0; i < 4; i += 1) await stream.poll();

    const last = (n: number) => bars.at(n)!;
    // 第一轮只建立累计量基线，不重复计入种子已含的量
    expect(last(0)).toMatchObject({
      ts: parseShanghai('2026-09-30 11:25:00'),
      close: 101,
      volume: 900,
    });
    expect(last(1)).toMatchObject({ close: 103, high: 103, volume: 1200 });
    // 11:30:02 的收盘回报仍属上午最后一根
    expect(last(2)).toMatchObject({
      ts: parseShanghai('2026-09-30 11:25:00'),
      close: 102,
      volume: 1250,
    });
    expect(last(3)).toMatchObject({
      ts: parseShanghai('2026-09-30 13:00:00'),
      open: 104,
      close: 104,
      volume: 50,
    });
  });

  it('a symbol retained mid-poll gets its own follow-up poll', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchSnapshots = vi.fn(async (symbols: string[]) => {
      if (fetchSnapshots.mock.calls.length === 1) await gate;
      return symbols.map((symbol) => ({ ...snap('2026-09-30 10:00:00', 101, 1), symbol }));
    });
    const stream = new RicequantStream({
      fetchSnapshots,
      now: () => parseShanghai('2026-09-30 12:00:00'),
      schedule: () => 0 as unknown as ReturnType<typeof setTimeout>,
      cancel: () => {},
    });
    const first = stream.retain(['600519.SH']);
    const second = stream.retain(['000001.SZ']);
    release();
    await Promise.all([first, second]);
    expect(stream.getSnapshot('000001.SZ')).toBeDefined();
  });

  it('stops polling a symbol once every holder lets go', async () => {
    const { stream, fetchSnapshots } = harness([[snap('2026-09-30 10:00:00', 101, 1)]]);
    await stream.retain(['600519.SH']);
    const off = stream.subscribeCandlesticks('600519.SH', '15m', () => {});
    await stream.release(['600519.SH']);
    expect(stream.getSnapshot('600519.SH')).toBeDefined();
    off();
    expect(stream.getSnapshot('600519.SH')).toBeUndefined();
    fetchSnapshots.mockClear();
    await stream.poll();
    expect(fetchSnapshots).not.toHaveBeenCalled();
  });
});

describe('cn watchlist file', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('accepts the usual code spellings, comments and duplicates', () => {
    const text = [
      '# 今日涨停股',
      '600519',
      'sz000001  300750.SZ',
      'SH688981,002594',
      '600519.SH # 重复',
      'IF9999',
      '830799',
      '920118',
      '510300 159915 113052 123107',
      '',
    ].join('\n');
    expect(parseCnWatchlist(text)).toEqual([
      '600519.SH',
      '000001.SZ',
      '300750.SZ',
      '688981.SH',
      '002594.SZ',
      '510300.SH',
      '159915.SZ',
      '113052.SH',
      '123107.SZ',
    ]);
  });

  it('treats a missing file as an empty watchlist', async () => {
    expect(await readCnWatchlist('/nonexistent/kansoku/cn-watchlist.txt')).toEqual([]);
  });

  it('merges every provider watchlist and survives one provider failing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kansoku-wl-'));
    const file = path.join(dir, 'cn-watchlist.txt');
    await writeFile(file, '600519\n300750.SZ\n');
    vi.stubEnv('MARKET_PROVIDER_CN', 'ricequant');
    vi.stubEnv('RQ_WATCHLIST_FILE', file);

    const longbridgeWatchlist = vi
      .spyOn(longbridgeProvider, 'getWatchlistSymbols')
      .mockResolvedValue(['AAPL.US', '600519.SH']);
    expect(hasAnyWatchlist()).toBe(true);
    expect(await readAllWatchlists()).toEqual({
      symbols: ['AAPL.US', '600519.SH', '300750.SZ'],
      attempted: 2,
      failures: [],
    });

    longbridgeWatchlist.mockRejectedValue(new Error('longbridge not logged in'));
    expect(await readAllWatchlists()).toEqual({
      symbols: ['600519.SH', '300750.SZ'],
      attempted: 2,
      failures: ['longbridge watchlist — longbridge not logged in'],
    });
  });
});
