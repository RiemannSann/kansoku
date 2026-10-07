import {
  type AnnotationsChangedEvent,
  loadAnnotations,
  onAnnotationsChanged,
} from '../charts/annotations.js';
import { clampViewCount } from '../analysis/history.js';
import type { ProChannel } from '@kansoku/pro-api';
import { normalizeSymbol } from '../symbols/symbol.utils.js';
import { currentProChannels } from '../pro/channels.js';
import { coreAiChannels } from './aiChannels.js';
import { subscribeAnalyses } from './analyses.js';
import { subscribeBenchmark } from './benchmark.js';
import { subscribeBoard } from './board.js';
import { getSectorService } from './cnSectors.js';
import { subscribeDepth } from './depth.js';
import { subscribeChart, subscribePreview } from './charts.js';
import type { Connection } from './connection.js';
import { subscribeEvents } from './events.js';
import { subscribePosition } from './position.js';
import { subscribeQuotes } from './quotes.js';
import { subscribeTimeshare } from './timeshare.js';

// 网页整页共用一条连接：A 股个股页（盘口、分时、行业……）一页就要 20 多个频道，
// 16 个的老上限会把后订阅的（标注、行业）悄悄丢掉。上限只防失控，超了要明说
export const MAX_CHANNELS_PER_SOCKET = 64;

const STATIC_KINDS = [
  'quotes',
  'chart',
  'analyses',
  'position',
  'benchmark',
  'board',
  'preview',
  'annotations',
  'events',
  'depth',
  'timeshare',
  'cn-sectors',
  'cn-sector',
  'cn-industry',
] as const;

export interface WsSub {
  op: 'sub';
  key: string;
  kind: (typeof STATIC_KINDS)[number] | string;
  extra?: string[];
  id?: string;
  count?: number;
  symbol?: string;
  path?: string;
}

export interface WsUnsub {
  op: 'unsub';
  key: string;
}

export type WsClientMessage = WsSub | WsUnsub;

function findChannel(kind: string): ProChannel | undefined {
  return [...coreAiChannels, ...currentProChannels()].find((c) => c.kind === kind);
}

export function parseWsMessage(raw: unknown): WsClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const msg = raw as Record<string, unknown>;
  if (typeof msg.key !== 'string' || !msg.key || msg.key.length > 200) return null;
  if (msg.op === 'unsub') return { op: 'unsub', key: msg.key };
  if (msg.op !== 'sub') return null;
  if (msg.kind === 'quotes') {
    const extra = Array.isArray(msg.extra)
      ? msg.extra.filter((s): s is string => typeof s === 'string')
      : [];
    return { op: 'sub', key: msg.key, kind: 'quotes', extra };
  }
  if (msg.kind === 'chart') {
    if (typeof msg.id !== 'string' || !msg.id) return null;
    const count =
      typeof msg.count === 'number' && Number.isFinite(msg.count) ? msg.count : undefined;
    return { op: 'sub', key: msg.key, kind: 'chart', id: msg.id, count };
  }
  if (msg.kind === 'analyses') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'analyses', symbol: msg.symbol };
  }
  if (msg.kind === 'position') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'position', symbol: msg.symbol };
  }
  if (msg.kind === 'benchmark') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'benchmark', symbol: msg.symbol };
  }
  if (msg.kind === 'preview') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'preview', symbol: msg.symbol };
  }
  if (msg.kind === 'timeshare') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'timeshare', symbol: msg.symbol };
  }
  if (msg.kind === 'depth') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'depth', symbol: msg.symbol };
  }
  if (msg.kind === 'cn-sectors') {
    const extra = Array.isArray(msg.extra)
      ? msg.extra.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 400)
      : [];
    return { op: 'sub', key: msg.key, kind: 'cn-sectors', extra };
  }
  if (msg.kind === 'cn-sector' || msg.kind === 'cn-industry') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: msg.kind, symbol: msg.symbol };
  }
  if (msg.kind === 'board') {
    return { op: 'sub', key: msg.key, kind: 'board' };
  }
  if (msg.kind === 'annotations') {
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'annotations', symbol: msg.symbol };
  }
  if (msg.kind === 'events') {
    // The symbol is optional here: the home feed wants every event, a symbol page
    // wants one name. An empty string is a bug at the caller, not "unfiltered".
    if (msg.symbol === undefined) return { op: 'sub', key: msg.key, kind: 'events' };
    if (typeof msg.symbol !== 'string' || !msg.symbol) return null;
    return { op: 'sub', key: msg.key, kind: 'events', symbol: msg.symbol };
  }
  if (typeof msg.kind === 'string') {
    const channel = findChannel(msg.kind);
    if (channel) {
      const parsed = channel.parse(msg);
      if (!parsed) return null;
      return { op: 'sub', key: msg.key, kind: msg.kind, ...parsed };
    }
  }
  return null;
}

function pushAnnotationsUpdate(
  push: (envelope: string) => void,
  event: AnnotationsChangedEvent,
): void {
  push(
    JSON.stringify({
      type: 'update',
      annotations: event.annotations,
      ...(event.clientId !== undefined ? { clientId: event.clientId } : {}),
    }),
  );
}

async function attachAnnotations(
  symbol: string,
  push: (envelope: string) => void,
): Promise<() => void> {
  const buffered: AnnotationsChangedEvent[] = [];
  let ready = false;
  const unsub = onAnnotationsChanged(symbol, (event) => {
    if (ready) pushAnnotationsUpdate(push, event);
    else buffered.push(event);
  });
  const annotations = await loadAnnotations(symbol);
  push(JSON.stringify({ type: 'init', annotations }));
  ready = true;
  for (const event of buffered) pushAnnotationsUpdate(push, event);
  return unsub;
}

async function attachChannel(msg: WsSub, push: (envelope: string) => void): Promise<() => void> {
  if (msg.kind === 'quotes') return subscribeQuotes(push, msg.extra ?? []);
  if (msg.kind === 'chart') {
    const count = clampViewCount(msg.count != null ? String(msg.count) : undefined) ?? undefined;
    return subscribeChart(msg.id as string, push, count);
  }
  if (msg.kind === 'analyses')
    return subscribeAnalyses(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'position')
    return subscribePosition(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'benchmark')
    return subscribeBenchmark(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'preview') return subscribePreview(msg.symbol as string, push);
  if (msg.kind === 'annotations') return attachAnnotations(msg.symbol as string, push);
  if (msg.kind === 'events')
    return subscribeEvents(msg.symbol != null ? normalizeSymbol(msg.symbol) : null, push);
  if (msg.kind === 'timeshare')
    return subscribeTimeshare(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'depth') return subscribeDepth(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'cn-sectors')
    return getSectorService().subscribeBoard((msg.extra ?? []).map(normalizeSymbol), push);
  if (msg.kind === 'cn-sector')
    return getSectorService().subscribeSector(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'cn-industry')
    return getSectorService().subscribeIndustry(normalizeSymbol(msg.symbol as string), push);
  if (msg.kind === 'board') return subscribeBoard(push);
  const channel = findChannel(msg.kind);
  if (channel) return channel.attach(msg as unknown as Record<string, unknown>, push);
  return subscribeBoard(push);
}

export function handleConnection(conn: Connection): void {
  const subs = new Map<string, () => void>();
  let closed = false;

  const send = (key: string, envelope: string) => {
    if (!closed) conn.send(`{"key":${JSON.stringify(key)},"payload":${envelope}}`);
  };

  const handle = async (raw: string) => {
    let msg: WsClientMessage | null;
    try {
      msg = parseWsMessage(JSON.parse(raw));
    } catch {
      return;
    }
    if (!msg || closed) return;
    if (msg.op === 'unsub') {
      subs.get(msg.key)?.();
      subs.delete(msg.key);
      return;
    }
    if (subs.has(msg.key)) return;
    if (subs.size >= MAX_CHANNELS_PER_SOCKET) {
      send(
        msg.key,
        JSON.stringify({
          type: 'status',
          degraded: true,
          error: `too many channels on one connection (max ${MAX_CHANNELS_PER_SOCKET})`,
        }),
      );
      return;
    }
    subs.set(msg.key, () => {});
    try {
      const unsub = await attachChannel(msg, (envelope) => send(msg.key, envelope));
      if (closed || !subs.has(msg.key)) {
        unsub();
        return;
      }
      subs.set(msg.key, unsub);
    } catch (err) {
      subs.delete(msg.key);
      send(
        msg.key,
        JSON.stringify({
          type: 'status',
          degraded: true,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  conn.onMessage((raw) => {
    void handle(raw);
  });
  conn.onClose(() => {
    closed = true;
    for (const unsub of subs.values()) unsub();
    subs.clear();
  });
}
