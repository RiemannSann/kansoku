import { useState } from 'react';
import type { KlineAdjust } from '@kansoku/shared/types';
import { marketOfSymbol } from '@web/lib/market';

const STORAGE_KEY = 'kansoku.cn-adjust';

export const ADJUST_OPTIONS: Array<{ value: KlineAdjust; label: string; title: string }> = [
  {
    value: 'pre',
    label: '前复权',
    title: '以最新价为准，把历史价格按分红送转往前调（同花顺默认）',
  },
  { value: 'none', label: '不复权', title: '历史价格保持当时的成交价，除权日会出现缺口' },
  { value: 'post', label: '后复权', title: '以上市首日为准往后调，适合看长期真实涨幅' },
];

export function parseAdjust(raw: string | null): KlineAdjust {
  return raw === 'none' || raw === 'post' ? raw : 'pre';
}

function readSaved(): KlineAdjust {
  try {
    return parseAdjust(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'pre';
  }
}

/**
 * A 股 K 线复权方式（前复权默认）。只作用于从行情源现拉的周期（日 / 周 / 月 / 1 分钟 / 30 分钟）；
 * 5 / 15 / 60 分钟是分析时存下的数据，固定前复权；分时图永远不复权。非 A 股恒为 pre、不显示开关。
 */
export function useKlineAdjust(sym: string): {
  available: boolean;
  adjust: KlineAdjust;
  setAdjust: (next: KlineAdjust) => void;
} {
  const available = marketOfSymbol(sym) === 'CN';
  const [value, setValue] = useState(readSaved);
  const setAdjust = (next: KlineAdjust) => {
    setValue(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不了就只在本页生效
    }
  };
  return { available, adjust: available ? value : 'pre', setAdjust };
}
