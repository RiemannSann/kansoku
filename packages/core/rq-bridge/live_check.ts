// 10-08 现场核对：一条命令跑完，输出「通过 / 失败 / 提示 / 跳过」表。不开 App 也能用，只读。
//
//   pnpm --filter @kansoku/core live-check            # 默认观察 20 秒，取 ~/.config/kansoku/cn-watchlist.txt 全部自选
//   pnpm --filter @kansoku/core live-check 30 600519.SH 000001.SZ
//
// 按当前北京时间判断该查哪些项（判定标准在 src/marketdata/liveCheck.ts，有测试）。
// 有任何「失败」时退出码为 1。只读：不写文件、不碰 StockSeller。
import { homedir } from 'node:os';
import path from 'node:path';
import type { RawBar, Timeshare } from '@kansoku/shared/types';
import { PROJECT_ROOT } from '../src/platform/env.js';
import { readCnWatchlist } from '../src/marketdata/cnWatchlist.js';
import type { CandleBar } from '../src/marketdata/candleAggregator.js';
import { evaluateLiveCheck, formatCheckTable } from '../src/marketdata/liveCheck.js';
import { getProvider } from '../src/marketdata/registry.js';
import { getRicequantBridge, resetRicequantBridge } from '../src/marketdata/ricequantBridge.js';
import { getRicequantGuard } from '../src/marketdata/ricequantGuard.js';
import { getRicequantStream, resetRicequantStream } from '../src/marketdata/ricequantStream.js';
import { subscribeTimeshare } from '../src/realtime/timeshare.js';

const args = process.argv.slice(2);
const seconds = /^\d+$/.test(args[0] ?? '') ? Number(args.shift()) : 20;
const explicit = args;
const INDEX = '000001.SH';

// 和 App 一样读仓库 .env 与 ~/.config/kansoku/kansoku.env（已有的环境变量优先）
for (const file of [
  path.join(PROJECT_ROOT, '.env'),
  process.env.KANSOKU_ENV_FILE || path.join(homedir(), '.config', 'kansoku', 'kansoku.env'),
]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // 文件不存在就跳过
  }
}

// 运行期间的轮询失败 / 桥重启都记下来，作为一项检查
const warnings: string[] = [];
const rawWarn = console.warn.bind(console);
console.warn = (...parts: unknown[]) => {
  const text = parts.map(String).join(' ');
  if (/poll failed|restarting/i.test(text)) warnings.push(text.slice(0, 120));
  rawWarn(...parts);
};

async function quotaUsed(): Promise<{ used: number | null; limit: number | null }> {
  try {
    const ping = await getRicequantBridge().call<{ bytes_used?: number; bytes_limit?: number }>(
      'ping',
      {},
    );
    return { used: ping.bytes_used ?? null, limit: ping.bytes_limit ?? null };
  } catch {
    return { used: null, limit: null };
  }
}

async function kline(symbol: string, period: string, count: number): Promise<RawBar[] | string> {
  try {
    return await getProvider('CN').getKline(symbol, period, count);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main(): Promise<void> {
  const symbols = explicit.length ? explicit : await readCnWatchlist();
  // 样本固定用成交最活跃的茅台（不在自选里也加进来，只用来查盘口和 K 线）；指定了代码就用第一个
  const sample = explicit[0] ?? '600519.SH';
  const guard = getRicequantGuard();
  await guard.refresh();
  const start = await quotaUsed();

  const stream = getRicequantStream();
  const pushed = new Map<number, CandleBar>();
  const unsubBars = stream.subscribeCandlesticks(sample, '5m', (bar) => pushed.set(bar.ts, bar));
  let timeshare: Timeshare | null = null;
  const unsubTimeshare = subscribeTimeshare(sample, (envelope) => {
    const msg = JSON.parse(envelope) as { type: string; data?: Timeshare };
    if (msg.type === 'data' && msg.data) timeshare = msg.data;
  });

  const watched = [...new Set([...symbols, sample, INDEX])];
  const started = Date.now();
  let firstRoundMs: number | null = null;
  try {
    await stream.retain(watched);
    firstRoundMs = Date.now() - started;
  } catch (error) {
    warnings.push(`首轮快照失败：${error instanceof Error ? error.message : String(error)}`);
  }
  console.info(`观察 ${seconds} 秒……`);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  const [bars5m, kline1m, klineDay] = await Promise.all([
    kline(sample, '5m', 60),
    kline(sample, '1m', 5),
    kline(sample, 'day', 3),
  ]);
  // App 看到的 5 分钟线 = 米筐历史 + 快照现拼（同一根以快照为准）
  const merged = new Map<number, RawBar>();
  if (Array.isArray(bars5m)) for (const bar of bars5m) merged.set(Date.parse(bar.time), bar);
  for (const bar of pushed.values())
    merged.set(bar.ts, { ...bar, time: new Date(bar.ts).toISOString() });
  const end = await quotaUsed();

  const rows = evaluateLiveCheck({
    now: Date.now(),
    tradingDay: guard.isTradingDay(),
    tier: guard.quotaTier(),
    usedStart: start.used,
    usedEnd: end.used,
    limit: end.limit ?? start.limit,
    pollIntervalMs: guard.pollIntervalMs(),
    watchCount: symbols.length,
    snapshotCount: symbols.filter((s) => stream.getSnapshot(s)).length,
    missing: symbols.filter((s) => !stream.getSnapshot(s)),
    firstRoundMs,
    sample: {
      symbol: sample,
      cell: stream.getSnapshot(sample),
      depth: stream.getDepth(sample),
      bars5m: [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([, bar]) => bar),
      kline1m,
      klineDay,
      timeshare,
    },
    index: { symbol: INDEX, cell: stream.getSnapshot(INDEX) },
    warnings,
  });

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  console.info(`\nkansoku A 股现场核对 · 北京时间 ${now} · 样本 ${sample}\n`);
  console.info(formatCheckTable(rows));
  if (rows.some((row) => row.verdict === '失败')) process.exitCode = 1;

  unsubTimeshare();
  unsubBars();
  await stream.release(watched);
  resetRicequantStream();
  resetRicequantBridge();
  // 定时器（守卫、分时频道）不等了，直接退出
  process.exit(process.exitCode ?? 0);
}

main().catch((error: unknown) => {
  console.error(error);
  resetRicequantBridge();
  process.exit(1);
});
