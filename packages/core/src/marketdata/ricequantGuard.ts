import type { RicequantCall } from './ricequantBridge.js';
import { getRicequantBridge } from './ricequantBridge.js';
import { cnPollPhase, shanghaiDate } from './ricequantTime.js';

// 米筐流量保护 + 交易日历。
//
// 米筐的流量额度按「每天」算（rqdatac get_quota 文档：bytes_limit 是每日上限，bytes_used 是当日已用），
// 而且是整个 license key 共用的：别的程序用同一个 key 也会算进来。所以这里不自己估算，
// 直接定期读米筐服务端的 bytes_used（ping 本身不计流量，实测 20 次增量为 0），按用量分档降级：
//
//   normal  < 50%   盘中 3 秒一轮
//   caution ≥ 50%   盘中 6 秒一轮
//   saving  ≥ 75%   盘中 15 秒一轮；停掉首页资金流合计、市值、申万行业全市场快照这类可有可无的请求
//   stop    ≥ 90%   盘中 60 秒一轮；只保留报价和 K 线，K 线一次最多 300 根
//
// 除了「已用多少」，还按最近的消耗速度推算到今天结束会用到多少；推算值最多把档位抬到 saving，
// 不会单凭推算就停掉（推算对突发的一次性大请求很敏感）。

export type QuotaTier = 'normal' | 'caution' | 'saving' | 'stop';

export interface QuotaStatus {
  tier: QuotaTier;
  used: number | null;
  limit: number | null;
  /** 推算到今天结束（北京时间 24:00）的用量；数据不够时为 null */
  projected: number | null;
  checkedAt: number | null;
  tradingDay: boolean | null;
}

const TIER_ORDER: QuotaTier[] = ['normal', 'caution', 'saving', 'stop'];
const THRESHOLDS: Array<[number, QuotaTier]> = [
  [0.9, 'stop'],
  [0.75, 'saving'],
  [0.5, 'caution'],
];
const CHECK_EVERY_MS = 5 * 60_000;
const CHECK_EVERY_TIGHT_MS = 60_000;
const BURN_WINDOW_MIN_MS = 10 * 60_000;
const HISTORY_KEEP_MS = 2 * 3_600_000;

const ACTIVE_POLL_MS: Record<QuotaTier, number> = {
  normal: 3_000,
  caution: 6_000,
  saving: 15_000,
  stop: 60_000,
};
const BREAK_POLL_MS = 60_000;
const CLOSED_POLL_MS = 5 * 60_000;

/** 一次快照最多带多少只；超出的轮流带（见 RicequantStream） */
const SNAPSHOT_CAP: Record<QuotaTier, number> = {
  normal: 400,
  caution: 300,
  saving: 200,
  stop: 100,
};

const SAVING_BLOCKED = new Set(['flow_totals', 'market_caps', 'market_snapshot']);
const STOP_BLOCKED = new Set([...SAVING_BLOCKED, 'flow', 'profiles', 'news']);
const STOP_KLINE_MAX = 300;

function tierOfRatio(ratio: number): QuotaTier {
  for (const [min, tier] of THRESHOLDS) if (ratio >= min) return tier;
  return 'normal';
}

function maxTier(a: QuotaTier, b: QuotaTier): QuotaTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

function msUntilShanghaiMidnight(nowMs: number): number {
  const next = Date.parse(`${shanghaiDate(nowMs)}T00:00:00+08:00`) + 24 * 3_600_000;
  return Math.max(0, next - nowMs);
}

interface Reading {
  at: number;
  used: number;
}

interface PingData {
  bytes_used?: number | null;
  bytes_limit?: number | null;
}

interface CalendarData {
  today: string;
  is_trading_day: boolean;
}

export interface RicequantGuardDeps {
  call?: RicequantCall;
  now?: () => number;
  log?: (message: string) => void;
}

export class RicequantGuard {
  private readonly call: RicequantCall;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  private tier: QuotaTier = 'normal';
  private limit: number | null = null;
  private history: Reading[] = [];
  private projected: number | null = null;
  private checkedAt: number | null = null;
  private quotaInflight: Promise<void> | null = null;

  private calendar: { day: string; trading: boolean } | null = null;
  private calendarInflight: Promise<void> | null = null;
  private calendarFailedAt = 0;

  constructor(deps: RicequantGuardDeps = {}) {
    this.call = deps.call ?? ((method, params) => getRicequantBridge().call(method, params));
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? ((message) => console.warn(`[ricequant-quota] ${message}`));
  }

  /** 不阻塞调用方：读数过期了就在后台刷新，返回在跑的那次（测试里可以 await） */
  refresh(): Promise<void> {
    const now = this.now();
    const jobs: Promise<void>[] = [];
    const every = this.tier === 'normal' ? CHECK_EVERY_MS : CHECK_EVERY_TIGHT_MS;
    if (!this.quotaInflight && (this.checkedAt == null || now - this.checkedAt >= every)) {
      this.quotaInflight = this.checkQuota().finally(() => {
        this.quotaInflight = null;
      });
    }
    if (this.quotaInflight) jobs.push(this.quotaInflight);
    const today = shanghaiDate(now);
    if (
      !this.calendarInflight &&
      this.calendar?.day !== today &&
      now - this.calendarFailedAt >= CHECK_EVERY_TIGHT_MS
    ) {
      this.calendarInflight = this.checkCalendar().finally(() => {
        this.calendarInflight = null;
      });
    }
    if (this.calendarInflight) jobs.push(this.calendarInflight);
    return Promise.all(jobs).then(() => {});
  }

  private async checkQuota(): Promise<void> {
    let data: PingData;
    try {
      data = await this.call<PingData>('ping', {});
    } catch {
      return; // 读不到就维持原档位，下次再试
    }
    const now = this.now();
    this.checkedAt = now;
    const used = Number(data.bytes_used);
    const limit = Number(data.bytes_limit);
    if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
      this.limit = null;
      this.setTier('normal', '米筐没有返回流量上限，按不限量处理');
      return;
    }
    this.limit = limit;
    // 跨过北京时间零点（额度重置）后旧读数作废
    const last = this.history.at(-1);
    if (last && (used < last.used || shanghaiDate(last.at) !== shanghaiDate(now)))
      this.history = [];
    this.history.push({ at: now, used });
    this.history = this.history.filter((r) => now - r.at <= HISTORY_KEEP_MS);

    const first = this.history[0];
    this.projected = null;
    if (now - first.at >= BURN_WINDOW_MIN_MS) {
      const perMs = (used - first.used) / (now - first.at);
      this.projected = used + perMs * msUntilShanghaiMidnight(now);
    }
    let next = tierOfRatio(used / limit);
    if (this.projected != null) {
      const fromProjection = tierOfRatio(this.projected / limit);
      next = maxTier(next, fromProjection === 'stop' ? 'saving' : fromProjection);
    }
    const pct = ((used / limit) * 100).toFixed(1);
    const projectedText =
      this.projected == null
        ? ''
        : `，按当前速度今天会用到 ${((this.projected / limit) * 100).toFixed(1)}%`;
    this.setTier(next, `今日已用 ${pct}%${projectedText}`);
  }

  private setTier(next: QuotaTier, reason: string): void {
    if (next === this.tier) return;
    this.log(`流量档位 ${this.tier} → ${next}（${reason}）`);
    this.tier = next;
  }

  private async checkCalendar(): Promise<void> {
    try {
      const data = await this.call<CalendarData>('calendar', {});
      this.calendar = { day: data.today, trading: Boolean(data.is_trading_day) };
    } catch {
      this.calendarFailedAt = this.now();
    }
  }

  quotaTier(): QuotaTier {
    return this.tier;
  }

  /** 今天是不是交易日；还没取到（或取的是昨天的）时为 null */
  isTradingDay(): boolean | null {
    const today = shanghaiDate(this.now());
    return this.calendar?.day === today ? this.calendar.trading : null;
  }

  /** 快照轮询间隔 */
  pollIntervalMs(): number {
    void this.refresh();
    const phase = cnPollPhase(this.now(), this.isTradingDay());
    if (phase === 'closed') return CLOSED_POLL_MS;
    if (phase === 'break') return BREAK_POLL_MS;
    return ACTIVE_POLL_MS[this.tier];
  }

  snapshotCap(): number {
    return SNAPSHOT_CAP[this.tier];
  }

  /** 当前档位下这个桥方法还能不能调；不能时给出原因 */
  blockReason(method: string): string | null {
    void this.refresh();
    const blocked =
      this.tier === 'stop' ? STOP_BLOCKED : this.tier === 'saving' ? SAVING_BLOCKED : null;
    if (!blocked?.has(method)) return null;
    const pct =
      this.limit && this.history.length
        ? `${((this.history.at(-1)!.used / this.limit) * 100).toFixed(0)}%`
        : '较多';
    return `米筐今日流量已用 ${pct}，暂停「${method}」这类非必需请求，保住报价和 K 线`;
  }

  /** stop 档位下压低单次 K 线根数 */
  klineCount(count: number): number {
    return this.tier === 'stop' ? Math.min(count, STOP_KLINE_MAX) : count;
  }

  status(): QuotaStatus {
    return {
      tier: this.tier,
      used: this.history.at(-1)?.used ?? null,
      limit: this.limit,
      projected: this.projected,
      checkedAt: this.checkedAt,
      tradingDay: this.isTradingDay(),
    };
  }
}

let shared: RicequantGuard | null = null;

export function getRicequantGuard(): RicequantGuard {
  if (!shared) shared = new RicequantGuard();
  return shared;
}

export function resetRicequantGuard(): void {
  shared = null;
}
