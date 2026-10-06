import { useSyncExternalStore } from 'react';

// 涨跌配色：'green-up' 是美股习惯（绿涨红跌，原来的默认），'red-up' 是 A 股/同花顺习惯（红涨绿跌）。
//
// 内核算好的图表数据里直接带着颜色（成交量柱、MACD 柱、买卖点标记、止损/目标线……），
// 全是 #26a69a（涨/多/盈）和 #ef5350（跌/空/亏）这两个色。所以切换的做法是「整体对调这两个色」：
// 前端常量 theme.up/down、StyleX 的 colors.up/down、以及进图表前的数据各对调一次。
// theme 常量在模块加载时就被很多地方取走了，所以切换后整页刷新生效。

export type ColorConvention = 'green-up' | 'red-up';

export const DEFAULT_COLOR_CONVENTION: ColorConvention = 'green-up';
export const COLOR_CONVENTION_STORAGE_KEY = 'trade.color-convention';

/** 内核和设计稿里约定的两个色，永远是「绿=涨」口径 */
export const BASE_UP = '#26a69a';
export const BASE_DOWN = '#ef5350';

type ReadableStorage = Pick<Storage, 'getItem'>;

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readColorConvention(
  storage: ReadableStorage | null = browserStorage(),
): ColorConvention {
  if (!storage) return DEFAULT_COLOR_CONVENTION;
  try {
    return storage.getItem(COLOR_CONVENTION_STORAGE_KEY) === 'red-up' ? 'red-up' : 'green-up';
  } catch {
    return DEFAULT_COLOR_CONVENTION;
  }
}

const convention = readColorConvention();

/** 本次页面加载生效的配色（切换后要刷新页面才会变） */
export const activeColorConvention: ColorConvention = convention;
export const isRedUp = convention === 'red-up';

// 一次扫描同时认出两个色（十六进制或 rgb/rgba 写法），各自换成对方，避免先换后又被换回来
const UP_DOWN_PATTERN =
  /#26a69a|#ef5350|(rgba?\()\s*38\s*,\s*166\s*,\s*154\b|(rgba?\()\s*239\s*,\s*83\s*,\s*80\b/gi;

/** 把一个颜色串换成当前配色；绿涨口径下原样返回 */
export function swapUpDown(color: string, redUp: boolean = isRedUp): string {
  if (!redUp) return color;
  return color.replaceAll(UP_DOWN_PATTERN, (match, upPrefix?: string, downPrefix?: string) => {
    const lower = match.toLowerCase();
    if (lower === BASE_UP) return BASE_DOWN;
    if (lower === BASE_DOWN) return BASE_UP;
    if (upPrefix) return `${upPrefix}239, 83, 80`;
    return `${downPrefix}38, 166, 154`;
  });
}

/** 深拷贝一份数据，把其中所有涨跌色按当前配色对调；绿涨口径下原样返回同一个对象 */
export function applyColorConvention<T>(value: T, redUp: boolean = isRedUp): T {
  if (!redUp) return value;
  return swapDeep(value) as T;
}

function swapDeep(value: unknown): unknown {
  if (typeof value === 'string') return swapUpDown(value, true);
  if (Array.isArray(value)) return value.map(swapDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = swapDeep(item);
    return out;
  }
  return value;
}

const listeners = new Set<() => void>();
let stored = convention;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 设置页显示的是「已保存的选择」，可能和本次加载生效的不同（还没刷新） */
export function useStoredColorConvention(): ColorConvention {
  return useSyncExternalStore(
    subscribe,
    () => stored,
    () => DEFAULT_COLOR_CONVENTION,
  );
}

export function setColorConvention(
  next: ColorConvention,
  reload: () => void = defaultReload,
): void {
  if (next === stored) return;
  stored = next;
  try {
    browserStorage()?.setItem(COLOR_CONVENTION_STORAGE_KEY, next);
  } catch {
    // 存不下就只能本次会话无效；不影响其它功能
  }
  for (const listener of listeners) listener();
  if (next !== convention) reload();
}

function defaultReload(): void {
  if (typeof window !== 'undefined') window.location.reload();
}
