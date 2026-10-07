import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuoteCell } from '@kansoku/shared/types';
import type { LiveSellerOut } from '../src/contract/positions.js';

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
vi.mock('../src/liveSeller/liveSeller.js', () => ({ fetchLiveSeller }));

const {
  cnHoldingFrom,
  cnRawPosition,
  parseNumberCell,
  parsePercentCell,
  resetLiveSellerCacheForTests,
} = await import('../src/liveSeller/holding.js');
const { subscribePosition } = await import('../src/realtime/position.js');

function row(cells: string[]) {
  return { cells, style: '', cellStyles: [], symbol: null as string | null };
}

// 表头和看板 live_view_web.py 的 _sections_payload 一致（两台服务器 OS / OS3）
const SNAPSHOT: LiveSellerOut = {
  connected: true,
  url: 'http://127.0.0.1:8766',
  updatedAt: '10:31:05 CST',
  dataAgeSeconds: 1,
  degraded: { level: 'ok', reason: '' },
  lastError: '',
  warnings: [],
  summary: { headers: [], rows: [], caption: '' },
  sections: {
    buy: {
      headers: [
        'Code',
        'Name',
        'Lane',
        'OS Buy Qty',
        'OS3 Buy Qty',
        'Notional',
        'Avg Px',
        'Last',
        'Ret',
        'Now%',
      ],
      rows: [
        {
          ...row([
            '600487',
            '亨通光电',
            'LU',
            '1,000',
            '500',
            '30,150',
            '20.10',
            '20.50',
            '+1.99%',
            '+3.00%',
          ]),
          symbol: '600487.SH',
        },
      ],
      count: 1,
    },
    intent: { headers: ['Code', 'Name', 'Side', 'Cur', 'Time', 'Status'], rows: [], count: 0 },
    sold: {
      headers: [
        'Key',
        'Code',
        'Name',
        'OS Rem/Init',
        'OS3 Rem/Init',
        'Notional',
        'Avg Px',
        'Last',
        'Prev',
        'Decision Review',
        'Ret',
        'Now%',
      ],
      rows: [
        {
          ...row([
            'a',
            '600487',
            '亨通光电',
            '200/2,000',
            '-',
            '4,100',
            '19.00',
            '20.50',
            'U',
            '-',
            '+7.89%',
            '+3.00%',
          ]),
          symbol: '600487.SH',
        },
      ],
      count: 1,
    },
    available: {
      headers: [
        'Key',
        'Code',
        'Name',
        'OS Rem/Init',
        'OS3 Rem/Init',
        'Notional',
        'Prev',
        'Decision Review',
        'EstNow%',
      ],
      rows: [
        {
          ...row([
            'b',
            '000001',
            '平安银行',
            '3,000/3,000',
            '1,000/1,000',
            '46,280',
            'Z',
            '-',
            '+0.10%',
          ]),
          symbol: '000001.SZ',
        },
      ],
      count: 1,
    },
  },
};

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
    const holding = cnHoldingFrom(SNAPSHOT, '600487.SH');
    expect(holding.connected).toBe(true);
    expect(holding.parts).toEqual([
      {
        section: 'buy',
        label: '今日买入',
        shares: 1500,
        avgPx: 20.1,
        notional: 30150,
        retPct: 1.99,
      },
      { section: 'sold', label: '清仓中', shares: 200, avgPx: 19, notional: 4100, retPct: 7.89 },
    ]);
    const avail = cnHoldingFrom(SNAPSHOT, '000001.SZ').parts;
    expect(avail).toEqual([
      {
        section: 'available',
        label: '可卖',
        shares: 4000,
        avgPx: null,
        notional: 46280,
        retPct: 0.1,
      },
    ]);
  });

  it('builds a cost-weighted position only from parts that carry an average price', () => {
    const raw = cnRawPosition(cnHoldingFrom(SNAPSHOT, '600487.SH'), '600487.SH');
    expect(Number(raw!.quantity)).toBe(1700);
    expect(Number(raw!.cost_price)).toBeCloseTo((1500 * 20.1 + 200 * 19) / 1700, 6);
    expect(cnRawPosition(cnHoldingFrom(SNAPSHOT, '000001.SZ'), '000001.SZ')).toBeNull();
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

describe('position channel for A-shares', () => {
  it('reads StockSeller instead of Longbridge and uses the CN provider for volume', async () => {
    fetchLiveSeller.mockResolvedValue(SNAPSHOT);
    stream.snapshots.set('600487.SH', {
      symbol: '600487.SH',
      session: '日盘',
      last: 21,
      pct: 0,
      regularLast: 21,
      regularPct: 0,
    });
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
    stream.snapshots.set('MU.US', {
      symbol: 'MU.US',
      session: '日盘',
      last: 100,
      pct: 0,
      regularLast: 100,
      regularPct: 0,
    });
    const unsub = subscribePosition('MU.US', () => {});
    await settle();
    unsub();
    expect(provider.getPositions).toHaveBeenCalled();
    expect(fetchLiveSeller).not.toHaveBeenCalled();
  });
});
