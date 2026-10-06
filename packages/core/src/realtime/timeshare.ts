import type { QuoteCell, RawBar } from '@kansoku/shared/types';
import { buildTimeshare, type TimeshareMark } from '../analysis/timeshare.js';
import { getProvider, getStream } from '../marketdata/registry.js';
import { getRicequantGuard } from '../marketdata/ricequantGuard.js';
import { cnPollPhase, cnSessionSlot, shanghaiDate } from '../marketdata/ricequantTime.js';
import { createEmitter, emitData, emitStatus, replay } from './emitter.js';

// 分时图频道（只给 A 股）：订阅时拉一次 1 分钟线 + 日线，盘中每分钟重拉 1 分钟线（约 15 KB/次），
// 中间用 3 秒快照接上当前这一分钟。午休、收盘后、节假日不重拉。
const BARS_REFRESH_MS = 60_000;
const PUSH_THROTTLE_MS = 1_000;
const MINUTE_BARS = 240;
const DAY_BARS = 5;

interface State {
  emitter: ReturnType<typeof createEmitter>;
  bars: RawBar[];
  dayCloses: Array<{ date: string; close: number }>;
  liveDate: string | null;
  marks: Map<number, TimeshareMark>;
  lastCell: QuoteCell | null;
  quoteUnsub: (() => void) | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  pushTimer: ReturnType<typeof setTimeout> | null;
  lastPhase: string | null;
  refreshing: Promise<void> | null;
}

const states = new Map<string, State>();

/** 把一条报价记成所在分钟的最新状态；午休、收盘后的报价不记 */
export function recordMark(state: Pick<State, 'liveDate' | 'marks'>, cell: QuoteCell): boolean {
  const ts = cell.asOf ? Date.parse(cell.asOf) : Number.NaN;
  if (!Number.isFinite(ts)) return false;
  const slot = cnSessionSlot(ts);
  if (slot == null) return false;
  const date = shanghaiDate(ts);
  if (state.liveDate !== date) {
    state.liveDate = date;
    state.marks.clear();
  }
  state.marks.set(slot, {
    slot,
    price: cell.last,
    cumVolume: cell.volume ?? 0,
    cumTurnover: cell.turnover ?? 0,
  });
  return true;
}

function prevCloseFor(state: State, date: string): number | null {
  let close: number | null = null;
  for (const day of state.dayCloses) if (day.date < date) close = day.close;
  return close;
}

function pushLatest(state: State, symbol: string): void {
  const stream = getStream('CN');
  const depth = stream.getDepth?.(symbol);
  const cell = state.lastCell;
  const derivedPrev =
    cell?.pct != null && cell.pct > -100 ? cell.last / (1 + cell.pct / 100) : null;
  emitData(
    state.emitter,
    buildTimeshare({
      symbol,
      bars: state.bars,
      prevCloseFor: (date) => prevCloseFor(state, date),
      live: state.liveDate
        ? {
            date: state.liveDate,
            prevClose: depth?.prevClose ?? derivedPrev,
            marks: [...state.marks.values()],
            asOf: cell?.asOf ?? null,
          }
        : null,
    }),
  );
}

function schedulePush(state: State, symbol: string): void {
  if (state.pushTimer) return;
  state.pushTimer = setTimeout(() => {
    state.pushTimer = null;
    pushLatest(state, symbol);
  }, PUSH_THROTTLE_MS);
}

async function refresh(symbol: string, state: State, withDays: boolean): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const provider = getProvider('CN');
      const [bars, days] = await Promise.all([
        provider.getKline(symbol, '1m', MINUTE_BARS),
        withDays || !state.dayCloses.length
          ? provider.getKline(symbol, 'day', DAY_BARS)
          : Promise.resolve(null),
      ]);
      state.bars = bars;
      if (days) {
        state.dayCloses = days
          .map((bar) => ({ date: shanghaiDate(Date.parse(bar.time)), close: Number(bar.close) }))
          .filter((d) => Number.isFinite(d.close) && d.close > 0);
      }
      emitStatus(state.emitter, false);
      pushLatest(state, symbol);
    } catch (err) {
      emitStatus(state.emitter, true, err instanceof Error ? err.message : String(err));
    }
  })().finally(() => {
    state.refreshing = null;
  });
  return state.refreshing;
}

/** 盘中每分钟重拉；刚收盘（或刚进午休）时再拉最后一次，把最后一分钟补齐 */
function tick(symbol: string, state: State): void {
  const phase = cnPollPhase(Date.now(), getRicequantGuard().isTradingDay());
  const wasActive = state.lastPhase === 'active';
  const dayChanged = state.liveDate != null && state.liveDate !== shanghaiDate(Date.now());
  state.lastPhase = phase;
  if (phase === 'active' || wasActive || dayChanged) void refresh(symbol, state, dayChanged);
}

export function subscribeTimeshare(symbol: string, push: (envelope: string) => void): () => void {
  let state = states.get(symbol);
  const fresh = !state;
  if (!state) {
    state = {
      emitter: createEmitter(),
      bars: [],
      dayCloses: [],
      liveDate: null,
      marks: new Map(),
      lastCell: null,
      quoteUnsub: null,
      refreshTimer: null,
      pushTimer: null,
      lastPhase: null,
      refreshing: null,
    };
    states.set(symbol, state);
  }
  state.emitter.listeners.add(push);

  if (fresh) {
    const stream = getStream('CN');
    const onCell = (cell: QuoteCell) => {
      const s = state as State;
      s.lastCell = cell;
      if (recordMark(s, cell)) schedulePush(s, symbol);
    };
    state.quoteUnsub = stream.onUpdate((cell) => {
      if (cell.symbol === symbol) onCell(cell);
    });
    const retainPromise = stream
      .retain([symbol])
      .then(() => {
        const cell = stream.getSnapshot(symbol);
        if (cell) onCell(cell);
      })
      .catch((err) => console.warn('[ws-timeshare] retain failed', err));
    state.lastPhase = cnPollPhase(Date.now(), getRicequantGuard().isTradingDay());
    state.refreshTimer = setInterval(() => tick(symbol, state as State), BARS_REFRESH_MS);
    const refreshPromise = refresh(symbol, state, true);
    void Promise.all([retainPromise, refreshPromise]).then(() =>
      pushLatest(state as State, symbol),
    );
  } else {
    replay(state.emitter, push);
  }

  return () => {
    const s = states.get(symbol);
    if (!s) return;
    s.emitter.listeners.delete(push);
    if (s.emitter.listeners.size === 0) {
      s.quoteUnsub?.();
      if (s.refreshTimer) clearInterval(s.refreshTimer);
      if (s.pushTimer) clearTimeout(s.pushTimer);
      states.delete(symbol);
      void getStream('CN')
        .release([symbol])
        .catch(() => {});
    }
  };
}
