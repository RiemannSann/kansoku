import type { CnLiveHolding, CockpitPosition, RelativeVolume } from '@kansoku/shared/types';
import { buildCockpitPosition } from '../cockpit/position.js';
import { entryPlanFromDoc, latestIntradayDoc, type EntryPlan } from '../cockpit/entryPlan.js';
import { getProvider, getStream } from '../marketdata/registry.js';
import type { RawPosition } from '../marketdata/types.js';
import { computeRelativeVolume } from '../analysis/relvol.js';
import { cnHoldingFrom, cnRawPosition, readLiveSellerCached } from '../liveSeller/holding.js';
import { marketOf } from '../symbols/symbol.utils.js';
import { createEmitter, emitData, emitStatus, replay } from './emitter.js';

const SLOW_REFRESH_MS = 60_000;
// A 股仓位读本机 StockSeller 看板（盘中会边卖边变），刷新快一点；看板自己 5 秒一更新
const CN_REFRESH_MS = 15_000;
const PUSH_THROTTLE_MS = 1_000;
const RELVOL_BARS = 500;

export interface PositionPayload {
  position: CockpitPosition | null;
  relvol: RelativeVolume | null;
  /** 只有 A 股有：StockSeller 看板里这只票的实盘明细 */
  cnLive?: CnLiveHolding;
}

interface State {
  emitter: ReturnType<typeof createEmitter>;
  positions: RawPosition[];
  plan: EntryPlan | null;
  relvol: RelativeVolume | null;
  cnLive: CnLiveHolding | null;
  quoteUnsub: (() => void) | null;
  slowTimer: ReturnType<typeof setInterval> | null;
  pushTimer: ReturnType<typeof setTimeout> | null;
  refreshing: Promise<void> | null;
}

const states = new Map<string, State>();

/** Pure: cached position snapshot × a live quote → the channel payload. */
export function buildPositionPayload(
  positions: RawPosition[],
  symbol: string,
  last: number,
  plan: EntryPlan | null,
  relvol: RelativeVolume | null,
  cnLive: CnLiveHolding | null = null,
): PositionPayload {
  if (cnLive) {
    const raw = cnRawPosition(cnLive, symbol);
    return {
      position: raw ? buildCockpitPosition([raw], symbol, last, plan) : null,
      relvol,
      cnLive,
    };
  }
  return { position: buildCockpitPosition(positions, symbol, last, plan), relvol };
}

function pushLatest(state: State, symbol: string): void {
  const quote = getStream(marketOf(symbol)).getSnapshot(symbol);
  if (!quote) return;
  emitData(
    state.emitter,
    buildPositionPayload(
      state.positions,
      symbol,
      quote.last,
      state.plan,
      state.relvol,
      state.cnLive,
    ),
  );
}

function schedulePush(state: State, symbol: string): void {
  if (state.pushTimer) return;
  state.pushTimer = setTimeout(() => {
    state.pushTimer = null;
    pushLatest(state, symbol);
  }, PUSH_THROTTLE_MS);
}

async function refresh(symbol: string, state: State): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      // A 股：仓位只读 StockSeller 看板（GET /api/snapshot），不问长桥；量能用 A 股自己的行情源
      const cn = marketOf(symbol) === 'CN';
      const provider = getProvider(marketOf(symbol));
      const [positions, cnLive, doc, bars] = await Promise.all([
        cn ? Promise.resolve([]) : (getProvider().getPositions?.() ?? Promise.resolve([])),
        cn ? readLiveSellerCached().then((snap) => cnHoldingFrom(snap, symbol)) : null,
        latestIntradayDoc(symbol),
        provider.getKline(symbol, '15m', RELVOL_BARS).catch(() => null),
      ]);
      state.positions = positions;
      state.cnLive = cnLive;
      state.plan = entryPlanFromDoc(doc);
      state.relvol = bars ? computeRelativeVolume(bars) : state.relvol;
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

export function subscribePosition(symbol: string, push: (envelope: string) => void): () => void {
  let state = states.get(symbol);
  const fresh = !state;
  if (!state) {
    state = {
      emitter: createEmitter(),
      positions: [],
      plan: null,
      relvol: null,
      cnLive: null,
      quoteUnsub: null,
      slowTimer: null,
      pushTimer: null,
      refreshing: null,
    };
    states.set(symbol, state);
  }
  state.emitter.listeners.add(push);

  if (fresh) {
    const retainPromise = getStream(marketOf(symbol))
      .retain([symbol])
      .catch((err) => console.warn('[ws-position] retain failed', err));
    state.quoteUnsub = getStream(marketOf(symbol)).onUpdate((cell) => {
      if (cell.symbol === symbol) schedulePush(state as State, symbol);
    });
    const every = marketOf(symbol) === 'CN' ? CN_REFRESH_MS : SLOW_REFRESH_MS;
    state.slowTimer = setInterval(() => void refresh(symbol, state as State), every);
    const refreshPromise = refresh(symbol, state);
    // retain() and the initial refresh() race independently; whichever seeds the quote
    // snapshot last leaves `pushLatest` a no-op inside the other, so re-push once both settle.
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
      if (s.slowTimer) clearInterval(s.slowTimer);
      if (s.pushTimer) clearTimeout(s.pushTimer);
      states.delete(symbol);
      void getStream(marketOf(symbol))
        .release([symbol])
        .catch(() => {});
    }
  };
}
