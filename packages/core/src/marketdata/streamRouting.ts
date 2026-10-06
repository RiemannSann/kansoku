import { marketOf, type Market } from '../symbols/symbol.utils.js';
import { getProvider, getStream } from './registry.js';
import type { QuoteStream } from './quoteStream.js';
import type { MarketDataProvider, RawQuote } from './types.js';

const MARKETS: Market[] = ['US', 'HK', 'CN'];

/** 各市场实际用到的行情源（去重）；A 股切到米筐时会多出一个 */
export function distinctProviders(): MarketDataProvider[] {
  const set = new Set<MarketDataProvider>();
  for (const market of MARKETS) set.add(getProvider(market));
  return [...set];
}

/**
 * 所有行情源的自选股合并（长桥自选 + 本机 A 股自选）。
 * 一个源失败不拖累其它源；只有全部失败时才抛出第一个错误。
 */
export async function readAllWatchlists(): Promise<string[]> {
  const readers = distinctProviders().flatMap((provider) =>
    provider.getWatchlistSymbols ? [provider.getWatchlistSymbols()] : [],
  );
  if (!readers.length) return [];
  const results = await Promise.allSettled(readers);
  const lists = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (!lists.length) throw (results[0] as PromiseRejectedResult).reason;
  return [...new Set(lists.flat())];
}

/** 是否有任何行情源提供自选股 */
export function hasAnyWatchlist(): boolean {
  return distinctProviders().some((provider) => Boolean(provider.getWatchlistSymbols));
}

/** 按行情源分组（A 股切到米筐后，同一批代码可能要分给两个源） */
export function groupByProvider(symbols: string[]): Array<[MarketDataProvider, string[]]> {
  const groups = new Map<MarketDataProvider, string[]>();
  for (const symbol of symbols) {
    const provider = getProvider(marketOf(symbol));
    const list = groups.get(provider) ?? [];
    list.push(symbol);
    groups.set(provider, list);
  }
  return [...groups];
}

/** 按市场分源拉报价；一个源失败不拖累其它源，全部失败才抛错 */
export async function getQuotesRouted(symbols: string[]): Promise<RawQuote[]> {
  if (!symbols.length) return [];
  const results = await Promise.allSettled(
    groupByProvider(symbols).map(([provider, group]) => provider.getQuotes(group)),
  );
  const lists = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (!lists.length) throw (results[0] as PromiseRejectedResult).reason;
  return lists.flat();
}

export function distinctStreams(): QuoteStream[] {
  const set = new Set<QuoteStream>();
  for (const market of MARKETS) set.add(getStream(market));
  return [...set];
}

function groupByMarket(symbols: string[]): Array<[Market, string[]]> {
  const groups = new Map<Market, string[]>();
  for (const symbol of symbols) {
    const market = marketOf(symbol);
    const list = groups.get(market) ?? [];
    list.push(symbol);
    groups.set(market, list);
  }
  return [...groups];
}

export async function retainSymbols(symbols: string[]): Promise<void> {
  await Promise.all(
    groupByMarket(symbols).map(([market, group]) => getStream(market).retain(group)),
  );
}

export async function releaseSymbols(symbols: string[]): Promise<void> {
  await Promise.all(
    groupByMarket(symbols).map(([market, group]) => getStream(market).release(group)),
  );
}
