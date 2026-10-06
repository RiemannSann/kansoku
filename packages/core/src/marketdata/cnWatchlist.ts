import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

// A 股自选股：一个纯文本文件，一行一只，# 开头是注释（可以拿来写分组名）。
// 代码写法都认：600519 / 600519.SH / SH600519 / sh600519。
// 米筐没有「自选股」这个概念，所以自选放在本机文件里；同花顺的自选分组可以用
// packages/core/rq-bridge/import_ths_watchlist.py 一键导出到这个文件。

const DEFAULT_FILE = path.join(homedir(), '.config', 'kansoku', 'cn-watchlist.txt');

export function cnWatchlistPath(env: NodeJS.ProcessEnv = process.env): string {
  const file = env.RQ_WATCHLIST_FILE;
  if (!file) return DEFAULT_FILE;
  return file.startsWith('~/') ? path.join(homedir(), file.slice(2)) : file;
}

/** 把一种写法的 A 股代码规范成 600519.SH / 000001.SZ；认不出来返回 null */
export function normalizeCnSymbol(raw: string): string | null {
  const text = raw.trim().toUpperCase();
  let match = /^(\d{6})\.(SH|SZ)$/.exec(text);
  if (match) return `${match[1]}.${match[2]}`;
  match = /^(SH|SZ)(\d{6})$/.exec(text);
  if (match) return `${match[2]}.${match[1]}`;
  match = /^(\d{6})$/.exec(text);
  if (!match) return null;
  const code = match[1]!;
  // 6 开头沪市（含科创板 688），0 / 3 开头深市（含创业板）；北交所等其它代码米筐这边不接
  if (code.startsWith('6')) return `${code}.SH`;
  if (code.startsWith('0') || code.startsWith('3')) return `${code}.SZ`;
  return null;
}

export function parseCnWatchlist(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const content = line.replace(/#.*/, '').trim();
    if (!content) continue;
    for (const token of content.split(/[\s,，]+/)) {
      const symbol = normalizeCnSymbol(token);
      if (symbol) seen.add(symbol);
    }
  }
  return [...seen];
}

/** 文件不存在就是「没有自选」，不是错误 */
export async function readCnWatchlist(file: string = cnWatchlistPath()): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return parseCnWatchlist(text);
}
