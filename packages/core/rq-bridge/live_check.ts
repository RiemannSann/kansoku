// 10-08 现场核对用的小工具：不开 App，直接用 kansoku 的米筐行情流跑一会儿，打印看到了什么。
//
//   pnpm --filter @kansoku/core exec tsx rq-bridge/live_check.ts [秒数=30] [代码...]
//
// 默认取 ~/.config/kansoku/cn-watchlist.txt 里的全部自选，外加 600519.SH 的 5 分钟 K 线订阅。
// 输出：交易日历、流量档位和已用量、轮询间隔、报价条数和几只样本、K 线推送。只读，不写任何文件。
import { homedir } from 'node:os';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/platform/env.js';
import { getRicequantGuard } from '../src/marketdata/ricequantGuard.js';
import { getRicequantStream, resetRicequantStream } from '../src/marketdata/ricequantStream.js';
import { resetRicequantBridge } from '../src/marketdata/ricequantBridge.js';
import { readCnWatchlist } from '../src/marketdata/cnWatchlist.js';

const seconds = Number(process.argv[2] ?? 30);
const explicit = process.argv.slice(3);

const fmt = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

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

async function main(): Promise<void> {
  const symbols = explicit.length ? explicit : await readCnWatchlist();
  const chartSymbol = symbols.includes('600519.SH') ? '600519.SH' : symbols[0];
  const guard = getRicequantGuard();
  await guard.refresh();
  const status = guard.status();
  console.info(
    `[${fmt(Date.now())}] 交易日=${status.tradingDay} 档位=${status.tier} 已用=${
      status.used != null && status.limit
        ? `${((status.used / status.limit) * 100).toFixed(2)}%`
        : '?'
    } 轮询间隔=${guard.pollIntervalMs()}ms 自选=${symbols.length} 只`,
  );

  const stream = getRicequantStream();
  let updates = 0;
  stream.onUpdate(() => updates++);
  stream.subscribeCandlesticks(chartSymbol, '5m', (bar) => {
    console.info(
      `[${fmt(Date.now())}] ${chartSymbol} 5m bar ${fmt(bar.ts)} O${bar.open} H${bar.high} L${bar.low} C${bar.close} V${bar.volume}`,
    );
  });
  const started = Date.now();
  await stream.retain(symbols);
  console.info(`[${fmt(Date.now())}] 首轮快照 ${Date.now() - started}ms，报价更新 ${updates} 条`);
  for (const symbol of [chartSymbol, ...symbols.slice(0, 3)]) {
    const cell = stream.getSnapshot(symbol);
    console.info(
      cell
        ? `  ${symbol} ${cell.session} 现价 ${cell.last} 涨跌 ${cell.pct?.toFixed(2)}% 时间 ${cell.asOf ? fmt(Date.parse(cell.asOf)) : '?'}`
        : `  ${symbol} 没有报价`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  console.info(`[${fmt(Date.now())}] ${seconds} 秒内报价更新共 ${updates} 条`);
  const after = getRicequantGuard().status();
  console.info(
    `  已用 ${after.used != null && status.used != null ? `${((after.used - status.used) / 1024).toFixed(1)} KB（读数每 5 分钟刷新一次，短时间内可能还没变）` : '?'}`,
  );
  await stream.release(symbols);
  resetRicequantStream();
  resetRicequantBridge();
}

main().catch((error: unknown) => {
  console.error(error);
  resetRicequantBridge();
  process.exitCode = 1;
});
