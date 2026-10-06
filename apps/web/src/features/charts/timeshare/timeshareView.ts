import type { Timeshare } from '@kansoku/shared/types';

export const SLOTS = 240;

export interface TimeshareRow {
  slot: number;
  price: number | null;
  avg: number | null;
  volume: number | null;
  /** 这一分钟比上一分钟涨还是跌，给量柱上色 */
  tone: 'up' | 'down';
}

export interface TimeshareView {
  rows: TimeshareRow[];
  /** 纵轴以昨收为中线上下对称（同花顺分时图的画法） */
  domain: [number, number];
  /** 右轴涨跌幅刻度对应的价格 */
  ticks: number[];
  prevClose: number | null;
  last: TimeshareRow | null;
}

/** 横轴刻度：09:30 / 10:30 / 11:30|13:00 / 14:00 / 15:00 */
export const X_TICKS: Array<{ slot: number; label: string }> = [
  { slot: 0, label: '09:30' },
  { slot: 60, label: '10:30' },
  { slot: 120, label: '11:30/13:00' },
  { slot: 180, label: '14:00' },
  { slot: SLOTS - 1, label: '15:00' },
];

/** 分钟序号 → 这一分钟结束的时刻（和同花顺十字光标显示的时间一致：第 0 分钟是 09:31） */
export function slotClock(slot: number): string {
  const minutes = slot < 120 ? 9 * 60 + 31 + slot : 13 * 60 + 1 + (slot - 120);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function buildTimeshareView(ts: Timeshare): TimeshareView {
  const bySlot = new Map(ts.points.map((p) => [p.slot, p]));
  const rows: TimeshareRow[] = [];
  let prevPrice = ts.prevClose;
  for (let slot = 0; slot < SLOTS; slot += 1) {
    const point = bySlot.get(slot);
    if (!point) {
      rows.push({ slot, price: null, avg: null, volume: null, tone: 'up' });
      continue;
    }
    rows.push({
      slot,
      price: point.price,
      avg: point.avg,
      volume: point.volume,
      tone: prevPrice == null || point.price >= prevPrice ? 'up' : 'down',
    });
    prevPrice = point.price;
  }

  const prices = ts.points.flatMap((p) => (p.avg == null ? [p.price] : [p.price, p.avg]));
  const center = ts.prevClose ?? prices[0] ?? 0;
  const maxDev = Math.max(center * 0.01, ...prices.map((p) => Math.abs(p - center)));
  const half = maxDev * 1.05;
  const domain: [number, number] = [center - half, center + half];
  return {
    rows,
    domain,
    ticks: [domain[0], center - half / 2, center, center + half / 2, domain[1]],
    prevClose: ts.prevClose,
    last: [...rows].reverse().find((r) => r.price != null) ?? null,
  };
}
