import type { CSSProperties } from 'react';
import {
  formatMarketClock,
  formatMarketDateTime,
  localMarketTimeLabel,
} from '@kansoku/shared/time';
import type { Market } from '@kansoku/shared/time';
import { theme } from '@web/lib/theme';

export const tooltipContentStyle: CSSProperties = {
  backgroundColor: theme.bgSurface,
  border: `1px solid ${theme.border}`,
  borderRadius: 4,
  color: theme.textPrimary,
  fontSize: 12,
};

export const tooltipLabelStyle: CSSProperties = {
  color: theme.textSecondary,
  marginBottom: 4,
  whiteSpace: 'pre-line',
};

export const tooltipItemStyle: CSSProperties = { color: theme.textPrimary };

export function hhmm(t: number): string {
  return formatMarketClock(new Date(t));
}

/** 横轴时刻按这只票自己市场的时间（A 股北京时间）；不传市场时和 hhmm 一样按美东 */
export function hhmmIn(market: Market): (t: number) => string {
  return (t) => formatMarketClock(new Date(t), false, market);
}

export function tooltipTimeIn(market: Market): (t: number) => string {
  return (t) => formatMarketDateTime(new Date(t), true, market);
}

export function tooltipTime(t: number): string {
  const date = new Date(t);
  const local = localMarketTimeLabel(date);
  return local ? `${formatMarketDateTime(date)}\n本地时间 ${local}` : formatMarketDateTime(date);
}
