import type { SectorBoard, SectorMember, SectorStat } from '@kansoku/shared/types';

export type Tone = 'up' | 'down' | 'flat';

export function pctTone(pct: number | null | undefined): Tone {
  if (pct == null || Math.abs(pct) < 0.005) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

export function formatPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/** 「涨停 3 · 涨 25 跌 12 平 2」，涨停为 0 时不写 */
export function breadthText(stat: SectorStat): string {
  const parts: string[] = [];
  if (stat.limitUp) parts.push(`涨停 ${stat.limitUp}`);
  if (stat.limitDown) parts.push(`跌停 ${stat.limitDown}`);
  parts.push(`涨 ${stat.up} 跌 ${stat.down}${stat.flat ? ` 平 ${stat.flat}` : ''}`);
  return parts.join(' · ');
}

/** 鼠标悬停说明：行业涨跌幅的来源、成员数 */
export function statTitle(stat: SectorStat): string {
  const source = stat.pctFromIndex ? '申万行业指数' : '成员股平均（指数没取到）';
  return `${stat.name}：${formatPct(stat.pct)}（${source}），共 ${stat.members} 只，${breadthText(stat)}`;
}

export interface WatchSector {
  /** 二级行业（更细，和同花顺「所属行业」列一样）；没有二级时用一级 */
  name: string;
  pct: number | null;
  limitUp: number;
  title: string;
}

/** 自选表「行业」列：个股 → 所属二级行业当日表现 */
export function watchSectors(board: SectorBoard | null): Record<string, WatchSector> {
  if (!board) return {};
  const byCode = new Map<string, SectorStat>();
  for (const stat of [...board.l1, ...board.l2]) byCode.set(stat.code, stat);
  const out: Record<string, WatchSector> = {};
  for (const [symbol, codes] of Object.entries(board.memberOf)) {
    const l1 = byCode.get(codes.l1);
    const l2 = codes.l2 ? byCode.get(codes.l2) : undefined;
    const main = l2 ?? l1;
    if (!main) continue;
    out[symbol] = {
      name: main.name,
      pct: main.pct,
      limitUp: main.limitUp,
      title: [l1, l2]
        .filter((s): s is SectorStat => Boolean(s))
        .map(statTitle)
        .join('\n'),
    };
  }
  return out;
}

export type SectorSortKey = 'pct' | 'limitUp' | 'turnover' | 'breadth';

/** 行业排行：默认按涨跌幅从高到低；也能按涨停家数、成交额、上涨占比排。空值排最后，同值按名称 */
export function sortSectors(
  stats: SectorStat[],
  key: SectorSortKey,
  dir: 'asc' | 'desc' = 'desc',
): SectorStat[] {
  const value = (s: SectorStat): number | null => {
    if (key === 'pct') return s.pct;
    if (key === 'limitUp') return s.limitUp;
    if (key === 'turnover') return s.turnover;
    const traded = s.up + s.down + s.flat;
    return traded ? s.up / traded : null;
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...stats].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign || a.name.localeCompare(b.name);
  });
}

/** 二级行业按所属一级分组时用：某个一级下面的二级 */
export function childrenOf(board: SectorBoard, l1: string): SectorStat[] {
  return board.l2.filter((s) => s.parent === l1);
}

/** 成员表的代码：不带 .SH / .SZ，和同花顺一样 */
export function bareCode(symbol: string): string {
  return symbol.replace(/\.(sh|sz)$/i, '');
}

export function memberDigits(member: SectorMember): number {
  const last = member.last;
  return last != null && last < 10 && Math.round(last * 1000) % 10 !== 0 ? 3 : 2;
}

/** 全市场合计（一级行业不重叠，加起来就是全部 A 股） */
export function marketTotal(stats: SectorStat[]): SectorStat {
  const total: SectorStat = {
    code: 'all',
    name: '全市场',
    level: 1,
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
  for (const s of stats) {
    total.members += s.members;
    total.up += s.up;
    total.down += s.down;
    total.flat += s.flat;
    total.limitUp += s.limitUp;
    total.limitDown += s.limitDown;
    total.turnover += s.turnover;
  }
  return total;
}
