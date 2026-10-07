import type {
  SectorBoard,
  SectorDetail,
  SectorMember,
  SectorStat,
  StockIndustry,
} from '@kansoku/shared/types';

// 申万行业的当日统计：纯计算，输入是米筐的行业归属表（sw_map）+ 全市场精简快照（market_snapshot）。
// 行业代码就是申万行业指数代码（801780.INDX = 银行），所以行业涨跌幅直接取指数快照；
// 指数没取到时退回成员股简单平均，并标出来。

export interface SwMap {
  /** 米筐取表的北京日期 */
  day: string;
  stocks: Record<string, { name: string; l1: string; l2: string | null }>;
  industries: Record<string, { name: string; level: 1 | 2; parent?: string }>;
}

export interface MarketRow {
  symbol: string;
  datetime: string | null;
  last: number | null;
  prev_close: number | null;
  limit_up: number | null;
  limit_down: number | null;
  volume: number;
  turnover: number;
}

// 价格两位小数，留一点浮点余量
const LIMIT_EPS = 0.001;

export function rowPct(row: MarketRow | undefined): number | null {
  if (!row || row.last == null || row.prev_close == null) return null;
  if (row.last <= 0 || row.prev_close <= 0) return null;
  return (row.last / row.prev_close - 1) * 100;
}

export function limitHit(row: MarketRow | undefined): 'up' | 'down' | null {
  if (!row || row.last == null || row.last <= 0) return null;
  if (row.limit_up != null && row.limit_up > 0 && row.last >= row.limit_up - LIMIT_EPS) return 'up';
  if (row.limit_down != null && row.limit_down > 0 && row.last <= row.limit_down + LIMIT_EPS)
    return 'down';
  return null;
}

function latestStamp(rows: Iterable<MarketRow>): string | null {
  let best: string | null = null;
  for (const row of rows) if (row.datetime && (!best || row.datetime > best)) best = row.datetime;
  return best;
}

function emptyStat(code: string, map: SwMap): SectorStat {
  const info = map.industries[code];
  return {
    code,
    name: info?.name ?? code,
    level: info?.level ?? 1,
    ...(info?.parent ? { parent: info.parent } : {}),
    pct: null,
    pctFromIndex: false,
    members: 0,
    up: 0,
    down: 0,
    flat: 0,
    limitUp: 0,
    limitDown: 0,
    turnover: 0,
    leader: null,
  };
}

function byPctDesc(a: { pct: number | null }, b: { pct: number | null }): number {
  return (b.pct ?? -Infinity) - (a.pct ?? -Infinity);
}

export interface SectorSnapshot {
  asOf: string | null;
  stats: Map<string, SectorStat>;
}

/** 按行业汇总：涨跌家数、涨跌停家数、成交额、领涨股、行业涨跌幅 */
export function computeSectorStats(map: SwMap, rows: Map<string, MarketRow>): SectorSnapshot {
  const stats = new Map<string, SectorStat>();
  const pctSums = new Map<string, { sum: number; n: number }>();
  for (const code of Object.keys(map.industries)) stats.set(code, emptyStat(code, map));

  for (const [symbol, info] of Object.entries(map.stocks)) {
    const row = rows.get(symbol);
    const pct = rowPct(row);
    const limit = limitHit(row);
    for (const code of [info.l1, info.l2]) {
      if (!code) continue;
      let stat = stats.get(code);
      if (!stat) {
        stat = emptyStat(code, map);
        stats.set(code, stat);
      }
      stat.members += 1;
      stat.turnover += row?.turnover ?? 0;
      if (pct == null) continue;
      if (pct > 0) stat.up += 1;
      else if (pct < 0) stat.down += 1;
      else stat.flat += 1;
      if (limit === 'up') stat.limitUp += 1;
      if (limit === 'down') stat.limitDown += 1;
      if (!stat.leader || pct > stat.leader.pct) stat.leader = { symbol, name: info.name, pct };
      const acc = pctSums.get(code) ?? { sum: 0, n: 0 };
      acc.sum += pct;
      acc.n += 1;
      pctSums.set(code, acc);
    }
  }

  for (const [code, stat] of stats) {
    const indexPct = rowPct(rows.get(code));
    if (indexPct != null) {
      stat.pct = indexPct;
      stat.pctFromIndex = true;
      continue;
    }
    const acc = pctSums.get(code);
    stat.pct = acc && acc.n ? acc.sum / acc.n : null;
  }
  return { asOf: latestStamp(rows.values()), stats };
}

export function buildSectorBoard(snapshot: SectorSnapshot, map: SwMap, symbols: string[] = []) {
  const l1: SectorStat[] = [];
  const l2: SectorStat[] = [];
  for (const stat of snapshot.stats.values()) (stat.level === 2 ? l2 : l1).push(stat);
  l1.sort(byPctDesc);
  l2.sort(byPctDesc);
  const memberOf: SectorBoard['memberOf'] = {};
  for (const symbol of symbols) {
    const info = map.stocks[symbol];
    if (info) memberOf[symbol] = { l1: info.l1, l2: info.l2 };
  }
  return { asOf: snapshot.asOf, l1, l2, memberOf } satisfies SectorBoard;
}

export function buildSectorDetail(
  snapshot: SectorSnapshot,
  map: SwMap,
  rows: Map<string, MarketRow>,
  code: string,
): SectorDetail | null {
  const stat = snapshot.stats.get(code);
  if (!stat) return null;
  const members: SectorMember[] = [];
  for (const [symbol, info] of Object.entries(map.stocks)) {
    if (info.l1 !== code && info.l2 !== code) continue;
    const row = rows.get(symbol);
    members.push({
      symbol,
      name: info.name,
      last: row?.last != null && row.last > 0 ? row.last : null,
      pct: rowPct(row),
      turnover: row?.turnover ?? 0,
      limit: limitHit(row),
    });
  }
  members.sort(byPctDesc);
  return { asOf: snapshot.asOf, stat, members };
}

export function buildStockIndustry(
  snapshot: SectorSnapshot,
  map: SwMap,
  symbol: string,
): StockIndustry {
  const info = map.stocks[symbol];
  return {
    symbol,
    asOf: snapshot.asOf,
    l1: info ? (snapshot.stats.get(info.l1) ?? null) : null,
    l2: info?.l2 ? (snapshot.stats.get(info.l2) ?? null) : null,
  };
}
