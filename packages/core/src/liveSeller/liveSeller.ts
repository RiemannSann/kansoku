import type {
  LiveSellerOut,
  LiveSellerSection,
  LiveSellerSections,
} from '../contract/positions.js';
import { normalizeCnSymbol } from '../marketdata/cnWatchlist.js';

// StockSeller（barneyStockSeller）实盘看板的只读接入。
// 数据来自本机跑着的 live_view_web.py（默认 http://127.0.0.1:8766）的 GET /api/snapshot；
// 这里只读快照，不碰任何下单、FIFO 或配置接口。

export const DEFAULT_LIVE_SELLER_URL = 'http://127.0.0.1:8766';
const TIMEOUT_MS = 8000;
const SECTION_KEYS = ['buy', 'intent', 'sold', 'available'] as const;

export function liveSellerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.STOCKSELLER_LIVE_URL || DEFAULT_LIVE_SELLER_URL).replace(/\/+$/, '');
}

interface RawRow {
  cells?: unknown[];
  style?: unknown;
  cell_styles?: unknown[];
}

interface RawSection {
  headers?: unknown[];
  rows?: unknown[];
  count?: unknown;
}

const text = (value: unknown): string => (value == null ? '' : String(value));

function toSection(raw: RawSection | undefined): LiveSellerSection {
  const headers = (raw?.headers ?? []).map(text);
  const codeIndex = headers.findIndex((h) => h.toLowerCase() === 'code');
  const rows = (raw?.rows ?? []).map((value) => {
    const row = (Array.isArray(value) ? { cells: value } : (value ?? {})) as RawRow;
    const cells = (row.cells ?? []).map(text);
    return {
      cells,
      style: text(row.style),
      cellStyles: (row.cell_styles ?? []).map(text),
      symbol: codeIndex >= 0 ? normalizeCnSymbol(cells[codeIndex] ?? '') : null,
    };
  });
  const count = Number(raw?.count);
  return { headers, rows, count: Number.isFinite(count) ? count : rows.length };
}

export function parseLiveSellerSnapshot(url: string, payload: unknown): LiveSellerOut {
  const data = (payload ?? {}) as Record<string, unknown>;
  const sections = (data.sections ?? {}) as Record<string, RawSection>;
  const degraded = (data.degraded ?? {}) as Record<string, unknown>;
  const summary = (data.summary ?? {}) as RawSection & { caption?: unknown };
  return {
    connected: true,
    url,
    updatedAt: text(data.updated_at),
    dataAgeSeconds: typeof data.data_age_seconds === 'number' ? data.data_age_seconds : null,
    degraded: { level: text(degraded.level), reason: text(degraded.reason) },
    lastError: text(data.last_error),
    warnings: ((data.warnings ?? []) as Array<Record<string, unknown>>).map((w) => ({
      source: text(w.source),
      error: text(w.error),
      at: text(w.at),
    })),
    summary: {
      headers: (summary.headers ?? []).map(text),
      rows: (summary.rows ?? []).map((row) =>
        (Array.isArray(row) ? row : ((row as RawRow)?.cells ?? [])).map(text),
      ),
      caption: text(summary.caption),
    },
    sections: Object.fromEntries(
      SECTION_KEYS.map((key) => [key, toSection(sections[key])]),
    ) as unknown as LiveSellerSections,
  };
}

export async function fetchLiveSeller(
  fetchImpl: typeof fetch = fetch,
  url: string = liveSellerUrl(),
): Promise<LiveSellerOut> {
  try {
    const res = await fetchImpl(`${url}/api/snapshot`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { connected: false, url, error: `HTTP ${res.status}` };
    return parseLiveSellerSnapshot(url, await res.json());
  } catch (error) {
    return { connected: false, url, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 实盘里有仓位（买入 / 可卖 / 清仓中）的 A 股代码，首页拿来并进「自选 + 持仓」 */
export function heldSymbols(snapshot: LiveSellerOut): string[] {
  if (!snapshot.connected) return [];
  const out = new Set<string>();
  for (const key of ['buy', 'available', 'sold'] as const) {
    for (const row of snapshot.sections[key].rows) if (row.symbol) out.add(row.symbol);
  }
  return [...out];
}

const HELD_TTL_MS = 30_000;
let heldCache: { at: number; symbols: string[] } | null = null;

/**
 * 首页用：只有在 .env 里设了 STOCKSELLER_LIVE_URL 才把实盘仓位并进首页；
 * 看板没开就当没有实盘仓位，不报错。
 */
export async function readLiveSellerHeld(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  if (!env.STOCKSELLER_LIVE_URL) return [];
  if (heldCache && Date.now() - heldCache.at < HELD_TTL_MS) return heldCache.symbols;
  const symbols = heldSymbols(await fetchLiveSeller());
  heldCache = { at: Date.now(), symbols };
  return symbols;
}

export function resetLiveSellerForTests(): void {
  heldCache = null;
}
