import { useState } from 'react';
import { marketOfSymbol } from '@web/lib/market';

const STORAGE_KEY = 'kansoku.cn-timeshare';

function readSaved(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * A 股个股页的「分时」开关：打开时主图换成分时图，点任意 K 线周期就切回去。
 * 记住上次的选择（同花顺习惯是一进个股先看分时）。非 A 股永远是 false。
 */
export function useTimeshareMode(sym: string): {
  available: boolean;
  active: boolean;
  setActive: (on: boolean) => void;
} {
  const available = marketOfSymbol(sym) === 'CN';
  const [on, setOn] = useState(readSaved);
  const setActive = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // 存不了就只在本页生效
    }
  };
  return { available, active: available && on, setActive };
}
