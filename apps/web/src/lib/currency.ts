import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { Market } from '@kansoku/shared/time';
import { marketOfSymbol } from './market';

// 价格前缀跟着股票所在市场走：美股 $、港股 HK$、A 股不带符号（和同花顺一致）。
// 内核生成的提示文字（买卖点、结构标注、区间名……）里写死了 "$"，进图表前用 localizePriceText 统一换掉。

const PREFIX: Record<Market, string> = { US: '$', HK: 'HK$', CN: '' };

export function pricePrefix(symbol: string | null | undefined): string {
  return PREFIX[marketOfSymbol(symbol)];
}

const DOLLAR_BEFORE_NUMBER = /\$(?=-?\d)/g;

/** 深拷贝一份数据，把其中「$ + 数字」的价格前缀换成该市场的写法；美股原样返回同一个对象 */
export function localizePriceText<T>(value: T, symbol: string | null | undefined): T {
  const prefix = pricePrefix(symbol);
  if (prefix === '$') return value;
  return replaceDeep(value, prefix) as T;
}

function replaceDeep(value: unknown, prefix: string): unknown {
  if (typeof value === 'string') return value.replaceAll(DOLLAR_BEFORE_NUMBER, prefix);
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, prefix));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = replaceDeep(item, prefix);
    return out;
  }
  return value;
}

const PricePrefixContext = createContext('$');

/** 给一只股票的页面包一层，里面的价格文字都用这只股票所在市场的前缀 */
export function PricePrefixProvider({
  symbol,
  children,
}: {
  symbol: string | null | undefined;
  children: ReactNode;
}) {
  return createElement(PricePrefixContext.Provider, { value: pricePrefix(symbol) }, children);
}

export function usePricePrefix(): string {
  return useContext(PricePrefixContext);
}
