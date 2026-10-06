import type { MarketTemp } from '@kansoku/shared/types';
import type { FlowRow } from '../analysis/simple.js';
import { readLiveSellerHeld } from '../liveSeller/liveSeller.js';
import { getProvider } from '../marketdata/registry.js';
import {
  groupByProvider,
  hasAnyWatchlist,
  readAllWatchlists,
} from '../marketdata/streamRouting.js';
import type { SecurityProfile } from '../marketdata/types.js';
import { marketOf } from '../symbols/symbol.utils.js';

const FLOW_TTL_MS = 60_000;
const OPTION_SYMBOL_RE = /\d{6}[CP]\d+/;

export function flowEligible(symbol: string): boolean {
  return !symbol.startsWith('.') && !OPTION_SYMBOL_RE.test(symbol);
}

const TEMP_TTL_MS = 10 * 60_000;
const WATCH_TTL_MS = 10 * 60_000;
const FLOW_CONCURRENCY = 1;

const CAPS_TTL_MS = 30 * 60_000;

interface HomeExtras {
  flows: Record<string, number | null>;
  flows_at: number | null;
  market: MarketTemp | null;
  caps: Record<string, number>;
  profiles: Record<string, SecurityProfile>;
  live_held?: string[];
}

let flowCache = new Map<string, { at: number; value: number | null }>();
let tempCache: { at: number; value: MarketTemp | null } | null = null;
let watchCache: { at: number; symbols: string[] } | null = null;
let capsCache: { at: number; value: Record<string, number> } | null = null;
// Names and industries barely change; fetched once per symbol per process.
let profileCache = new Map<string, SecurityProfile>();
let warming: Promise<void> | null = null;
let warmQueued: string[] | null = null;
const extrasListeners = new Set<() => void>();

export function resetHomeExtrasForTests(): void {
  flowCache = new Map();
  tempCache = null;
  watchCache = null;
  capsCache = null;
  profileCache = new Map();
  warming = null;
  warmQueued = null;
  extrasListeners.clear();
}

export function onHomeExtrasChange(listener: () => void): () => void {
  extrasListeners.add(listener);
  return () => {
    extrasListeners.delete(listener);
  };
}

export function homeExtrasWarm(): Promise<void> {
  return warming ?? Promise.resolve();
}

async function getCaps(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  if (capsCache && Date.now() - capsCache.at < CAPS_TTL_MS) {
    const missing = symbols.filter((s) => !(s in capsCache!.value));
    if (!missing.length) return capsCache.value;
  }
  const groups = groupByProvider(symbols).filter(([provider]) => provider.getMarketCaps);
  if (!groups.length) return capsCache?.value ?? {};
  const results = await Promise.allSettled(
    groups.map(([provider, group]) => provider.getMarketCaps!(group)),
  );
  const fresh = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (!fresh.length) return capsCache?.value ?? {};
  const value = Object.assign({}, ...fresh) as Record<string, number>;
  capsCache = { at: Date.now(), value };
  return value;
}

async function getProfiles(symbols: string[]): Promise<void> {
  const missing = symbols.filter((s) => !profileCache.has(s));
  const groups = groupByProvider(missing).filter(([provider]) => provider.getSecurityProfiles);
  await Promise.all(
    groups.map(async ([provider, group]) => {
      try {
        const profiles = await provider.getSecurityProfiles!(group);
        for (const symbol of group) profileCache.set(symbol, profiles[symbol] ?? {});
      } catch {
        // Leave them missing so the next warm retries.
      }
    }),
  );
}

export function netInflow(rows: FlowRow[]): number {
  return rows.reduce((sum, row) => {
    const value = Number(row.inflow);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

async function fetchNetInflow(symbol: string): Promise<number | null> {
  const provider = getProvider(marketOf(symbol));
  if (!provider.getFlow) return null;
  try {
    return netInflow(await provider.getFlow(symbol));
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getFlows(symbols: string[]): Promise<Record<string, number | null>> {
  const now = Date.now();
  const stale = symbols.filter((s) => {
    const cached = flowCache.get(s);
    return !cached || now - cached.at >= FLOW_TTL_MS;
  });
  const single: string[] = [];
  for (const [provider, group] of groupByProvider(stale)) {
    if (!provider.getNetInflows) {
      single.push(...group);
      continue;
    }
    const totals = await provider.getNetInflows(group).catch(() => null);
    for (const symbol of group) flowCache.set(symbol, { at: now, value: totals?.[symbol] ?? null });
  }
  if (single.length) {
    const values = await mapWithConcurrency(single, FLOW_CONCURRENCY, fetchNetInflow);
    single.forEach((symbol, i) => flowCache.set(symbol, { at: now, value: values[i] }));
  }
  return Object.fromEntries(symbols.map((s) => [s, flowCache.get(s)?.value ?? null]));
}

async function getMarketTemp(): Promise<MarketTemp | null> {
  if (tempCache && Date.now() - tempCache.at < TEMP_TTL_MS) return tempCache.value;
  const provider = getProvider();
  const value = provider.getMarketTemp
    ? await provider.getMarketTemp('US').catch(() => null)
    : null;
  tempCache = { at: Date.now(), value };
  return value;
}

interface WatchRead {
  symbols: string[];
  failures: string[];
  // How many of the two reads the provider actually offers. Zero means "this
  // provider has no watch list", which is an answer, not a failure.
  attempted: number;
}

async function readWatchSymbols(): Promise<WatchRead> {
  const provider = getProvider();
  const set = new Set<string>();
  const failures: string[] = [];
  let attempted = 0;

  if (hasAnyWatchlist()) {
    attempted += 1;
    try {
      for (const symbol of await readAllWatchlists()) set.add(symbol);
    } catch (error) {
      failures.push(`watchlist — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // StockSeller 实盘仓位：没开看板就是空的，不算失败
  for (const symbol of await readLiveSellerHeld().catch(() => [])) set.add(symbol);
  if (provider.getPositions) {
    attempted += 1;
    try {
      for (const position of await provider.getPositions()) set.add(position.symbol);
    } catch (error) {
      failures.push(`positions — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { attempted, failures, symbols: [...set] };
}

function cacheWatchSymbols(symbols: string[]): void {
  if (symbols.length) watchCache = { at: Date.now(), symbols };
}

export async function getWatchSymbols(): Promise<string[]> {
  if (watchCache && Date.now() - watchCache.at < WATCH_TTL_MS) return watchCache.symbols;
  const { symbols } = await readWatchSymbols();
  cacheWatchSymbols(symbols);
  return symbols;
}

// Same reads, but "both sources refused" is reported instead of being rounded down to
// an empty watch list. A collector that took the empty list at face value would go
// quiet and still claim to be healthy.
export async function getWatchSymbolsStrict(): Promise<string[]> {
  if (watchCache && Date.now() - watchCache.at < WATCH_TTL_MS) return watchCache.symbols;
  const { attempted, failures, symbols } = await readWatchSymbols();
  if (attempted > 0 && failures.length === attempted) {
    throw new Error(`watched symbols unavailable: ${failures.join('; ')}`);
  }
  cacheWatchSymbols(symbols);
  return symbols;
}

function snapshotExtras(symbols: string[], market: MarketTemp | null): HomeExtras {
  const flows = Object.fromEntries(symbols.map((s) => [s, flowCache.get(s)?.value ?? null]));
  const hasFlow = Object.values(flows).some((v) => v != null);
  return {
    flows,
    flows_at: hasFlow ? Date.now() : null,
    market,
    caps: capsCache?.value ?? {},
    profiles: Object.fromEntries(
      symbols.flatMap((s) => {
        const profile = profileCache.get(s);
        return profile && (profile.name || profile.industry) ? [[s, profile]] : [];
      }),
    ),
  };
}

function flowsNeedRefresh(symbols: string[]): boolean {
  const now = Date.now();
  return symbols.some((s) => {
    const cached = flowCache.get(s);
    return !cached || now - cached.at >= FLOW_TTL_MS;
  });
}

function capsNeedRefresh(symbols: string[]): boolean {
  if (!symbols.length) return false;
  if (!symbols.some((s) => getProvider(marketOf(s)).getMarketCaps)) return false;
  if (!capsCache || Date.now() - capsCache.at >= CAPS_TTL_MS) return true;
  return symbols.some((s) => !(s in capsCache!.value));
}

function profilesNeedFetch(symbols: string[]): boolean {
  return symbols.some(
    (s) => !profileCache.has(s) && Boolean(getProvider(marketOf(s)).getSecurityProfiles),
  );
}

function notifyExtrasChange(): void {
  for (const listener of extrasListeners) listener();
}

function startWarm(symbols: string[]): void {
  if (warming) {
    warmQueued = [...new Set([...(warmQueued ?? []), ...symbols])];
    return;
  }
  if (!flowsNeedRefresh(symbols) && !capsNeedRefresh(symbols) && !profilesNeedFetch(symbols)) {
    return;
  }
  warming = (async () => {
    if (symbols.length) await getFlows(symbols).catch(() => {});
    await getCaps(symbols);
    await getProfiles(symbols);
    notifyExtrasChange();
  })().finally(() => {
    warming = null;
    const next = warmQueued;
    warmQueued = null;
    if (next) startWarm(next);
  });
}

export async function buildHomeExtras(extraSymbols: string[]): Promise<HomeExtras> {
  const [watch, market, liveHeld] = await Promise.all([
    getWatchSymbols().catch(() => []),
    getMarketTemp().catch(() => null),
    readLiveSellerHeld().catch(() => []),
  ]);
  const symbols = [...new Set([...watch, ...liveHeld, ...extraSymbols])].filter(flowEligible);
  const extras = { ...snapshotExtras(symbols, market), live_held: liveHeld };
  startWarm(symbols);
  return extras;
}
