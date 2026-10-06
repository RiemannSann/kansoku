import { BASE_DOWN, BASE_UP, isRedUp } from '../lib/colorConvention';
import { colors } from './tokens.stylex';

// StyleX 的 colors.up / colors.down 运行时是 "var(--xxxx)"；红涨模式下直接在 <html> 上把这两个变量对调，
// 所有用 colors.up/down 写的样式（涨跌幅、盈亏数字……）一起生效。
function cssVarName(token: string): string | null {
  return /var\((--[^\s),]+)/.exec(token)?.[1] ?? null;
}

export function installColorConventionVars(root: HTMLElement = document.documentElement): void {
  if (!isRedUp) return;
  const up = cssVarName(colors.up);
  const down = cssVarName(colors.down);
  if (up) root.style.setProperty(up, BASE_DOWN);
  if (down) root.style.setProperty(down, BASE_UP);
}
