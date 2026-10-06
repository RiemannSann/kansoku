import type { QuoteCell, RawBar } from '@kansoku/shared/types';
import { classifySession, sessionLabel } from './session.js';
import type { CandleBar, CandlePeriod } from './candleAggregator.js';
import type { CandleListener, QuoteListener, QuoteStream } from './quoteStream.js';
import { getProvider } from './registry.js';
import type { BridgeSnapshot } from './ricequant.js';
import { getRicequantBridge } from './ricequantBridge.js';
import {
  cnBucketStart,
  cnSnapshotFeedsBars,
  isCnActiveWindow,
  isCnOpenAuction,
  parseShanghai,
  sameShanghaiDay,
} from './ricequantTime.js';

// 米筐没有推送，靠轮询 current_snapshot 模拟实时：盘中 3 秒一轮，盘外 60 秒一轮，
// 所有关注的代码合成一次批量请求。K 线用快照里的累计成交量做差分，按 A 股时段分桶拼 bar；
// 拼出来的量只是近似，图表每分钟重拉一次 K 线会把它校正回交易所口径。

const ACTIVE_POLL_MS = 3_000;
const IDLE_POLL_MS = 60_000;

const PERIOD_MINUTES: Record<CandlePeriod, number> = { '5m': 5, '15m': 15, '60m': 60 };

type SnapshotFetcher = (symbols: string[]) => Promise<BridgeSnapshot[]>;
type SeedFetcher = (symbol: string, period: CandlePeriod) => Promise<RawBar | undefined>;

export interface RicequantStreamDeps {
  fetchSnapshots?: SnapshotFetcher;
  fetchSeed?: SeedFetcher;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (handle: ReturnType<typeof setTimeout>) => void;
}

interface CandleState {
  symbol: string;
  period: CandlePeriod;
  bar: CandleBar | null;
  listeners: Set<CandleListener>;
}

interface VolumeMark {
  ts: number;
  volume: number;
  turnover: number;
}

function candleKey(symbol: string, period: CandlePeriod): string {
  return `${symbol}\0${period}`;
}

function seedBar(symbol: string, period: CandlePeriod, raw: RawBar): CandleBar {
  return {
    symbol,
    period,
    ts: Date.parse(raw.time),
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    close: Number(raw.close),
    volume: Number(raw.volume),
    turnover: 0,
  };
}

export class RicequantStream implements QuoteStream {
  private readonly fetchSnapshots: SnapshotFetcher;
  private readonly fetchSeed: SeedFetcher;
  private readonly now: () => number;
  private readonly schedule: NonNullable<RicequantStreamDeps['schedule']>;
  private readonly cancel: NonNullable<RicequantStreamDeps['cancel']>;

  private quoteRefs = new Map<string, number>();
  private candles = new Map<string, CandleState>();
  private snapshots = new Map<string, QuoteCell>();
  private lastSeen = new Map<string, string>();
  private volumeMarks = new Map<string, VolumeMark>();
  private listeners = new Set<QuoteListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling: Promise<void> | null = null;

  constructor(deps: RicequantStreamDeps = {}) {
    this.fetchSnapshots =
      deps.fetchSnapshots ??
      ((symbols) => getRicequantBridge().call<BridgeSnapshot[]>('snapshot', { symbols }));
    this.fetchSeed =
      deps.fetchSeed ??
      (async (symbol, period) => {
        const rows = await getProvider('CN').getKline(symbol, period === '60m' ? '1h' : period, 2);
        return rows.at(-1);
      });
    this.now = deps.now ?? Date.now;
    this.schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = deps.cancel ?? ((handle) => clearTimeout(handle));
  }

  private watched(): string[] {
    const set = new Set(this.quoteRefs.keys());
    for (const state of this.candles.values()) set.add(state.symbol);
    return [...set];
  }

  /** 立刻拉一轮快照；测试和首次 retain 用。 */
  poll(): Promise<void> {
    if (this.polling) return this.polling;
    const symbols = this.watched();
    if (!symbols.length) return Promise.resolve();
    this.polling = this.fetchSnapshots(symbols)
      .then((rows) => {
        for (const row of rows) this.ingest(row);
      })
      .catch((error: unknown) => {
        console.warn(
          '[ricequant-stream] snapshot poll failed:',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        this.polling = null;
      });
    return this.polling;
  }

  private ensureLoop(): void {
    if (this.timer || !this.watched().length) return;
    const tick = () => {
      this.timer = null;
      if (!this.watched().length) return;
      void this.poll().finally(() => {
        if (this.timer || !this.watched().length) return;
        this.timer = this.schedule(tick, this.interval());
      });
    };
    this.timer = this.schedule(tick, this.interval());
  }

  private interval(): number {
    return isCnActiveWindow(this.now()) ? ACTIVE_POLL_MS : IDLE_POLL_MS;
  }

  private stopLoopIfIdle(): void {
    if (this.watched().length || !this.timer) return;
    this.cancel(this.timer);
    this.timer = null;
  }

  private ingest(snap: BridgeSnapshot): void {
    if (snap.last == null || !(snap.last > 0)) return;
    const ts = parseShanghai(snap.datetime);
    if (!Number.isFinite(ts)) return;

    // 开盘集合竞价时快照的 last 还是昨收、量是 0；真正的竞价撮合价在买一 = 卖一里
    const auction = isCnOpenAuction(ts);
    const shown = (auction && snap.volume <= 0 ? indicativePrice(snap) : null) ?? snap.last;

    const signature = `${snap.datetime}|${shown}|${snap.volume}`;
    const changed = this.lastSeen.get(snap.symbol) !== signature;
    this.lastSeen.set(snap.symbol, signature);

    const prev = snap.prev_close ?? 0;
    const pct = prev ? (shown / prev - 1) * 100 : null;
    const cell: QuoteCell = {
      symbol: snap.symbol,
      session: auction
        ? '集合竞价'
        : sessionLabel(classifySession(Math.floor(ts / 1000), 'CN'), 'CN'),
      last: shown,
      pct,
      regularLast: shown,
      regularPct: pct,
      ...(snap.turnover > 0 ? { turnover: snap.turnover } : {}),
      asOf: new Date(ts).toISOString(),
    };
    this.snapshots.set(snap.symbol, cell);

    const delta = this.volumeDelta(snap, ts);
    if (!changed) return;
    for (const listener of this.listeners) listener(cell);
    // 当天还没成交（竞价阶段、停牌）就没有 K 线；收盘后、午休里的快照也不再动 K 线
    if (!(snap.volume > 0) || !cnSnapshotFeedsBars(ts)) return;
    for (const state of this.candles.values()) {
      if (state.symbol === snap.symbol) this.updateCandle(state, ts, snap.last, delta);
    }
  }

  // 快照给的是当日累计量，增量 = 本轮累计 - 上轮累计。
  // 第一次看到这只票：种子 bar 来自 K 线，已含此前的量，记 0。
  // 跨日后的第一轮：只有还落在开盘第一分钟（含集合竞价）时，累计量才整体属于当前 bar；
  // 其余情况没有可靠基线，记 0，等图表每分钟重拉 K 线校正。
  private volumeDelta(snap: BridgeSnapshot, ts: number): { volume: number; turnover: number } {
    const mark = this.volumeMarks.get(snap.symbol);
    this.volumeMarks.set(snap.symbol, { ts, volume: snap.volume, turnover: snap.turnover });
    if (!mark) return { volume: 0, turnover: 0 };
    if (sameShanghaiDay(mark.ts, ts)) {
      return snap.volume >= mark.volume
        ? { volume: snap.volume - mark.volume, turnover: snap.turnover - mark.turnover }
        : { volume: 0, turnover: 0 };
    }
    return isDayFirstMinute(ts)
      ? { volume: snap.volume, turnover: snap.turnover }
      : { volume: 0, turnover: 0 };
  }

  private updateCandle(
    state: CandleState,
    ts: number,
    price: number,
    delta: { volume: number; turnover: number },
  ): void {
    const bucket = cnBucketStart(ts, PERIOD_MINUTES[state.period]);
    const current = state.bar;
    if (current && bucket < current.ts) return;
    let next: CandleBar;
    if (!current || bucket > current.ts) {
      next = {
        symbol: state.symbol,
        period: state.period,
        ts: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: delta.volume,
        turnover: delta.turnover,
      };
    } else {
      next = {
        ...current,
        high: Math.max(current.high, price),
        low: Math.min(current.low, price),
        close: price,
        volume: current.volume + delta.volume,
        turnover: current.turnover + delta.turnover,
      };
    }
    state.bar = next;
    for (const listener of state.listeners) {
      try {
        listener(next);
      } catch (error) {
        console.warn('[ricequant-stream] candlestick listener failed', error);
      }
    }
  }

  async retain(symbols: string[]): Promise<void> {
    let fresh = false;
    for (const symbol of symbols) {
      const count = (this.quoteRefs.get(symbol) ?? 0) + 1;
      this.quoteRefs.set(symbol, count);
      if (count === 1) fresh = true;
    }
    if (!fresh) return;
    this.ensureLoop();
    // 正在跑的那一轮不含新代码，等它结束再补拉一轮，否则盘外要等 60 秒才有报价
    if (this.polling) await this.polling;
    await this.poll();
  }

  async release(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      const count = (this.quoteRefs.get(symbol) ?? 0) - 1;
      if (count > 0) {
        this.quoteRefs.set(symbol, count);
        continue;
      }
      this.quoteRefs.delete(symbol);
      if (!this.hasCandleForSymbol(symbol)) this.forget(symbol);
    }
    this.stopLoopIfIdle();
  }

  subscribeCandlesticks(
    symbol: string,
    period: CandlePeriod,
    cb: CandleListener,
    seed?: RawBar,
  ): () => void {
    const key = candleKey(symbol, period);
    let state = this.candles.get(key);
    if (!state) {
      state = {
        symbol,
        period,
        bar: seed ? seedBar(symbol, period, seed) : null,
        listeners: new Set(),
      };
      this.candles.set(key, state);
      if (!seed) {
        const target = state;
        void this.fetchSeed(symbol, period)
          .then((raw) => {
            if (raw && !target.bar && this.candles.get(key) === target)
              target.bar = seedBar(symbol, period, raw);
          })
          .catch((error: unknown) =>
            console.warn('[ricequant-stream] candle seed failed', symbol, period, error),
          );
      }
    }
    state.listeners.add(cb);
    this.ensureLoop();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.candles.get(key);
      if (!current) return;
      current.listeners.delete(cb);
      if (current.listeners.size > 0) return;
      this.candles.delete(key);
      if (!this.quoteRefs.has(symbol) && !this.hasCandleForSymbol(symbol)) this.forget(symbol);
      this.stopLoopIfIdle();
    };
  }

  private hasCandleForSymbol(symbol: string): boolean {
    for (const state of this.candles.values()) if (state.symbol === symbol) return true;
    return false;
  }

  private forget(symbol: string): void {
    this.snapshots.delete(symbol);
    this.lastSeen.delete(symbol);
    this.volumeMarks.delete(symbol);
  }

  onUpdate(listener: QuoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(symbol: string): QuoteCell | undefined {
    return this.snapshots.get(symbol);
  }

  dispose(): void {
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
  }
}

/** 集合竞价的虚拟撮合价：买一 = 卖一时才有意义 */
function indicativePrice(snap: BridgeSnapshot): number | null {
  const bid = snap.bids?.[0];
  const ask = snap.asks?.[0];
  return bid != null && bid > 0 && bid === ask ? bid : null;
}

/** 是否落在当天第一根 1 分钟 bar（09:30 前的集合竞价也算） */
function isDayFirstMinute(ts: number): boolean {
  const day = new Date(ts + 8 * 3_600_000).toISOString().slice(0, 10);
  return cnBucketStart(ts, 1) === parseShanghai(`${day} 09:30:00`);
}

let instance: RicequantStream | null = null;

export function getRicequantStream(): RicequantStream {
  if (!instance) instance = new RicequantStream();
  return instance;
}

export function resetRicequantStream(): void {
  instance?.dispose();
  instance = null;
}
