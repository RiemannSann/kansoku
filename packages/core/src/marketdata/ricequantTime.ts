// A 股（上海时间，无夏令时）K 线时间规则。
//
// 米筐的分钟线按「收盘时刻」打标签（09:31 是第一根 1m，10:30 / 11:30 / 14:00 / 15:00 是四根 60m），
// kansoku 全局约定 K 线 time = 开盘时刻（见 CandleAggregator：新 bar 的 ts 是区间起点）。
// 这里把两边统一：标签往回退 1ms 再按交易时段分桶，就得到起点；实时快照也走同一个分桶函数，
// 所以拉回来的历史 K 线和盘中拼出来的 bar 的 ts 一定对得上。

const SHANGHAI_OFFSET_MIN = 8 * 60;
const MINUTE_MS = 60_000;
const DAY_MIN = 24 * 60;

const AM_OPEN = 9 * 60 + 30;
const AM_CLOSE = 11 * 60 + 30;
const PM_OPEN = 13 * 60;
const PM_CLOSE = 15 * 60;
const AM_MINUTES = AM_CLOSE - AM_OPEN;

/** "YYYY-MM-DD HH:MM:SS"（上海时间）→ epoch ms */
export function parseShanghai(label: string): number {
  const [day, clock = '00:00:00'] = label.trim().split(/[ T]/);
  return Date.parse(`${day}T${clock}+08:00`);
}

function shanghaiMinuteOfDay(tsMs: number): { dayStartMs: number; minute: number } {
  const localMin = Math.floor(tsMs / MINUTE_MS) + SHANGHAI_OFFSET_MIN;
  const minute = ((localMin % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const dayStartMs = (localMin - minute - SHANGHAI_OFFSET_MIN) * MINUTE_MS;
  return { dayStartMs, minute };
}

/**
 * 时间点所属 K 线的起点（epoch ms）。集合竞价（09:30 前）归第一根，午休归上午最后一根，
 * 15:00 之后（收盘集合竞价的成交回报）归最后一根，与米筐/交易所的分钟线口径一致。
 */
export function cnBucketStart(tsMs: number, periodMinutes: number): number {
  const { dayStartMs } = shanghaiMinuteOfDay(tsMs);
  const exactMin = (tsMs - dayStartMs) / MINUTE_MS;
  let sessionOffset: number;
  if (exactMin < AM_OPEN) sessionOffset = 0;
  else if (exactMin < AM_CLOSE) sessionOffset = exactMin - AM_OPEN;
  else if (exactMin < PM_OPEN) sessionOffset = AM_MINUTES - 1;
  else if (exactMin < PM_CLOSE) sessionOffset = AM_MINUTES + (exactMin - PM_OPEN);
  else sessionOffset = AM_MINUTES + (PM_CLOSE - PM_OPEN) - 1;
  const bucketOffset = Math.floor(sessionOffset / periodMinutes) * periodMinutes;
  const startMin =
    bucketOffset < AM_MINUTES ? AM_OPEN + bucketOffset : PM_OPEN + (bucketOffset - AM_MINUTES);
  return dayStartMs + startMin * MINUTE_MS;
}

const PERIOD_MINUTES: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '60m': 60,
};

export function periodMinutes(period: string): number | null {
  return PERIOD_MINUTES[period] ?? null;
}

/**
 * 米筐 K 线标签 → kansoku 的 bar time（ISO UTC）。
 * 分钟线：收盘标签 → 开盘时刻；日/周/月线：当天上海 00:00（和长桥日线的「市场当地零点」约定一致）。
 */
export function rqBarTime(label: string, period: string): string {
  const minutes = periodMinutes(period);
  const ts = parseShanghai(label);
  if (minutes == null) {
    const { dayStartMs } = shanghaiMinuteOfDay(ts);
    return new Date(dayStartMs).toISOString();
  }
  return new Date(cnBucketStart(ts - 1, minutes)).toISOString();
}

/** 是否处在需要高频轮询的时段：工作日 09:15–11:31、12:59–15:01（上海时间）。节假日由快照时间戳自然过滤。 */
export function isCnActiveWindow(nowMs: number): boolean {
  const { minute } = shanghaiMinuteOfDay(nowMs);
  const weekday = new Date(nowMs + SHANGHAI_OFFSET_MIN * MINUTE_MS).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return (
    (minute >= 9 * 60 + 15 && minute < 11 * 60 + 31) ||
    (minute >= 12 * 60 + 59 && minute < 15 * 60 + 1)
  );
}

const OPEN_AUCTION_START = 9 * 60 + 15;
const LAST_FEED_MIN = PM_CLOSE + 1;

/** 开盘集合竞价阶段（09:15–09:30，含 09:25 撮合后到连续竞价开始前的几分钟） */
export function isCnOpenAuction(tsMs: number): boolean {
  const { minute } = shanghaiMinuteOfDay(tsMs);
  return minute >= OPEN_AUCTION_START && minute < AM_OPEN;
}

/**
 * 这个时刻的快照还能不能计入当天 K 线：09:15 到 15:00:59，午休（11:31–13:00）除外。
 * 15:00 收盘撮合的回报会晚一两秒到，所以放宽到 15:00:59；之后的累计量变化
 * （科创板/创业板 15:05–15:30 盘后固定价格交易）不属于任何一根 K 线，K 线就此定格。
 */
export function cnSnapshotFeedsBars(tsMs: number): boolean {
  const { minute } = shanghaiMinuteOfDay(tsMs);
  if (minute < OPEN_AUCTION_START || minute >= LAST_FEED_MIN) return false;
  return minute < AM_CLOSE + 1 || minute >= PM_OPEN;
}

/** 两个时间点是否是同一个上海自然日 */
export function sameShanghaiDay(a: number, b: number): boolean {
  return shanghaiMinuteOfDay(a).dayStartMs === shanghaiMinuteOfDay(b).dayStartMs;
}

/** 上海日期 "YYYY-MM-DD" */
export function shanghaiDate(tsMs: number): string {
  return new Date(shanghaiMinuteOfDay(tsMs).dayStartMs + SHANGHAI_OFFSET_MIN * MINUTE_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * 轮询节奏分档：
 * - active：交易日盘中（含集合竞价、收盘撮合前后各一分钟），要高频；
 * - break：交易日 09:00–09:15 和午休，行情不动但马上要开盘，低频；
 * - closed：收盘后、开盘前、周末、节假日，行情定格，很低频。
 * tradingDay 为 null（日历还没取到）时按交易日处理：宁可节假日多拉几次，也不能交易日没行情。
 */
export function cnPollPhase(
  nowMs: number,
  tradingDay: boolean | null,
): 'active' | 'break' | 'closed' {
  const weekday = new Date(nowMs + SHANGHAI_OFFSET_MIN * MINUTE_MS).getUTCDay();
  if (weekday === 0 || weekday === 6 || tradingDay === false) return 'closed';
  if (isCnActiveWindow(nowMs)) return 'active';
  const { minute } = shanghaiMinuteOfDay(nowMs);
  return minute >= 9 * 60 && minute < PM_CLOSE ? 'break' : 'closed';
}

/** 一天切成五段：开盘前 / 上午盘（含竞价）/ 午休 / 下午盘 / 收盘后；周末整天算"不动"的一段 */
function cnSegment(tsMs: number): { key: string; quiet: boolean } {
  const weekday = new Date(tsMs + SHANGHAI_OFFSET_MIN * MINUTE_MS).getUTCDay();
  const day = shanghaiDate(tsMs);
  if (weekday === 0 || weekday === 6) return { key: `${day}|weekend`, quiet: true };
  const { minute } = shanghaiMinuteOfDay(tsMs);
  const bounds = [9 * 60 + 15, 11 * 60 + 31, 12 * 60 + 59, PM_CLOSE + 1];
  const index = bounds.filter((b) => minute >= b).length;
  return { key: `${day}|${index}`, quiet: index % 2 === 0 };
}

/**
 * A 股数据缓存还新不新鲜：盘中按 activeTtlMs；
 * 开盘前、午休、收盘后、周末行情不动，同一段里按 quietTtlMs（通常长得多），一跨段立刻失效——
 * 比如 15:00:30 拉的资金流在 15:01 收盘段开始时重拉一次，之后整晚不用再拉。
 */
export function cnCacheFresh(
  atMs: number,
  nowMs: number,
  activeTtlMs: number,
  quietTtlMs: number,
): boolean {
  const then = cnSegment(atMs);
  const current = cnSegment(nowMs);
  if (then.key !== current.key) return false;
  return nowMs - atMs < (current.quiet ? quietTtlMs : activeTtlMs);
}
