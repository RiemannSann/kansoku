import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketRow, SwMap } from '../src/marketdata/cnSectors.js';
import type { BridgeSnapshot } from '../src/marketdata/ricequant.js';
import type { QuotaTier, RicequantGuard as Guard } from '../src/marketdata/ricequantGuard.js';
import type { RicequantStream as Stream } from '../src/marketdata/ricequantStream.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';

// 米筐流量四档降级时，今天新增的几个 A 股实时频道各自怎么降：
// 真的流量保护（RicequantGuard）+ 真的快照轮询（RicequantStream）+ 真的米筐行情源，
// 只把最底下的 Python 桥换成假的，按档位返回「今日已用」，再数各频道实际发出的请求。
//
//   档位      已用    报价/盘口轮询   单次快照只数   分时 1 分钟线       申万行业全市场快照
//   normal   <50%    3 秒            400            每分钟 240 根       60 秒
//   caution  ≥50%    6 秒            300            每分钟 240 根       120 秒
//   saving   ≥75%    15 秒           200            每分钟 240 根       停（保留最后一份）
//   stop     ≥90%    60 秒           100            每分钟 240 根       停（保留最后一份）

const h = vi.hoisted(() => ({
  provider: null as unknown as MarketDataProvider,
  stream: null as unknown as Stream,
  guard: null as unknown as Guard,
}));

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => h.provider,
  getStream: () => h.stream,
}));
vi.mock('../src/marketdata/ricequantGuard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/marketdata/ricequantGuard.js')>()),
  getRicequantGuard: () => h.guard,
}));

const { RicequantGuard } = await import('../src/marketdata/ricequantGuard.js');
const { RicequantStream } = await import('../src/marketdata/ricequantStream.js');
const { createRicequantProvider } = await import('../src/marketdata/ricequant.js');
const { subscribeDepth } = await import('../src/realtime/depth.js');
const { subscribeTimeshare } = await import('../src/realtime/timeshare.js');
const { createSectorService } = await import('../src/realtime/cnSectors.js');

// 2026-10-08 周四 10:30 北京时间，盘中
const ACTIVE = Date.parse('2026-10-08T10:30:00+08:00');
const LIMIT = 1_000_000_000;
const USED_RATIO: Record<QuotaTier, number> = {
  normal: 0.1,
  caution: 0.6,
  saving: 0.8,
  stop: 0.95,
};
const TIERS: QuotaTier[] = ['normal', 'caution', 'saving', 'stop'];

const MAP: SwMap = {
  day: '2026-10-08',
  stocks: {
    '600487.SH': { name: '亨通光电', l1: '801770.INDX', l2: '801102.INDX' },
    '000063.SZ': { name: '中兴通讯', l1: '801770.INDX', l2: '801102.INDX' },
  },
  industries: {
    '801770.INDX': { name: '通信', level: 1 },
    '801102.INDX': { name: '通信设备', level: 2, parent: '801770.INDX' },
  },
};

function shanghaiClock(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
}

interface Call {
  method: string;
  params: Record<string, unknown>;
}

/** 假的 Python 桥：ping 按 used.ratio 报用量；快照每轮价格都动一点，好让盘口有新数据可推 */
function fakeBridge(used: { ratio: number }) {
  const calls: Call[] = [];
  let round = 0;
  const call = async <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    calls.push({ method, params });
    round += 1;
    const out = (() => {
      switch (method) {
        case 'ping': {
          return { bytes_used: used.ratio * LIMIT, bytes_limit: LIMIT };
        }
        case 'calendar': {
          return { today: '2026-10-08', is_trading_day: true };
        }
        case 'snapshot': {
          return (params.symbols as string[]).map((symbol): BridgeSnapshot => ({
            symbol,
            datetime: shanghaiClock(Date.now()),
            last: 50 + round / 100,
            prev_close: 50,
            open: 50,
            high: 51,
            low: 49,
            volume: 1_000 + round,
            turnover: 50_000 + round,
            bids: [49.99, 49.98, 49.97, 49.96, 49.95],
            bid_vols: [100, 200, 300, 400, 500],
            asks: [50.01, 50.02, 50.03, 50.04, 50.05],
            ask_vols: [100, 200, 300, 400, 500],
          }));
        }
        case 'kline': {
          // 日线给一根昨收（分时据此算涨跌），分钟线内容和档位无关，给空
          return params.period === 'day'
            ? [
                {
                  t: '2026-09-30 00:00:00',
                  open: 50,
                  high: 50,
                  low: 50,
                  close: 50,
                  volume: 1,
                  turnover: 1,
                },
              ]
            : [];
        }
        case 'sw_map': {
          return MAP;
        }
        case 'market_snapshot': {
          return [...Object.keys(MAP.stocks), ...Object.keys(MAP.industries)].map(
            (symbol): MarketRow => ({
              symbol,
              datetime: shanghaiClock(Date.now()),
              last: 10 + round / 100,
              prev_close: 10,
              limit_up: 11,
              limit_down: 9,
              volume: 1_000,
              turnover: 10_000,
            }),
          );
        }
        default: {
          throw new Error(`unexpected bridge call ${method}`);
        }
      }
    })();
    return out as T;
  };
  const count = (method: string) => calls.filter((c) => c.method === method).length;
  return { call, calls, count };
}

async function setup(tier: QuotaTier) {
  const used = { ratio: USED_RATIO[tier] };
  const bridge = fakeBridge(used);
  const guard = new RicequantGuard({ call: bridge.call, log: () => {} });
  await guard.refresh();
  expect(guard.quotaTier()).toBe(tier);
  h.guard = guard;
  h.provider = createRicequantProvider(bridge.call, guard);
  h.stream = new RicequantStream({
    fetchSnapshots: (symbols) => bridge.call<BridgeSnapshot[]>('snapshot', { symbols }),
    fetchSeed: async () => undefined,
    policy: guard,
  });
  return { used, bridge, guard };
}

const snapshotSizes = (calls: Call[]) =>
  calls.filter((c) => c.method === 'snapshot').map((c) => (c.params.symbols as string[]).length);

beforeEach(() => {
  vi.useFakeTimers({ now: ACTIVE });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A 股实时频道在流量四档下的降级', () => {
  const pollsPerMinute: Record<QuotaTier, number> = { normal: 20, caution: 10, saving: 4, stop: 1 };
  const snapshotCap: Record<QuotaTier, number> = {
    normal: 400,
    caution: 300,
    saving: 200,
    stop: 100,
  };

  it.each(TIERS)('%s：报价轮询放慢，单次快照只数封顶（自选 450 只）', async (tier) => {
    const { bridge } = await setup(tier);
    const watchlist = Array.from({ length: 450 }, (_, i) => `${600000 + i}.SH`);
    await h.stream.retain(watchlist);
    bridge.calls.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    const sizes = snapshotSizes(bridge.calls);
    expect(sizes).toHaveLength(pollsPerMinute[tier]);
    expect(Math.max(...sizes)).toBe(snapshotCap[tier]);
    await h.stream.release(watchlist);
  });

  it('stop：自选超过 100 只时轮流带，但开着图的那只每轮都在', async () => {
    const { bridge } = await setup('stop');
    const watchlist = Array.from({ length: 450 }, (_, i) => `${600000 + i}.SH`);
    await h.stream.retain(watchlist);
    const unsub = h.stream.subscribeCandlesticks('600487.SH', '5m', () => {});
    bridge.calls.length = 0;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const batches = bridge.calls
      .filter((c) => c.method === 'snapshot')
      .map((c) => c.params.symbols as string[]);
    expect(batches).toHaveLength(5);
    for (const batch of batches) {
      expect(batch).toHaveLength(100);
      expect(batch).toContain('600487.SH');
    }
    // 5 轮 × 99 个空位，450 只自选每只都轮到过
    expect(new Set(batches.flat()).size).toBe(451);
    unsub();
    await h.stream.release(watchlist);
  });

  it.each(TIERS)('%s：盘口跟着快照走，推送次数 = 快照轮数', async (tier) => {
    const { bridge } = await setup(tier);
    const pushes: string[] = [];
    const unsub = subscribeDepth('600487.SH', (env) => pushes.push(env));
    await vi.advanceTimersByTimeAsync(600);
    pushes.length = 0;
    bridge.calls.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bridge.count('snapshot')).toBe(pollsPerMinute[tier]);
    expect(pushes).toHaveLength(pollsPerMinute[tier]);
    const last = JSON.parse(pushes.at(-1)!);
    expect(last.type).toBe('data');
    expect(last.data.bids).toHaveLength(5);
    unsub();
  });

  it.each(TIERS)('%s：分时照常每分钟重拉 240 根 1 分钟线，不报降级', async (tier) => {
    const { bridge } = await setup(tier);
    const pushes: string[] = [];
    const unsub = subscribeTimeshare('600487.SH', (env) => pushes.push(env));
    await vi.advanceTimersByTimeAsync(1_000);
    const klines = () => bridge.calls.filter((c) => c.method === 'kline').map((c) => c.params);
    expect(klines()).toEqual([
      expect.objectContaining({ period: '1m', count: 240, adjust: 'none' }),
      expect.objectContaining({ period: 'day', count: 5, adjust: 'none' }),
    ]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(klines().slice(2)).toEqual([expect.objectContaining({ period: '1m', count: 240 })]);
    expect(pushes.some((env) => JSON.parse(env).type === 'status')).toBe(false);
    unsub();
  });

  it('stop：K 线一次最多 300 根，分时的 240 根不受影响', async () => {
    const { bridge } = await setup('stop');
    await h.provider.getKline('600487.SH', 'day', 1_000);
    await h.provider.getKline('600487.SH', '1m', 240);
    expect(bridge.calls.filter((c) => c.method === 'kline').map((c) => c.params.count)).toEqual([
      300, 240,
    ]);
  });

  // 冷启动后 10 分钟里，全市场快照（约 0.8 MB/次）请求了几次
  const sectorSnapshotsIn10Min: Record<QuotaTier, number> = {
    normal: 10,
    caution: 5,
    saving: 0,
    stop: 0,
  };

  it.each(TIERS)('%s：申万行业冷启动与刷新频率', async (tier) => {
    const { bridge } = await setup(tier);
    const service = createSectorService({
      call: bridge.call,
      guard: h.guard,
      providerName: () => 'ricequant',
      cachePath: null,
      timers: false,
    });
    const pushes: Array<{ type: string; degraded?: boolean; error?: string }> = [];
    const unsub = service.subscribeBoard(['600487.SH'], (env) => pushes.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);
    const firstSnapshots = bridge.count('market_snapshot');
    if (tier === 'normal' || tier === 'caution') {
      expect(firstSnapshots).toBe(1);
      expect(pushes.map((p) => p.type)).toEqual(['data']);
    } else {
      // 一份数据都没有：报降级，连行业归属表也不取
      expect(firstSnapshots).toBe(0);
      expect(bridge.count('sw_map')).toBe(0);
      expect(pushes).toEqual([
        expect.objectContaining({
          type: 'status',
          degraded: true,
          error: expect.stringContaining('market_snapshot'),
        }),
      ]);
    }
    for (let i = 0; i < 40; i += 1) {
      await vi.advanceTimersByTimeAsync(15_000);
      await service.tick();
    }
    expect(bridge.count('market_snapshot') - firstSnapshots).toBe(sectorSnapshotsIn10Min[tier]);
    unsub();
  });

  it('申万行业：档位升到 stop 后保留最后一份、不报错；回落后恢复刷新', async () => {
    const { bridge, used, guard } = await setup('normal');
    const service = createSectorService({
      call: bridge.call,
      guard,
      providerName: () => 'ricequant',
      cachePath: null,
      timers: false,
    });
    const pushes: Array<{ type: string }> = [];
    const unsub = service.subscribeBoard([], (env) => pushes.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);
    expect(pushes.map((p) => p.type)).toEqual(['data']);

    // 别的程序把同一个 key 的流量用到 95%：最迟 5 分钟后 ping 到，档位跳到 stop
    used.ratio = USED_RATIO.stop;
    const tickFor = async (minutes: number) => {
      for (let i = 0; i < minutes * 4; i += 1) {
        await vi.advanceTimersByTimeAsync(15_000);
        await service.tick();
      }
    };
    await tickFor(6);
    expect(guard.quotaTier()).toBe('stop');
    const frozenAt = bridge.count('market_snapshot');
    const pushedAt = pushes.length;
    await tickFor(10);
    expect(bridge.count('market_snapshot')).toBe(frozenAt);
    expect(pushes.slice(pushedAt)).toEqual([]);

    // 第二天额度重置 / 别的程序停了：stop 档每分钟复查一次，回到 normal 后接着刷新
    used.ratio = USED_RATIO.normal;
    await tickFor(3);
    expect(guard.quotaTier()).toBe('normal');
    expect(bridge.count('market_snapshot')).toBeGreaterThan(frozenAt);
    expect(pushes.slice(pushedAt).every((p) => p.type === 'data')).toBe(true);
    unsub();
  });
});
