import { describe, expect, it } from 'vitest';
import type { QuoteCell, QuoteDepth, RawBar } from '@kansoku/shared/types';
import {
  evaluateLiveCheck,
  formatCheckTable,
  livePhase,
  type LiveObservation,
} from '../src/marketdata/liveCheck.js';
import { parseShanghai } from '../src/marketdata/ricequantTime.js';

const DAY = '2026-10-08';
const t = (clock: string, day = DAY) => parseShanghai(`${day} ${clock}`);
const iso = (clock: string, day = DAY) => new Date(t(clock, day)).toISOString();
const bar = (clock: string, open: number, close = open, day = DAY): RawBar => ({
  time: iso(clock, day),
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
  volume: 100,
});

function cell(clock: string, last: number, extra: Partial<QuoteCell> = {}): QuoteCell {
  return {
    symbol: '600519.SH',
    session: '日盘',
    last,
    pct: 0,
    regularLast: last,
    regularPct: 0,
    limitUp: 1384.48,
    limitDown: 1132.76,
    asOf: iso(clock),
    ...extra,
  };
}

function depth(level: number, open: number | null = 1260): QuoteDepth {
  const side = Array.from({ length: level }, (_, i) => ({ price: 1260 + i * 0.01, volume: 100 }));
  return {
    symbol: '600519.SH',
    asOf: iso('10:00:00'),
    last: 1260,
    prevClose: 1258.62,
    open,
    high: 1265,
    low: 1255,
    volume: 1000,
    turnover: 1_260_000,
    limitUp: 1384.48,
    limitDown: 1132.76,
    bids: side,
    asks: side,
    auction: false,
  };
}

function obs(
  now: number,
  over: Partial<LiveObservation> = {},
  sample: Partial<LiveObservation['sample']> = {},
): LiveObservation {
  return {
    now,
    tradingDay: true,
    tier: 'normal',
    usedStart: 1_000_000,
    usedEnd: 1_100_000,
    limit: 15 * 1024 ** 3,
    pollIntervalMs: 3_000,
    watchCount: 136,
    snapshotCount: 136,
    firstRoundMs: 1_200,
    sample: {
      symbol: '600519.SH',
      cell: cell('10:00:00', 1260),
      depth: depth(5),
      bars5m: [
        bar('14:55:00', 1258, 1258.62, '2026-09-30'),
        bar('09:30:00', 1260),
        bar('09:35:00', 1261),
      ],
      kline1m: [bar('09:59:00', 1260)],
      klineDay: [bar('00:00:00', 1258.62, 1258.62, '2026-09-30'), bar('00:00:00', 1260)],
      timeshare: {
        symbol: '600519.SH',
        date: DAY,
        prevClose: 1258.62,
        points: [{ slot: 0, price: 1260, avg: 1260, volume: 1 }],
        partial: false,
        asOf: null,
      },
      ...sample,
    },
    index: {
      symbol: '000001.SH',
      cell: {
        ...cell('10:00:00', 3300),
        symbol: '000001.SH',
        limitUp: undefined,
        limitDown: undefined,
      },
    },
    warnings: [],
    ...over,
  };
}

const verdicts = (o: LiveObservation) =>
  Object.fromEntries(evaluateLiveCheck(o).map((r) => [r.name, r.verdict]));

describe('livePhase', () => {
  it('splits the Beijing trading day into checking phases', () => {
    expect(livePhase(t('09:10:00'), true)).toBe('pre');
    expect(livePhase(t('09:20:00'), true)).toBe('auction');
    expect(livePhase(t('09:27:00'), true)).toBe('matched');
    expect(livePhase(t('10:00:00'), true)).toBe('am');
    expect(livePhase(t('12:00:00'), true)).toBe('lunch');
    expect(livePhase(t('14:00:00'), true)).toBe('pm');
    expect(livePhase(t('15:05:00'), true)).toBe('closed');
    expect(livePhase(t('10:00:00', '2026-10-07'), false)).toBe('holiday');
    expect(livePhase(t('10:00:00', '2026-10-10'), null)).toBe('holiday'); // 周六
  });
});

describe('evaluateLiveCheck', () => {
  it('passes a healthy 10:00 morning', () => {
    const v = verdicts(obs(t('10:00:05')));
    expect(v).toMatchObject({
      '米筐桥连通': '通过',
      '交易日历': '通过',
      '额度已用': '通过',
      '轮询间隔': '通过',
      '快照覆盖自选': '通过',
      '运行中报错': '通过',
      '涨跌停价': '通过',
      '报价新鲜': '通过',
      '第一根 K 线': '通过',
      '当天 1 分钟线': '通过',
      '当天日 K': '通过',
      '分时图': '通过',
      '五档盘口': '通过',
    });
    expect(Object.values(v)).not.toContain('失败');
  });

  it('flags the biggest unknown: no current-day minute bars → 当天 1 分钟线 and 分时 fail', () => {
    const v = verdicts(
      obs(
        t('10:00:05'),
        {},
        {
          kline1m: [bar('14:59:00', 1258, 1258, '2026-09-30')],
          timeshare: {
            symbol: '600519.SH',
            date: DAY,
            prevClose: 1258.62,
            points: [{ slot: 30, price: 1260, avg: 1260, volume: 0 }],
            partial: true,
            asOf: null,
          },
        },
      ),
    );
    expect(v['当天 1 分钟线']).toBe('失败');
    expect(v['分时图']).toBe('失败');
    const table = formatCheckTable(evaluateLiveCheck(obs(t('10:00:05'), {}, { kline1m: [] })));
    expect(table).toContain('| 当天 1 分钟线 | 失败 |');
    expect(table).toMatch(/失败 \d+ 项/);
  });

  it('stale minute bars during continuous trading fail', () => {
    expect(
      verdicts(obs(t('10:30:00'), {}, { cell: cell('10:29:58', 1260) }))['当天 1 分钟线'],
    ).toBe('失败');
  });

  it('09:10: checks reset and slow polling, skips intraday items', () => {
    const v = verdicts(
      obs(
        t('09:10:00'),
        { pollIntervalMs: 60_000, usedEnd: 100_000 },
        { bars5m: [], kline1m: [], timeshare: null },
      ),
    );
    expect(v).toMatchObject({ 轮询间隔: '通过', 额度按天重置: '通过', 报价新鲜: '跳过' });
    expect(v['第一根 K 线']).toBeUndefined();
    expect(verdicts(obs(t('09:10:00'), { pollIntervalMs: 3_000 }))['轮询间隔']).toBe('失败');
    expect(
      verdicts(obs(t('09:10:00'), { pollIntervalMs: 60_000, usedEnd: 0.02 * 15 * 1024 ** 3 }))[
        '额度按天重置'
      ],
    ).toBe('提示');
  });

  it('auction: indicative price shown and no bar for today yet', () => {
    const auctionDepth = {
      ...depth(1),
      bids: [{ price: 1262, volume: 500 }],
      asks: [{ price: 1262, volume: 500 }],
    };
    const base = { cell: cell('09:20:00', 1262, { session: '集合竞价' }), depth: auctionDepth };
    const ok = verdicts(
      obs(t('09:20:05'), {}, { ...base, bars5m: [bar('14:55:00', 1258, 1258.62, '2026-09-30')] }),
    );
    expect(ok).toMatchObject({ '竞价显示': '通过', '竞价不开 K 线': '通过' });
    const polluted = verdicts(
      obs(t('09:20:05'), {}, { ...base, bars5m: [bar('09:30:00', 1258.62)] }),
    );
    expect(polluted['竞价不开 K 线']).toBe('失败');
    const stillPrevClose = verdicts(
      obs(t('09:20:05'), {}, { ...base, cell: cell('09:20:00', 1258.62) }),
    );
    expect(stillPrevClose['竞价显示']).toBe('失败');
  });

  it('first bar must open at the snapshot open', () => {
    expect(verdicts(obs(t('10:00:05'), {}, { depth: depth(5, 1258.62) }))['第一根 K 线']).toBe(
      '失败',
    );
  });

  it('lunch: slower polling and no fake bars', () => {
    const lunch = obs(
      t('12:00:00'),
      { pollIntervalMs: 60_000 },
      {
        cell: cell('11:30:01', 1260),
        kline1m: [bar('11:29:00', 1260)],
      },
    );
    expect(verdicts(lunch)).toMatchObject({
      '轮询间隔': '通过',
      '午休无假 K 线': '通过',
    });
    const fake = {
      ...lunch,
      sample: {
        ...lunch.sample,
        bars5m: [...lunch.sample.bars5m, bar('11:30:00', 1260), bar('12:00:00', 1260)],
      },
    };
    expect(verdicts(fake)['午休无假 K 线']).toBe('失败');
  });

  it('after the close: last bar 14:55 closes at the last price', () => {
    const closed = obs(
      t('15:05:00'),
      { pollIntervalMs: 300_000 },
      {
        cell: cell('15:00:02', 1262),
        bars5m: [bar('09:30:00', 1260), bar('14:55:00', 1261, 1262)],
        kline1m: [bar('14:59:00', 1262)],
      },
    );
    expect(verdicts(closed)).toMatchObject({ 收盘定格: '通过', 轮询间隔: '通过' });
    const moving = {
      ...closed,
      sample: { ...closed.sample, bars5m: [bar('09:30:00', 1260), bar('15:00:00', 1262)] },
    };
    expect(verdicts(moving)['收盘定格']).toBe('失败');
  });

  it('holiday: notes it and skips intraday items; failures elsewhere still count', () => {
    const v = verdicts(
      obs(t('10:00:00', '2026-10-07'), { tradingDay: false, pollIntervalMs: 300_000 }),
    );
    expect(v).toMatchObject({ 交易日历: '提示', 轮询间隔: '通过', 盘中各项: '跳过' });
    const broken = verdicts(
      obs(t('10:00:00', '2026-10-07'), {
        tradingDay: false,
        pollIntervalMs: 300_000,
        firstRoundMs: null,
        snapshotCount: 0,
        warnings: ['[ricequant] snapshot poll failed: timeout'],
      }),
    );
    expect(broken).toMatchObject({ 米筐桥连通: '失败', 快照覆盖自选: '失败', 运行中报错: '失败' });
  });

  it('quota at or above half the daily limit fails', () => {
    expect(
      verdicts(
        obs(t('10:00:05'), {
          usedEnd: 0.6 * 15 * 1024 ** 3,
          tier: 'caution',
          pollIntervalMs: 6_000,
        }),
      ),
    ).toMatchObject({
      额度已用: '失败',
      轮询间隔: '通过',
    });
  });

  it('index carrying limit prices, or stock without, fails 涨跌停价', () => {
    expect(
      verdicts(obs(t('10:00:05'), {}, { cell: cell('10:00:00', 1260, { limitUp: undefined }) }))[
        '涨跌停价'
      ],
    ).toBe('失败');
  });
});
