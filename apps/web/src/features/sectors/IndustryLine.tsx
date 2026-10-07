import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { SectorStat, StockIndustry } from '@kansoku/shared/types';
import { useWsChannel } from '@web/lib/ws/useWsChannel';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { breadthText, formatPct, pctTone, statTitle, type Tone } from './sectorView';

const styles = stylex.create({
  box: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'grid',
    fontSize: fontSizes.control,
    gap: '4px 8px',
    gridTemplateColumns: 'auto auto auto 1fr',
    marginTop: '12px',
    paddingTop: '10px',
  },
  row: { display: 'contents' },
  label: { color: colors.textSecondary },
  name: { color: colors.textPrimary },
  pct: { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  breadth: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  note: { color: colors.textMuted, fontSize: fontSizes.sm, gridColumn: '1 / -1' },
  up: { color: colors.up },
  down: { color: colors.down },
  flat: { color: colors.textPrimary },
});

const toneStyle = (tone: Tone) =>
  tone === 'up' ? styles.up : tone === 'down' ? styles.down : styles.flat;

function StatRow({ label, stat }: { label: string; stat: SectorStat }) {
  return (
    <div {...stylex.props(styles.row)} title={statTitle(stat)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.name)}>{stat.name}</span>
      <span {...stylex.props(styles.pct, toneStyle(pctTone(stat.pct)))}>{formatPct(stat.pct)}</span>
      <span {...stylex.props(styles.breadth)}>{breadthText(stat)}</span>
    </div>
  );
}

/** 个股所属申万一级 / 二级行业，以及这个行业今天的涨跌和涨停家数（A 股，走米筐） */
export function IndustryLine({ symbol }: { symbol: string }) {
  const [info, setInfo] = useState<StockIndustry | null>(null);
  const { degraded } = useWsChannel<StockIndustry>({ kind: 'cn-industry', symbol }, setInfo);

  if (!info || info.symbol !== symbol || (!info.l1 && !info.l2)) return null;
  return (
    <div {...stylex.props(styles.box)}>
      {info.l1 && <StatRow label="申万一级" stat={info.l1} />}
      {info.l2 && <StatRow label="申万二级" stat={info.l2} />}
      {degraded && <span {...stylex.props(styles.note)}>行业数据暂停更新，显示的是最近一次</span>}
    </div>
  );
}
