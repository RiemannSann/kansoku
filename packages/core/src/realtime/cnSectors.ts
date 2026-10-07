import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  buildSectorBoard,
  buildSectorDetail,
  buildStockIndustry,
  computeSectorStats,
  type MarketRow,
  type SectorSnapshot,
  type SwMap,
} from '../marketdata/cnSectors.js';
import { getProvider } from '../marketdata/registry.js';
import { getRicequantBridge, type RicequantCall } from '../marketdata/ricequantBridge.js';
import { getRicequantGuard, type QuotaTier } from '../marketdata/ricequantGuard.js';
import { cnPollPhase, shanghaiDate } from '../marketdata/ricequantTime.js';

// 申万行业频道（只在 A 股走米筐时有数据）：
//   cn-sectors   全市场一级/二级行业排行（可带上自选股，顺便告诉页面它们属于哪个行业）
//   cn-sector    某个行业的成员股
//   cn-industry  某只股票所属的一级/二级行业当日表现
//
// 三个频道共用一份数据：行业归属表一天取一次（约 0.5 MB，落盘缓存），全市场快照
// （约 5400 只股票 + 162 个行业指数）盘中按流量档位刷新：normal 60 秒、caution 120 秒，
// saving / stop 档由流量保护直接停掉（保住自选报价和 K 线），页面上保留最后一份。
// 午休、收盘后、节假日不轮询，只在刚离开盘中时补拉最后一次。

const REFRESH_MS: Partial<Record<QuotaTier, number>> = { normal: 60_000, caution: 120_000 };
const TICK_MS = 15_000;
const MAP_METHOD = 'sw_map';
const SNAPSHOT_METHOD = 'market_snapshot';

export function swMapCachePath(): string {
  return path.join(homedir(), '.cache', 'kansoku', 'cn-sw-map.json');
}

type Push = (envelope: string) => void;

interface Subscriber {
  kind: 'board' | 'sector' | 'industry';
  arg: string[];
  push: Push;
  last: string | null;
  degraded: boolean;
}

export interface SectorServiceDeps {
  call?: RicequantCall;
  guard?: Pick<ReturnType<typeof getRicequantGuard>, 'blockReason' | 'quotaTier' | 'isTradingDay'>;
  now?: () => number;
  /** A 股当前行情源名字；不是 ricequant 时三个频道都报"不可用" */
  providerName?: () => string;
  cachePath?: string | null;
  /** 测试里关掉定时器，手动调 tick() */
  timers?: boolean;
}

function isSwMap(value: unknown): value is SwMap {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.day === 'string' && typeof v.stocks === 'object' && typeof v.industries === 'object'
  );
}

export function createSectorService(deps: SectorServiceDeps = {}) {
  const call: RicequantCall =
    deps.call ?? ((method, params) => getRicequantBridge().call(method, params));
  const guard = deps.guard ?? getRicequantGuard();
  const now = deps.now ?? Date.now;
  const providerName = deps.providerName ?? (() => getProvider('CN').name);
  const cachePath = deps.cachePath === undefined ? swMapCachePath() : deps.cachePath;
  const timers = deps.timers ?? true;

  const subs = new Set<Subscriber>();
  let map: SwMap | null = null;
  let mapLoading: Promise<void> | null = null;
  let rows = new Map<string, MarketRow>();
  let snapshot: SectorSnapshot | null = null;
  let lastRefreshAt = 0;
  let lastPhase: string | null = null;
  let refreshing: Promise<void> | null = null;
  let error: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function readDisk(): Promise<SwMap | null> {
    if (!cachePath) return null;
    try {
      const parsed: unknown = JSON.parse(await readFile(cachePath, 'utf8'));
      return isSwMap(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function writeDisk(value: SwMap): Promise<void> {
    if (!cachePath) return;
    try {
      await mkdir(path.dirname(cachePath), { recursive: true });
      const tmp = `${cachePath}.tmp`;
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, cachePath);
    } catch (err) {
      console.warn('[cn-sectors] 行业归属表写盘失败', err);
    }
  }

  /** 先用内存 / 磁盘里的表；不是今天取的就再向米筐要一次（失败了继续用旧表） */
  function ensureMap(): Promise<void> {
    if (mapLoading) return mapLoading;
    const today = shanghaiDate(now());
    if (map?.day === today) return Promise.resolve();
    mapLoading = (async () => {
      if (!map) map = await readDisk();
      if (map?.day === today) return;
      const blocked = guard.blockReason(MAP_METHOD);
      if (blocked) {
        if (!map) throw new Error(blocked);
        return;
      }
      try {
        const fresh = await call<SwMap>(MAP_METHOD, {});
        if (isSwMap(fresh) && Object.keys(fresh.stocks).length) {
          map = fresh;
          await writeDisk(fresh);
        }
      } catch (err) {
        if (!map) throw err;
        console.warn('[cn-sectors] 行业归属表刷新失败，继续用旧表', err);
      }
    })().finally(() => {
      mapLoading = null;
    });
    return mapLoading;
  }

  function envelopeFor(sub: Subscriber): string | null {
    if (!map || !snapshot) return null;
    if (sub.kind === 'board') {
      return JSON.stringify({ type: 'data', data: buildSectorBoard(snapshot, map, sub.arg) });
    }
    if (sub.kind === 'sector') {
      const detail = buildSectorDetail(snapshot, map, rows, sub.arg[0] ?? '');
      return JSON.stringify({ type: 'data', data: detail });
    }
    return JSON.stringify({
      type: 'data',
      data: buildStockIndustry(snapshot, map, sub.arg[0] ?? ''),
    });
  }

  function pushTo(sub: Subscriber): void {
    const env = envelopeFor(sub);
    if (env && env !== sub.last) {
      sub.last = env;
      sub.push(env);
    }
    const degraded = error != null;
    if (degraded !== sub.degraded) {
      sub.degraded = degraded;
      sub.push(JSON.stringify({ type: 'status', degraded, ...(error ? { error } : {}) }));
    }
  }

  function pushAll(): void {
    for (const sub of subs) pushTo(sub);
  }

  function refresh(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        if (providerName() !== 'ricequant') {
          throw new Error('申万行业数据需要 A 股走米筐（MARKET_PROVIDER_CN=ricequant）');
        }
        // 先看流量保护：全市场快照被停时，行业归属表（约 0.5 MB）取了也用不上，一起不取
        const blocked = guard.blockReason(SNAPSHOT_METHOD);
        if (blocked) {
          // 已经有一份数据就继续显示，不算出错；一份都没有才报出来
          if (!snapshot) throw new Error(blocked);
          return;
        }
        await ensureMap();
        const current = map as SwMap;
        const symbols = [...Object.keys(current.stocks), ...Object.keys(current.industries)];
        const fetched = await call<MarketRow[]>(SNAPSHOT_METHOD, { symbols });
        rows = new Map(fetched.map((row) => [row.symbol, row]));
        snapshot = computeSectorStats(current, rows);
        lastRefreshAt = now();
        error = null;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      pushAll();
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** 盘中按档位间隔刷新；刚离开盘中补拉一次；没数据时总要拉一次 */
  function tick(): Promise<void> {
    const at = now();
    const phase = cnPollPhase(at, guard.isTradingDay());
    const wasActive = lastPhase === 'active';
    lastPhase = phase;
    if (!snapshot) return refresh();
    if (phase === 'active') {
      const every = REFRESH_MS[guard.quotaTier()];
      // saving / stop 档：交给 refresh 里的流量保护判断（会直接跳过）
      if (every == null || at - lastRefreshAt >= every) return refresh();
      return Promise.resolve();
    }
    if (wasActive) return refresh();
    return Promise.resolve();
  }

  function subscribe(kind: Subscriber['kind'], arg: string[], push: Push): () => void {
    const sub: Subscriber = { kind, arg, push, last: null, degraded: false };
    subs.add(sub);
    if (snapshot || error) pushTo(sub);
    if (subs.size === 1) {
      lastPhase = cnPollPhase(now(), guard.isTradingDay());
      if (timers && !timer) timer = setInterval(() => void tick(), TICK_MS);
      void tick();
    }
    return () => {
      subs.delete(sub);
      if (subs.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }

  return {
    subscribeBoard: (symbols: string[], push: Push) => subscribe('board', symbols, push),
    subscribeSector: (code: string, push: Push) => subscribe('sector', [code], push),
    subscribeIndustry: (symbol: string, push: Push) => subscribe('industry', [symbol], push),
    tick,
    refresh,
  };
}

let shared: ReturnType<typeof createSectorService> | null = null;

export function getSectorService(): ReturnType<typeof createSectorService> {
  if (!shared) shared = createSectorService();
  return shared;
}
