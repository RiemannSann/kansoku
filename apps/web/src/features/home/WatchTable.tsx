import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { QuoteCell } from '@kansoku/shared/types';
import { formatAmount, formatLots } from '@web/features/cockpit/depthView';
import { LIMIT_LABEL } from '@web/lib/limitState';
import { Badge, Empty } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { INDEX_SYMBOLS } from './indexSymbols';
import {
  buildWatchRows,
  nextSort,
  sortWatchRows,
  type SortDir,
  type SortKey,
  type WatchRow,
} from './watchRows';

const STORAGE_KEY = 'kansoku.cn-watch-sort';
const INDEX_SET = new Set(INDEX_SYMBOLS);

const styles = stylex.create({
  table: {
    borderCollapse: 'collapse',
    fontSize: fontSizes.control,
    width: '100%',
  },
  th: {
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.caption,
    'fontWeight': 500,
    'padding': '4px 8px',
    'textAlign': 'right',
    'userSelect': 'none',
    'whiteSpace': 'nowrap',
    ':hover': { color: colors.textPrimary },
  },
  thLeft: { textAlign: 'left' },
  thActive: { color: colors.textPrimary },
  row: {
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'cursor': 'pointer',
    ':hover': { backgroundColor: colors.backgroundHover },
  },
  td: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    padding: '3px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  tdLeft: { fontFamily: fonts.ui, textAlign: 'left' },
  code: { color: colors.textSecondary, fontFamily: fonts.mono },
  name: { color: colors.textPrimary },
  link: { color: 'inherit', textDecoration: 'none' },
  badge: { marginLeft: '6px' },
  up: { color: colors.up },
  down: { color: colors.down },
  flat: { color: colors.textPrimary },
});

const COLUMNS: Array<{ key: SortKey; label: string; left?: boolean }> = [
  { key: 'code', label: '代码', left: true },
  { key: 'order', label: '名称', left: true },
  { key: 'last', label: '现价' },
  { key: 'pct', label: '涨跌幅' },
  { key: 'change', label: '涨跌' },
  { key: 'volume', label: '成交量(手)' },
  { key: 'turnover', label: '成交额' },
];

function readSort(): { key: SortKey; dir: SortDir } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved.key === 'string' && (saved.dir === 'asc' || saved.dir === 'desc'))
      return saved;
  } catch {
    // 读不到就用默认
  }
  return { key: 'order', dir: 'asc' };
}

const toneOf = (row: WatchRow) =>
  row.pct == null || row.pct === 0 ? styles.flat : row.pct > 0 ? styles.up : styles.down;
const digits = (row: WatchRow) => (row.last < 10 && Math.round(row.last * 1000) % 10 !== 0 ? 3 : 2);

/** A 股自选表：和同花顺自选股列表一样一行一只，点表头排序（降序 → 升序 → 自选顺序） */
export function WatchTable({
  quotes,
  profiles,
}: {
  quotes: QuoteCell[];
  profiles: Record<string, { name?: string }>;
}) {
  const [sort, setSort] = useState(readSort);
  const rows = sortWatchRows(buildWatchRows(quotes, profiles, INDEX_SET), sort.key, sort.dir);
  if (!rows.length)
    return <Empty>A 股自选还没有行情（检查 ~/.config/kansoku/cn-watchlist.txt）</Empty>;

  const onSort = (key: SortKey) => {
    const next: { key: SortKey; dir: SortDir } =
      key === 'order' ? { key: 'order', dir: 'asc' } : nextSort(sort, key);
    setSort(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 存不了就只在本页生效
    }
  };
  const arrow = (key: SortKey) =>
    sort.key === key && key !== 'order' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <table {...stylex.props(styles.table)}>
      <thead>
        <tr>
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              {...stylex.props(
                styles.th,
                col.left && styles.thLeft,
                sort.key === col.key && col.key !== 'order' && styles.thActive,
              )}
              onClick={() => onSort(col.key)}
              title={col.key === 'order' ? '恢复自选顺序' : `按${col.label}排序`}
            >
              {col.label}
              {arrow(col.key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const href = `/symbol/${encodeURIComponent(row.symbol)}`;
          const tone = toneOf(row);
          const d = digits(row);
          return (
            <tr key={row.symbol} {...stylex.props(styles.row)}>
              <td {...stylex.props(styles.td, styles.tdLeft, styles.code)}>
                <a href={href} {...stylex.props(styles.link)}>
                  {row.code}
                </a>
              </td>
              <td {...stylex.props(styles.td, styles.tdLeft, styles.name)}>
                <a href={href} {...stylex.props(styles.link)}>
                  {row.name || '—'}
                </a>
                {row.atLimit && (
                  <Badge tone={row.atLimit} {...stylex.props(styles.badge)}>
                    {LIMIT_LABEL[row.atLimit]}
                  </Badge>
                )}
                {row.session === '集合竞价' && (
                  <Badge {...stylex.props(styles.badge)}>{row.session}</Badge>
                )}
              </td>
              <td {...stylex.props(styles.td, tone)}>{row.last.toFixed(d)}</td>
              <td {...stylex.props(styles.td, tone)}>
                {row.pct == null ? '—' : `${row.pct > 0 ? '+' : ''}${row.pct.toFixed(2)}%`}
              </td>
              <td {...stylex.props(styles.td, tone)}>
                {row.change == null ? '—' : `${row.change > 0 ? '+' : ''}${row.change.toFixed(d)}`}
              </td>
              <td {...stylex.props(styles.td)}>
                {row.volume == null ? '—' : formatLots(row.volume)}
              </td>
              <td {...stylex.props(styles.td)}>
                {row.turnover == null ? '—' : formatAmount(row.turnover)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
