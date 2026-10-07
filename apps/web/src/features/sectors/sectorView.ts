import type { SectorBoard, SectorStat } from '@kansoku/shared/types';

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
