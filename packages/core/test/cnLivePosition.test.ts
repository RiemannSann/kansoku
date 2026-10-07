import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuoteCell } from '@kansoku/shared/types';

const provider = vi.hoisted(() => ({
  name: 'mock',
  capabilities: new Set<string>(),
  getKline: vi.fn().mockResolvedValue([]),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
  getPositions: vi.fn().mockResolvedValue([]),
}));
const markets = vi.hoisted(() => [] as Array<string | undefined>);

const stream = vi.hoisted(() => {
  const snapshots = new Map<string, QuoteCell>();
  return {
    snapshots,
    retain: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn(() => () => {}),
    getSnapshot: vi.fn((symbol: string) => snapshots.get(symbol)),
  };
});

const fetchLiveSeller = vi.hoisted(() => vi.fn());

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: (market?: string) => {
    markets.push(market);
    return provider;
  },
  getStream: () => stream,
}));
vi.mock('../src/cockpit/entryPlan.js', () => ({
  latestIntradayDoc: vi.fn().mockResolvedValue(null),
  entryPlanFromDoc: vi.fn(() => null),
}));
vi.mock('../src/liveSeller/liveSeller.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/liveSeller/liveSeller.js')>()),
  fetchLiveSeller,
}));

const { parseLiveSellerSnapshot } = await import('../src/liveSeller/liveSeller.js');
const {
  cnHoldingFrom,
  cnRawPosition,
  parseNumberCell,
  parsePercentCell,
  resetLiveSellerCacheForTests,
} = await import('../src/liveSeller/holding.js');
const { subscribePosition } = await import('../src/realtime/position.js');

// 样本由 StockSeller 自己的 live_view_web.snapshot_payload 生成（见 fixtures/stockseller/gen_snapshot_fixture.py），
// 是看板 GET /api/snapshot 的真实格式：完整模式、集合竞价时多出 Src / Auc 列、精简模式（--compact）三种
function fixture(name: 'full' | 'auction' | 'compact') {
  const raw: unknown = JSON.parse(
    readFileSync(new URL(`./fixtures/stockseller/snapshot-${name}.json`, import.meta.url), 'utf8'),
  );
  return parseLiveSellerSnapshot('http://127.0.0.1:8766', raw);
}

const FULL = fixture('full');

afterEach(() => {
  resetLiveSellerCacheForTests();
  fetchLiveSeller.mockReset();
  provider.getPositions.mockClear();
  markets.length = 0;
});

describe('StockSeller holding parser', () => {
  it('parses the dashboard text cells back into numbers', () => {
    expect(parseNumberCell('1,234,567')).toBe(1234567);
    expect(parseNumberCell('-')).toBeNull();
    expect(parsePercentCell('+0.67%')).toBe(0.67);
    expect(parsePercentCell('-1.20%')).toBe(-1.2);
  });

  it('collects every section a symbol shows up in, summing per-server quantities', () => {
    const holding = cnHoldingFrom(FULL, '600487.SH');
    expect(holding).toMatchObject({ connected: true, updatedAt: '10:31:05 CST' });
    expect(holding.parts).toEqual([
      {
        section: 'buy',
        label: '今日买入',
        shares: 1500,
        sharesEstimated: false,
        avgPx: 20.1,
        notional: 30150,
        retPct: 1.99,
      },
      {
        section: 'sold',
        label: '清仓中',
        shares: 200,
        sharesEstimated: false,
        avgPx: 19,
        notional: 4100,
        retPct: 7.89,
      },
    ]);
    expect(cnHoldingFrom(FULL, '000001.SZ').parts).toEqual([
      {
        section: 'available',
        label: '可卖',
        shares: 4000,
        sharesEstimated: false,
        avgPx: null,
        notional: 46280,
        retPct: 0.1,
      },
    ]);
  });

  it('keeps three-decimal ETF prices and one-server rows', () => {
    expect(cnHoldingFrom(FULL, '510300.SH').parts[0]).toMatchObject({
      shares: 20000,
      avgPx: 4.623,
      retPct: -0.26,
    });
  });

  it('reads the same numbers during the call auction, when Src / Auc columns shift the layout', () => {
    const auction = fixture('auction');
    expect(cnHoldingFrom(auction, '600487.SH')).toEqual(cnHoldingFrom(FULL, '600487.SH'));
    expect(cnHoldingFrom(auction, '000001.SZ')).toEqual(cnHoldingFrom(FULL, '000001.SZ'));
  });

  it('estimates shares in compact mode, where per-server quantity columns are absent', () => {
    const compact = fixture('compact');
    const parts = cnHoldingFrom(compact, '600487.SH').parts;
    expect(parts.map((p) => [p.section, p.shares, p.sharesEstimated])).toEqual([
      ['buy', 1500, true],
      ['sold', 200, true],
    ]);
    // 可卖表没有价格列，推不出股数
    expect(cnHoldingFrom(compact, '000001.SZ').parts[0]).toMatchObject({
      shares: null,
      sharesEstimated: false,
    });
  });

  it('builds a cost-weighted position only from parts that carry an average price', () => {
    const raw = cnRawPosition(cnHoldingFrom(FULL, '600487.SH'), '600487.SH');
    expect(Number(raw!.quantity)).toBe(1700);
    expect(Number(raw!.cost_price)).toBeCloseTo((1500 * 20.1 + 200 * 19) / 1700, 6);
    expect(cnRawPosition(cnHoldingFrom(FULL, '000001.SZ'), '000001.SZ')).toBeNull();
  });

  it('never carries the command log through', () => {
    expect(JSON.stringify(FULL)).not.toContain('command log');
  });

  it('reports a closed dashboard as not connected', () => {
    expect(
      cnHoldingFrom({ connected: false, url: 'x', error: 'ECONNREFUSED' }, '600487.SH'),
    ).toEqual({ connected: false, updatedAt: null, parts: [] });
  });
});

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function quote(symbol: string, last: number): QuoteCell {
  return { symbol, session: '日盘', last, pct: 0, regularLast: last, regularPct: 0 };
}

describe('position channel for A-shares', () => {
  it('reads StockSeller instead of Longbridge and uses the CN provider for volume', async () => {
    fetchLiveSeller.mockResolvedValue(FULL);
    stream.snapshots.set('600487.SH', quote('600487.SH', 21));
    const got: string[] = [];
    const unsub = subscribePosition('600487.SH', (e) => got.push(e));
    await settle();
    unsub();
    expect(provider.getPositions).not.toHaveBeenCalled();
    expect(fetchLiveSeller).toHaveBeenCalledTimes(1);
    expect(markets).toContain('CN');
    const data = JSON.parse(got.at(-1)!).data;
    expect(data.cnLive.parts).toHaveLength(2);
    expect(data.position).toMatchObject({ symbol: '600487.SH', shares: 1700, last: 21 });
  });

  it('keeps US symbols on the broker positions', async () => {
    stream.snapshots.set('MU.US', quote('MU.US', 100));
    const unsub = subscribePosition('MU.US', () => {});
    await settle();
    unsub();
    expect(provider.getPositions).toHaveBeenCalled();
    expect(fetchLiveSeller).not.toHaveBeenCalled();
  });
});
