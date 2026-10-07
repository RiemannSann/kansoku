// 盘中现场核对的判定逻辑（纯函数）：输入一次运行里观察到的东西，输出「通过 / 失败 / 提示 / 跳过」表。
// 采集在 rq-bridge/live_check.ts；判定放这里是为了能用测试把每个时段的标准钉住。
//
// 时段（北京时间）决定哪些项该查：
//   pre      09:15 前          只查连通、日历、额度、轮询间隔
//   auction  09:15–09:25       竞价显示、竞价不开 K 线
//   matched  09:25–09:30       第一根 K 线 = 撮合价
//   am / pm  连续竞价           报价新鲜、盘口、当天分钟线、分时
//   lunch    11:30–13:00       午休无假 K 线、轮询放慢
//   closed   15:00 后          收盘定格
import type { QuoteCell, QuoteDepth, RawBar, Timeshare } from '@kansoku/shared/types';
import type { QuotaTier } from './ricequantGuard.js';
import { cnPollPhase, parseShanghai, shanghaiDate } from './ricequantTime.js';

export type Verdict = '通过' | '失败' | '提示' | '跳过';

export interface CheckRow {
  name: string;
  verdict: Verdict;
  actual: string;
  expect: string;
}

export type LivePhase =
  'holiday' | 'pre' | 'auction' | 'matched' | 'am' | 'lunch' | 'pm' | 'closed';

export interface LiveObservation {
  now: number;
  tradingDay: boolean | null;
  tier: QuotaTier;
  usedStart: number | null;
  usedEnd: number | null;
  limit: number | null;
  pollIntervalMs: number;
  watchCount: number;
  snapshotCount: number;
  /** 没拿到快照的自选（停牌、退市、代码写错） */
  missing?: string[];
  /** 首轮快照耗时；首轮失败时为 null */
  firstRoundMs: number | null;
  sample: {
    symbol: string;
    cell: QuoteCell | undefined;
    depth: QuoteDepth | undefined;
    /** App 看到的 5 分钟线：米筐历史 + 运行期间快照拼出来的（同一根以快照为准） */
    bars5m: RawBar[];
    /** 米筐 1 分钟线最后几根；取失败时是错误文字 */
    kline1m: RawBar[] | string;
    klineDay: RawBar[] | string;
    timeshare: Timeshare | null;
  };
  index: { symbol: string; cell: QuoteCell | undefined };
  /** 运行期间日志里的 poll failed / restarting 之类 */
  warnings: string[];
}

const ACTIVE_POLL_MS: Record<QuotaTier, number> = {
  normal: 3_000,
  caution: 6_000,
  saving: 15_000,
  stop: 60_000,
};

function minuteOfDay(ts: number): number {
  const d = new Date(ts + 8 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function livePhase(now: number, tradingDay: boolean | null): LivePhase {
  const weekday = new Date(now + 8 * 3_600_000).getUTCDay();
  if (tradingDay === false || weekday === 0 || weekday === 6) return 'holiday';
  const m = minuteOfDay(now);
  if (m < 9 * 60 + 15) return 'pre';
  if (m < 9 * 60 + 25) return 'auction';
  if (m < 9 * 60 + 30) return 'matched';
  if (m < 11 * 60 + 30) return 'am';
  if (m < 13 * 60) return 'lunch';
  if (m < 15 * 60) return 'pm';
  return 'closed';
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const barTs = (bar: RawBar) => Date.parse(bar.time);
const row = (name: string, verdict: Verdict, actual: string, expect: string): CheckRow => ({
  name,
  verdict,
  actual,
  expect,
});

export function evaluateLiveCheck(o: LiveObservation): CheckRow[] {
  const rows: CheckRow[] = [];
  const phase = livePhase(o.now, o.tradingDay);
  const today = shanghaiDate(o.now);
  const at = (hhmm: string) => parseShanghai(`${today} ${hhmm}:00`);
  const trading = phase !== 'holiday';
  const afterOpen = ['matched', 'am', 'lunch', 'pm', 'closed'].includes(phase);
  const continuous = phase === 'am' || phase === 'pm';
  const todayBars = o.sample.bars5m.filter((b) => shanghaiDate(barTs(b)) === today);
  const { cell, depth } = o.sample;

  rows.push(
    o.firstRoundMs != null && o.snapshotCount > 0
      ? row('米筐桥连通', '通过', `首轮快照 ${o.snapshotCount} 只`, '能拿到快照')
      : row('米筐桥连通', '失败', '首轮快照失败', '能拿到快照'),
  );

  if (o.tradingDay == null) rows.push(row('交易日历', '失败', '没取到', '今天是不是交易日'));
  else
    rows.push(
      row(
        '交易日历',
        o.tradingDay ? '通过' : '提示',
        `交易日=${o.tradingDay}`,
        '工作日开盘日应为 true；节假日为 false，后面盘中各项跳过',
      ),
    );

  if (o.usedEnd == null || !o.limit) rows.push(row('额度已用', '失败', '读不到', '< 50%'));
  else {
    const ratio = o.usedEnd / o.limit;
    rows.push(
      row(
        '额度已用',
        ratio < 0.5 ? '通过' : '失败',
        `${pct(ratio)}（档位 ${o.tier}）`,
        '< 50%，档位 normal',
      ),
    );
    if (trading && ['pre', 'auction', 'matched'].includes(phase))
      rows.push(
        row(
          '额度按天重置',
          ratio < 0.01 ? '通过' : '提示',
          pct(ratio),
          '开盘前 < 1%；否则额度可能不是北京零点重置，或别的程序在用同一个 key',
        ),
      );
    if (o.usedStart != null)
      rows.push(
        row(
          '本次运行用量',
          '提示',
          `${((o.usedEnd - o.usedStart) / 1024).toFixed(1)} KB`,
          '仅记录（米筐读数有延迟，短时间内可能为 0）',
        ),
      );
  }

  const pollPhase = cnPollPhase(o.now, o.tradingDay);
  const expectInterval =
    pollPhase === 'closed' ? 300_000 : pollPhase === 'break' ? 60_000 : ACTIVE_POLL_MS[o.tier];
  rows.push(
    row(
      '轮询间隔',
      o.pollIntervalMs === expectInterval ? '通过' : '失败',
      `${o.pollIntervalMs}ms`,
      `${expectInterval}ms（${pollPhase}）`,
    ),
  );

  const coverage = o.watchCount ? o.snapshotCount / o.watchCount : 0;
  rows.push(
    row(
      '快照覆盖自选',
      coverage >= 0.95 ? '通过' : '失败',
      `${o.snapshotCount}/${o.watchCount}${o.missing?.length ? `（缺 ${o.missing.slice(0, 5).join('、')}）` : ''}`,
      '≥ 95%',
    ),
  );
  if (o.firstRoundMs != null)
    rows.push(
      row(
        '首轮快照耗时',
        o.firstRoundMs <= 10_000 ? '通过' : '提示',
        `${o.firstRoundMs}ms`,
        '≤ 10 秒（桥冷启动约 5 秒）',
      ),
    );

  rows.push(
    o.warnings.length === 0
      ? row('运行中报错', '通过', '无', '没有 poll failed / restarting')
      : row(
          '运行中报错',
          '失败',
          o.warnings.slice(0, 3).join('；'),
          '没有 poll failed / restarting',
        ),
  );

  const stockLimits = cell?.limitUp != null && cell.limitDown != null;
  rows.push(
    row(
      '涨跌停价',
      stockLimits && o.index.cell?.limitUp == null ? '通过' : '失败',
      `${o.sample.symbol} ${cell?.limitUp ?? '无'}/${cell?.limitDown ?? '无'}；${o.index.symbol} ${o.index.cell?.limitUp ?? '无'}`,
      '个股有涨停/跌停价，指数没有',
    ),
  );

  if (!trading) {
    rows.push(row('盘中各项', '跳过', '今天不是交易日', '—'));
    return rows;
  }

  // 报价新鲜：竞价和连续竞价时快照时间离现在 ≤ 15 秒
  if (phase === 'auction' || phase === 'matched' || continuous) {
    const asOf = cell?.asOf ? Date.parse(cell.asOf) : null;
    const age = asOf == null ? null : (o.now - asOf) / 1000;
    rows.push(
      row(
        '报价新鲜',
        age != null && age <= 15 ? '通过' : '失败',
        age == null ? '没有报价' : `快照 ${clock(asOf!)}，晚 ${age.toFixed(0)} 秒`,
        '≤ 15 秒',
      ),
    );
  } else rows.push(row('报价新鲜', '跳过', phase, '竞价和连续竞价时查'));

  if (phase === 'auction') {
    const indicative =
      depth?.bids[0]?.price != null && depth.bids[0].price === depth.asks[0]?.price
        ? depth.bids[0].price
        : null;
    rows.push(
      row(
        '竞价显示',
        cell?.session === '集合竞价' && indicative != null && cell.last === indicative
          ? '通过'
          : '失败',
        `${cell?.session ?? '无'} 现价 ${cell?.last ?? '无'}，买一/卖一 ${depth?.bids[0]?.price ?? '无'}/${depth?.asks[0]?.price ?? '无'}`,
        '标"集合竞价"，现价 = 买一 = 卖一',
      ),
    );
    rows.push(
      row(
        '竞价不开 K 线',
        todayBars.length === 0 ? '通过' : '失败',
        `今天的 5 分钟线 ${todayBars.length} 根`,
        '0 根',
      ),
    );
  }

  if (afterOpen) {
    const first = todayBars[0];
    const openOk =
      first != null &&
      barTs(first) === at('09:30') &&
      depth?.open != null &&
      Number(first.open) === depth.open;
    rows.push(
      row(
        '第一根 K 线',
        openOk ? '通过' : '失败',
        first
          ? `${clock(barTs(first))} 开 ${first.open}；快照开盘 ${depth?.open ?? '无'}`
          : '没有今天的 5 分钟线',
        '09:30 这一根，开盘价 = 快照开盘价',
      ),
    );

    rows.push(...minuteBarRows(o, today, continuous));

    const ts = o.sample.timeshare;
    rows.push(
      row(
        '分时图',
        ts != null && ts.date === today && !ts.partial && ts.points.length > 0 ? '通过' : '失败',
        ts == null ? '没有' : `${ts.date} ${ts.points.length} 个点${ts.partial ? '，partial' : ''}`,
        '今天、不是 partial',
      ),
    );
  }

  if (continuous)
    rows.push(
      row(
        '五档盘口',
        depth != null && depth.bids.length === 5 && depth.asks.length === 5 ? '通过' : '失败',
        `买 ${depth?.bids.length ?? 0} 档 / 卖 ${depth?.asks.length ?? 0} 档`,
        '各 5 档（涨跌停封板时一边可能为空，看一眼是不是封板）',
      ),
    );

  if (phase === 'lunch' || phase === 'pm' || phase === 'closed') {
    const fake = todayBars.filter((b) => barTs(b) >= at('11:30') && barTs(b) < at('13:00'));
    rows.push(
      row(
        '午休无假 K 线',
        fake.length === 0 ? '通过' : '失败',
        `午休里的 bar ${fake.length} 根`,
        '0 根',
      ),
    );
  }

  if (phase === 'closed') {
    const last = todayBars.at(-1);
    rows.push(
      row(
        '收盘定格',
        last != null && barTs(last) === at('14:55') && Number(last.close) === cell?.last
          ? '通过'
          : '失败',
        last
          ? `最后一根 ${clock(barTs(last))} 收 ${last.close}；现价 ${cell?.last}`
          : '没有今天的 5 分钟线',
        '最后一根 14:55，收盘 = 现价',
      ),
    );
  }

  return rows;
}

function minuteBarRows(o: LiveObservation, today: string, continuous: boolean): CheckRow[] {
  const out: CheckRow[] = [];
  const { kline1m, klineDay } = o.sample;
  if (typeof kline1m === 'string')
    out.push(row('当天 1 分钟线', '失败', `取失败：${kline1m}`, '有今天的'));
  else {
    const last = kline1m.at(-1);
    const lastTs = last ? barTs(last) : null;
    const isToday = lastTs != null && shanghaiDate(lastTs) === today;
    const lagMin = lastTs == null ? null : (o.now - lastTs) / 60_000;
    const fresh = !continuous || (lagMin != null && lagMin <= 3);
    out.push(
      row(
        '当天 1 分钟线',
        isToday && fresh ? '通过' : '失败',
        lastTs == null ? '没有' : `最后一根 ${shanghaiDate(lastTs)} ${clock(lastTs)}`,
        isToday
          ? '盘中最后一根离现在 ≤ 3 分钟'
          : '有今天的（没有说明 license 不给当天分钟线，分时只能从打开页面起拼）',
      ),
    );
  }
  if (typeof klineDay === 'string')
    out.push(row('当天日 K', '失败', `取失败：${klineDay}`, '有今天这一根'));
  else {
    const last = klineDay.at(-1);
    const day = last ? shanghaiDate(barTs(last)) : null;
    out.push(row('当天日 K', day === today ? '通过' : '失败', day ?? '没有', `有 ${today} 这一根`));
  }
  return out;
}

/** 打成终端里能直接看的表 */
export function formatCheckTable(rows: CheckRow[]): string {
  const lines = ['| 项目 | 结果 | 实际 | 标准 |', '| --- | --- | --- | --- |'];
  for (const r of rows) lines.push(`| ${r.name} | ${r.verdict} | ${r.actual} | ${r.expect} |`);
  const fails = rows.filter((r) => r.verdict === '失败').length;
  lines.push('', fails ? `失败 ${fails} 项` : '全部通过（提示项只需看一眼）');
  return lines.join('\n');
}
