import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { QuoteDepth } from '@kansoku/shared/types';
import { useWsChannel } from '@web/lib/ws/useWsChannel';
import { Badge, Empty, MarketTime, NoteBlock } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { buildDepthView, type DepthRow, type Tone } from './depthView';

const styles = stylex.create({
  head: {
    alignItems: 'baseline',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px',
  },
  last: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xl,
    fontVariantNumeric: 'tabular-nums',
  },
  pct: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.base,
  },
  limits: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.caption,
    gap: '12px',
    marginBottom: '10px',
  },
  book: {
    display: 'grid',
    fontFamily: fonts.mono,
    fontSize: fontSizes.control,
    fontVariantNumeric: 'tabular-nums',
    gridTemplateColumns: '3em 1fr 1fr',
    rowGap: '2px',
  },
  row: {
    display: 'contents',
  },
  label: {
    color: colors.textSecondary,
    fontFamily: fonts.ui,
  },
  num: {
    textAlign: 'right',
  },
  lots: {
    color: colors.textPrimary,
    position: 'relative',
    textAlign: 'right',
  },
  bar: {
    backgroundColor: colors.backgroundHover,
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: -1,
  },
  lotsCell: {
    isolation: 'isolate',
    position: 'relative',
  },
  divider: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    gridColumn: '1 / -1',
    margin: '4px 0',
  },
  stats: {
    display: 'grid',
    fontSize: fontSizes.control,
    gap: '4px 12px',
    gridTemplateColumns: 'auto 1fr auto 1fr',
    marginTop: '12px',
  },
  statLabel: {
    color: colors.textSecondary,
  },
  statValue: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  asOf: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '10px',
  },
  up: { color: colors.up },
  down: { color: colors.down },
  flat: { color: colors.textPrimary },
});

const toneStyle = (tone: Tone) =>
  tone === 'up' ? styles.up : tone === 'down' ? styles.down : styles.flat;

function BookRow({ row }: { row: DepthRow }) {
  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.label)}>{row.label}</span>
      <span {...stylex.props(styles.num, toneStyle(row.tone))}>{row.price}</span>
      <span {...stylex.props(styles.lots, styles.lotsCell)}>
        <span {...stylex.props(styles.bar)} style={{ width: `${Math.round(row.share * 100)}%` }} />
        {row.lots}
      </span>
    </div>
  );
}

/** 个股页「盘口」：五档买卖 + 涨跌停 + 当日开高低，跟着 3 秒快照刷新（只有 A 股有） */
export function DepthTab({ symbol }: { symbol: string }) {
  const [depth, setDepth] = useState<QuoteDepth | null | undefined>(undefined);
  useEffect(() => setDepth(undefined), [symbol]);
  const { degraded } = useWsChannel<QuoteDepth | null>({ kind: 'depth', symbol }, setDepth);

  if (depth === undefined) return <Empty>盘口加载中…</Empty>;
  if (depth === null) return <Empty>当前行情源没有盘口数据</Empty>;

  const view = buildDepthView(depth);
  return (
    <div>
      {degraded && <NoteBlock>盘口暂时取不到，显示的是最近一次数据</NoteBlock>}
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.last, toneStyle(view.tone))}>{view.last}</span>
        {view.pct && <span {...stylex.props(styles.pct, toneStyle(view.tone))}>{view.pct}</span>}
        {view.auction && <Badge tone="accent">集合竞价</Badge>}
        {view.atLimit === 'up' && <Badge tone="up">涨停</Badge>}
        {view.atLimit === 'down' && <Badge tone="down">跌停</Badge>}
      </div>
      {(view.limitUp || view.limitDown) && (
        <div {...stylex.props(styles.limits)}>
          {view.limitUp && (
            <span>
              涨停 <span {...stylex.props(styles.up)}>{view.limitUp}</span>
            </span>
          )}
          {view.limitDown && (
            <span>
              跌停 <span {...stylex.props(styles.down)}>{view.limitDown}</span>
            </span>
          )}
        </div>
      )}
      <div {...stylex.props(styles.book)}>
        {view.asks.map((row) => (
          <BookRow key={row.label} row={row} />
        ))}
        <div {...stylex.props(styles.divider)} />
        {view.bids.map((row) => (
          <BookRow key={row.label} row={row} />
        ))}
      </div>
      <div {...stylex.props(styles.stats)}>
        {view.stats.map((stat) => (
          <div key={stat.label} {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.statLabel)}>{stat.label}</span>
            <span {...stylex.props(styles.statValue, toneStyle(stat.tone))}>{stat.value}</span>
          </div>
        ))}
      </div>
      <div {...stylex.props(styles.asOf)}>
        快照时间 <MarketTime value={depth.asOf} market="CN" format="clock-seconds" />
      </div>
    </div>
  );
}
