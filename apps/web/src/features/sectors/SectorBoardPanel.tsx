import { Fragment, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { SectorBoard, SectorDetail, SectorStat } from '@kansoku/shared/types';
import { formatAmount } from '@web/features/cockpit/depthView';
import { LIMIT_LABEL } from '@web/lib/limitState';
import { useWsChannel } from '@web/lib/ws/useWsChannel';
import { Badge, Empty, NoteBlock } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import {
  bareCode,
  breadthText,
  childrenOf,
  formatPct,
  marketTotal,
  memberDigits,
  pctTone,
  sortSectors,
  statTitle,
  type SectorSortKey,
  type Tone,
} from './sectorView';

const styles = stylex.create({
  table: { borderCollapse: 'collapse', fontSize: fontSizes.control, width: '100%' },
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
  rowOpen: { backgroundColor: colors.backgroundHover },
  td: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    padding: '3px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  tdLeft: { fontFamily: fonts.ui, textAlign: 'left' },
  muted: { color: colors.textSecondary },
  detailCell: { padding: '6px 8px 10px 24px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' },
  chip: {
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': '3px',
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'fontSize': fontSizes.caption,
    'padding': '1px 6px',
    ':hover': { backgroundColor: colors.backgroundHover },
  },
  chipActive: { borderColor: colors.accent },
  members: { maxHeight: '360px', overflowY: 'auto' },
  link: { color: 'inherit', textDecoration: 'none' },
  badge: { marginLeft: '6px' },
  toolbar: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.caption,
    gap: '8px',
    marginBottom: '6px',
  },
  up: { color: colors.up },
  down: { color: colors.down },
  flat: { color: colors.textPrimary },
});

const toneStyle = (tone: Tone) =>
  tone === 'up' ? styles.up : tone === 'down' ? styles.down : styles.flat;

const COLUMNS: Array<{ key: SectorSortKey | 'name'; label: string; left?: boolean }> = [
  { key: 'name', label: '行业', left: true },
  { key: 'pct', label: '涨跌幅' },
  { key: 'limitUp', label: '涨停' },
  { key: 'breadth', label: '涨 / 跌' },
  { key: 'turnover', label: '成交额' },
  { key: 'name', label: '领涨', left: true },
];

function Members({ code }: { code: string }) {
  const [detail, setDetail] = useState<SectorDetail | null>(null);
  const { degraded } = useWsChannel<SectorDetail | null>({ kind: 'cn-sector', symbol: code }, (d) =>
    setDetail(d),
  );
  if (!detail || detail.stat.code !== code) return <Empty>成员加载中…</Empty>;
  return (
    <div {...stylex.props(styles.members)}>
      {degraded && <NoteBlock>行业数据暂停更新，显示的是最近一次</NoteBlock>}
      <table {...stylex.props(styles.table)}>
        <tbody>
          {detail.members.map((m) => {
            const href = `/symbol/${encodeURIComponent(m.symbol)}`;
            const tone = toneStyle(pctTone(m.pct));
            return (
              <tr key={m.symbol} {...stylex.props(styles.row)}>
                <td {...stylex.props(styles.td, styles.tdLeft, styles.muted)}>
                  <a href={href} {...stylex.props(styles.link)}>
                    {bareCode(m.symbol)}
                  </a>
                </td>
                <td {...stylex.props(styles.td, styles.tdLeft)}>
                  <a href={href} {...stylex.props(styles.link)}>
                    {m.name}
                  </a>
                  {m.limit && (
                    <Badge tone={m.limit} {...stylex.props(styles.badge)}>
                      {LIMIT_LABEL[m.limit]}
                    </Badge>
                  )}
                  {m.last == null && <Badge {...stylex.props(styles.badge)}>停牌</Badge>}
                </td>
                <td {...stylex.props(styles.td, tone)}>
                  {m.last == null ? '—' : m.last.toFixed(memberDigits(m))}
                </td>
                <td {...stylex.props(styles.td, tone)}>{formatPct(m.pct)}</td>
                <td {...stylex.props(styles.td)}>{m.turnover ? formatAmount(m.turnover) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectorDetailRow({ board, stat }: { board: SectorBoard; stat: SectorStat }) {
  const children = sortSectors(childrenOf(board, stat.code), 'pct');
  const [code, setCode] = useState(stat.code);
  return (
    <tr>
      <td colSpan={COLUMNS.length} {...stylex.props(styles.detailCell)}>
        {children.length > 0 && (
          <div {...stylex.props(styles.chips)}>
            <button
              {...stylex.props(styles.chip, code === stat.code && styles.chipActive)}
              onClick={() => setCode(stat.code)}
            >
              全部 {stat.members}
            </button>
            {children.map((child) => (
              <button
                key={child.code}
                {...stylex.props(styles.chip, code === child.code && styles.chipActive)}
                onClick={() => setCode(child.code)}
                title={statTitle(child)}
              >
                {child.name}{' '}
                <span {...stylex.props(toneStyle(pctTone(child.pct)))}>{formatPct(child.pct)}</span>
                {child.limitUp > 0 && (
                  <span {...stylex.props(styles.up)}> 涨停{child.limitUp}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <Members code={code} />
      </td>
    </tr>
  );
}

/** 首页「申万行业」：全市场 31 个一级行业按涨跌幅排行，点一行展开二级行业和成员股（A 股，走米筐） */
export function SectorBoardPanel() {
  const [board, setBoard] = useState<SectorBoard | null>(null);
  const [sort, setSort] = useState<{ key: SectorSortKey; dir: 'asc' | 'desc' }>({
    key: 'pct',
    dir: 'desc',
  });
  const [open, setOpen] = useState<string | null>(null);
  const { degraded } = useWsChannel<SectorBoard>({ kind: 'cn-sectors' }, setBoard);

  if (!board) return <Empty>{degraded ? '申万行业数据暂时取不到' : '申万行业加载中…'}</Empty>;
  const rows = sortSectors(board.l1, sort.key, sort.dir);
  const onSort = (key: SectorSortKey) =>
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' },
    );

  return (
    <div>
      {degraded && (
        <NoteBlock>行业数据暂停更新（流量保护或米筐暂时取不到），显示的是最近一次</NoteBlock>
      )}
      <table {...stylex.props(styles.table)}>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const sortable = col.key !== 'name';
              const active = sortable && sort.key === col.key;
              return (
                <th
                  key={col.label}
                  {...stylex.props(styles.th, col.left && styles.thLeft, active && styles.thActive)}
                  onClick={sortable ? () => onSort(col.key as SectorSortKey) : undefined}
                  title={sortable ? `按${col.label}排序` : undefined}
                >
                  {col.label}
                  {active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((stat) => {
            const isOpen = open === stat.code;
            const tone = toneStyle(pctTone(stat.pct));
            return (
              <Fragment key={stat.code}>
                <tr
                  {...stylex.props(styles.row, isOpen && styles.rowOpen)}
                  onClick={() => setOpen(isOpen ? null : stat.code)}
                  title={statTitle(stat)}
                >
                  <td {...stylex.props(styles.td, styles.tdLeft)}>
                    {isOpen ? '▾ ' : '▸ '}
                    {stat.name}
                  </td>
                  <td {...stylex.props(styles.td, tone)}>{formatPct(stat.pct)}</td>
                  <td {...stylex.props(styles.td, stat.limitUp > 0 && styles.up)}>
                    {stat.limitUp || '—'}
                  </td>
                  <td {...stylex.props(styles.td, styles.muted)}>
                    {stat.up} / {stat.down}
                  </td>
                  <td {...stylex.props(styles.td)}>{formatAmount(stat.turnover)}</td>
                  <td {...stylex.props(styles.td, styles.tdLeft)}>
                    {stat.leader ? (
                      <>
                        {stat.leader.name}{' '}
                        <span {...stylex.props(toneStyle(pctTone(stat.leader.pct)))}>
                          {formatPct(stat.leader.pct)}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
                {isOpen && <SectorDetailRow board={board} stat={stat} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div {...stylex.props(styles.toolbar)}>
        <span>全市场 {breadthText(marketTotal(board.l1))}</span>
        <span>· 涨跌幅取申万行业指数</span>
      </div>
    </div>
  );
}
