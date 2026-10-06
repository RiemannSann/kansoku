import { getStream } from '../marketdata/registry.js';
import { marketOf } from '../symbols/symbol.utils.js';
import { createEmitter, emitData, replay } from './emitter.js';

// 盘口跟着快照走（A 股 3 秒一轮），推送节流到半秒，避免同一轮里多次刷新
const PUSH_THROTTLE_MS = 500;

interface State {
  emitter: ReturnType<typeof createEmitter>;
  quoteUnsub: (() => void) | null;
  pushTimer: ReturnType<typeof setTimeout> | null;
}

const states = new Map<string, State>();

/** 当前盘口；行情源不提供盘口（美股/港股走长桥时）就推 null，页面据此隐藏 */
function pushLatest(state: State, symbol: string): void {
  const stream = getStream(marketOf(symbol));
  emitData(state.emitter, stream.getDepth?.(symbol) ?? null);
}

function schedulePush(state: State, symbol: string): void {
  if (state.pushTimer) return;
  state.pushTimer = setTimeout(() => {
    state.pushTimer = null;
    pushLatest(state, symbol);
  }, PUSH_THROTTLE_MS);
}

export function subscribeDepth(symbol: string, push: (envelope: string) => void): () => void {
  let state = states.get(symbol);
  const fresh = !state;
  if (!state) {
    state = { emitter: createEmitter(), quoteUnsub: null, pushTimer: null };
    states.set(symbol, state);
  }
  state.emitter.listeners.add(push);

  if (fresh) {
    const stream = getStream(marketOf(symbol));
    state.quoteUnsub = stream.onUpdate((cell) => {
      if (cell.symbol === symbol) schedulePush(state as State, symbol);
    });
    pushLatest(state, symbol);
    void stream
      .retain([symbol])
      .then(() => pushLatest(state as State, symbol))
      .catch((err) => console.warn('[ws-depth] retain failed', err));
  } else {
    replay(state.emitter, push);
  }

  return () => {
    const s = states.get(symbol);
    if (!s) return;
    s.emitter.listeners.delete(push);
    if (s.emitter.listeners.size === 0) {
      s.quoteUnsub?.();
      if (s.pushTimer) clearTimeout(s.pushTimer);
      states.delete(symbol);
      void getStream(marketOf(symbol))
        .release([symbol])
        .catch(() => {});
    }
  };
}
