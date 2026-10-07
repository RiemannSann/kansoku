import { describe, expect, it, vi } from 'vitest';
import {
  buildSectorBoard,
  buildSectorDetail,
  buildStockIndustry,
  computeSectorStats,
  limitHit,
  type MarketRow,
  type SwMap,
} from '../src/marketdata/cnSectors.js';
import type { QuotaTier } from '../src/marketdata/ricequantGuard.js';
import { createSectorService } from '../src/realtime/cnSectors.js';

const MAP: SwMap = {
  day: '2026-10-08',
  stocks: {
    '000001.SZ': { name: '平安银行', l1: '801780.INDX', l2: '801783.INDX' },
    '600036.SH': { name: '招商银行', l1: '801780.INDX', l2: '801783.INDX' },
    '601398.SH': { name: '工商银行', l1: '801780.INDX', l2: '801782.INDX' },
    '600519.SH': { name: '贵州茅台', l1: '801120.INDX', l2: '801125.INDX' },
    '000858.SZ': { name: '五粮液', l1: '801120.INDX', l2: '801125.INDX' },
  },
  industries: {
    '801780.INDX': { name: '银行', level: 1 },
    '801783.INDX': { name: '股份制银行Ⅱ', level: 2, parent: '801780.INDX' },
    '801782.INDX': { name: '国有大型银行Ⅱ', level: 2, parent: '801780.INDX' },
    '801120.INDX': { name: '食品饮料', level: 1 },
    '801125.INDX': { name: '白酒Ⅱ', level: 2, parent: '801120.INDX' },
  },
};

function row(
  symbol: string,
  last: number,
  prev: number,
  extra: Partial<MarketRow> = {},
): MarketRow {
  return {
    symbol,
    datetime: '2026-10-08 10:00:03',
    last,
    prev_close: prev,
    limit_up: Math.round(prev * 1.1 * 100) / 100,
    limit_down: Math.round(prev * 0.9 * 100) / 100,
    volume: 1000,
    turnover: 1_000_000,
    ...extra,
  };
}

function rowsOf(list: MarketRow[]): Map<string, MarketRow> {
  return new Map(list.map((r) => [r.symbol, r]));
}

const ROWS = rowsOf([
  row('000001.SZ', 12.73, 11.57), // 涨停：11.57 × 1.1 = 12.727 → 12.73
  row('600036.SH', 40, 40),
  row('601398.SH', 5.9, 6),
  row('600519.SH', 1258.62, 1235.58),
  row('000858.SZ', 0, 150, { volume: 0, turnover: 0 }), // 停牌：没有成交价
  row('801780.INDX', 4195.7456, 4142.943, { limit_up: 0, limit_down: 0 }),
]);

describe('limitHit', () => {
  it('recognises limit up / down and ignores indices (limit 0) and suspended rows', () => {
    expect(limitHit(row('X', 12.73, 11.57))).toBe('up');
    expect(limitHit(row('X', 10.41, 11.57))).toBe('down');
    expect(limitHit(row('X', 12.7, 11.57))).toBeNull();
    expect(limitHit(row('X', 100, 99, { limit_up: 0, limit_down: 0 }))).toBeNull();
    expect(limitHit(row('X', 0, 10))).toBeNull();
  });
});

describe('computeSectorStats', () => {
  const snap = computeSectorStats(MAP, ROWS);

  it('counts members, up/down/flat and limit-up per industry', () => {
    const bank = snap.stats.get('801780.INDX')!;
    expect(bank).toMatchObject({ members: 3, up: 1, down: 1, flat: 1, limitUp: 1, limitDown: 0 });
    expect(bank.turnover).toBe(3_000_000);
    expect(bank.leader).toMatchObject({ symbol: '000001.SZ', name: '平安银行' });
    const joint = snap.stats.get('801783.INDX')!;
    expect(joint).toMatchObject({ level: 2, parent: '801780.INDX', members: 2, limitUp: 1 });
  });

  it('takes the 申万 index change when the index snapshot exists', () => {
    const bank = snap.stats.get('801780.INDX')!;
    expect(bank.pctFromIndex).toBe(true);
    expect(bank.pct).toBeCloseTo((4195.7456 / 4142.943 - 1) * 100, 6);
  });

  it('falls back to the simple member average and skips suspended stocks', () => {
    const liquor = snap.stats.get('801125.INDX')!;
    expect(liquor.pctFromIndex).toBe(false);
    expect(liquor.members).toBe(2);
    expect(liquor.up + liquor.down + liquor.flat).toBe(1);
    expect(liquor.pct).toBeCloseTo((1258.62 / 1235.58 - 1) * 100, 6);
  });

  it('uses the newest timestamp as asOf', () => {
    expect(snap.asOf).toBe('2026-10-08 10:00:03');
  });
});

describe('board / detail / stock industry', () => {
  const snap = computeSectorStats(MAP, ROWS);

  it('sorts level-1 by change, keeps level-2 apart and maps requested symbols', () => {
    const board = buildSectorBoard(snap, MAP, ['600519.SH', '510300.SH']);
    expect(board.l1.map((s) => s.name)).toEqual(['食品饮料', '银行']);
    expect(board.l2.every((s) => s.level === 2)).toBe(true);
    expect(board.memberOf).toEqual({ '600519.SH': { l1: '801120.INDX', l2: '801125.INDX' } });
  });

  it('lists members of an industry, strongest first, suspended last', () => {
    const detail = buildSectorDetail(snap, MAP, ROWS, '801780.INDX')!;
    expect(detail.members.map((m) => m.symbol)).toEqual(['000001.SZ', '600036.SH', '601398.SH']);
    expect(detail.members[0]!.limit).toBe('up');
    const liquor = buildSectorDetail(snap, MAP, ROWS, '801125.INDX')!;
    expect(liquor.members.at(-1)).toMatchObject({ symbol: '000858.SZ', last: null, pct: null });
    expect(buildSectorDetail(snap, MAP, ROWS, '999999.INDX')).toBeNull();
  });

  it('gives a stock its level-1 and level-2 stats; ETFs get nulls', () => {
    const own = buildStockIndustry(snap, MAP, '000001.SZ');
    expect(own.l1?.name).toBe('银行');
    expect(own.l2?.name).toBe('股份制银行Ⅱ');
    expect(buildStockIndustry(snap, MAP, '510300.SH')).toMatchObject({ l1: null, l2: null });
  });
});

// 2026-10-08 10:00 北京时间 = 02:00Z，盘中
const ACTIVE = Date.parse('2026-10-08T02:00:00Z');
// 12:00 北京时间，午休
const LUNCH = Date.parse('2026-10-08T04:00:00Z');

function harness(tier: QuotaTier = 'normal', blocked = new Set<string>()) {
  let clock = ACTIVE;
  const state = { tier };
  const call = vi.fn(async (method: string, _params?: Record<string, unknown>) => {
    if (method === 'sw_map') return MAP;
    if (method === 'market_snapshot') return [...ROWS.values()];
    throw new Error(`unexpected ${method}`);
  });
  const service = createSectorService({
    call: call as never,
    guard: {
      blockReason: (m) => (blocked.has(m) ? `blocked ${m}` : null),
      quotaTier: () => state.tier,
      isTradingDay: () => true,
    },
    now: () => clock,
    providerName: () => 'ricequant',
    cachePath: null,
    timers: false,
  });
  const snapshots = () => call.mock.calls.filter(([m]) => m === 'market_snapshot').length;
  return {
    service,
    call,
    snapshots,
    state,
    advance(ms: number) {
      clock += ms;
    },
    set(ms: number) {
      clock = ms;
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('createSectorService', () => {
  it('loads the map once, snapshots every stock plus every industry index, pushes to all kinds', async () => {
    const h = harness();
    const board: string[] = [];
    const detail: string[] = [];
    const own: string[] = [];
    h.service.subscribeBoard(['600519.SH'], (e) => board.push(e));
    await h.service.tick();
    h.service.subscribeSector('801780.INDX', (e) => detail.push(e));
    h.service.subscribeIndustry('000001.SZ', (e) => own.push(e));
    await settle();
    const snapCall = h.call.mock.calls.find(([m]) => m === 'market_snapshot')!;
    expect((snapCall[1] as { symbols: string[] }).symbols).toHaveLength(10);
    expect(JSON.parse(board[0]!).data.memberOf['600519.SH'].l1).toBe('801120.INDX');
    expect(JSON.parse(detail[0]!).data.stat.name).toBe('银行');
    expect(JSON.parse(own[0]!).data.l2.name).toBe('股份制银行Ⅱ');
    expect(h.call.mock.calls.filter(([m]) => m === 'sw_map')).toHaveLength(1);
  });

  it('refreshes every 60 s in normal tier and every 120 s in caution tier', async () => {
    const h = harness();
    h.service.subscribeBoard([], () => {});
    await h.service.tick();
    expect(h.snapshots()).toBe(1);
    h.advance(30_000);
    await h.service.tick();
    expect(h.snapshots()).toBe(1);
    h.advance(30_000);
    await h.service.tick();
    expect(h.snapshots()).toBe(2);
    h.state.tier = 'caution';
    h.advance(60_000);
    await h.service.tick();
    expect(h.snapshots()).toBe(2);
    h.advance(60_000);
    await h.service.tick();
    expect(h.snapshots()).toBe(3);
  });

  it('keeps the last data without error when the quota guard blocks the snapshot', async () => {
    const blocked = new Set<string>();
    const h = harness('normal', blocked);
    const got: string[] = [];
    h.service.subscribeBoard([], (e) => got.push(e));
    await h.service.tick();
    blocked.add('market_snapshot');
    h.state.tier = 'saving';
    h.advance(120_000);
    await h.service.tick();
    expect(h.snapshots()).toBe(1);
    expect(got.some((e) => JSON.parse(e).type === 'status')).toBe(false);
  });

  it('reports degraded when blocked before any data exists', async () => {
    const h = harness('saving', new Set(['market_snapshot']));
    const got: string[] = [];
    h.service.subscribeBoard([], (e) => got.push(e));
    await h.service.tick();
    expect(JSON.parse(got.at(-1)!)).toMatchObject({ type: 'status', degraded: true });
  });

  it('pulls once more right after leaving the session, then stops polling', async () => {
    const h = harness();
    h.service.subscribeBoard([], () => {});
    await h.service.tick();
    h.set(LUNCH);
    await h.service.tick();
    expect(h.snapshots()).toBe(2);
    h.advance(10 * 60_000);
    await h.service.tick();
    expect(h.snapshots()).toBe(2);
  });

  it('degrades with a clear message when A-shares are not on ricequant', async () => {
    const service = createSectorService({
      call: vi.fn() as never,
      guard: { blockReason: () => null, quotaTier: () => 'normal', isTradingDay: () => true },
      now: () => ACTIVE,
      providerName: () => 'longbridge',
      cachePath: null,
      timers: false,
    });
    const got: string[] = [];
    service.subscribeIndustry('600519.SH', (e) => got.push(e));
    await service.tick();
    expect(JSON.parse(got.at(-1)!).error).toMatch(/米筐/);
  });
});

describe('cn sector channel messages', () => {
  it('parses the three kinds and rejects a missing symbol', async () => {
    const { parseWsMessage } = await import('../src/realtime/channelProtocol.js');
    expect(
      parseWsMessage({ op: 'sub', key: 'a', kind: 'cn-sectors', extra: ['600519.SH', 3] }),
    ).toEqual({ op: 'sub', key: 'a', kind: 'cn-sectors', extra: ['600519.SH'] });
    expect(
      parseWsMessage({ op: 'sub', key: 'b', kind: 'cn-sector', symbol: '801780.INDX' }),
    ).toEqual({ op: 'sub', key: 'b', kind: 'cn-sector', symbol: '801780.INDX' });
    expect(parseWsMessage({ op: 'sub', key: 'c', kind: 'cn-industry' })).toBeNull();
  });
});
