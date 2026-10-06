import * as stylex from '@stylexjs/stylex';
import { Wallet } from 'lucide-react';
import type { LiveSellerOut } from '@kansoku/core/contract/index';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import { cellTone, headerLabel, rowsForSymbol, SECTION_LABEL } from './liveSellerView';

const POLL_MS = 10_000;

const styles = stylex.create({
  card: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    marginBottom: '14px',
    padding: '10px 12px',
  },
  label: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '5px',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  more: {
    color: {
      'default': colors.textMuted,
      ':hover': colors.accent,
    },
    marginLeft: 'auto',
    textDecoration: 'none',
  },
  section: {
    color: colors.textPrimary,
    fontSize: fontSizes.caption,
    fontWeight: 600,
    marginTop: '4px',
  },
  fields: {
    columnGap: '12px',
    display: 'grid',
    fontFamily: fonts.mono,
    fontSize: fontSizes.caption,
    gridTemplateColumns: 'auto 1fr',
    rowGap: '2px',
  },
  key: { color: colors.textMuted },
  value: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  up: { color: colors.up },
  down: { color: colors.down },
});

/** 个股页侧栏：这只票在 StockSeller 实盘里的状态；没有就不显示 */
export function LiveSellerCard({ symbol }: { symbol: string }) {
  const { data } = usePollingQuery<LiveSellerOut>(
    'positions.liveSeller',
    () => client.positions.liveSeller(),
    POLL_MS,
    { persist: false },
  );
  const rows = rowsForSymbol(data, symbol);
  if (!rows.length) return null;
  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.label)}>
        <Wallet size={13} /> 实盘
        <a {...stylex.props(styles.more)} href="/live">
          看板 →
        </a>
      </div>
      {rows.map((row) => (
        <div key={row.section}>
          <div {...stylex.props(styles.section)}>{SECTION_LABEL[row.section]}</div>
          <div {...stylex.props(styles.fields)}>
            {row.fields.map(([header, value]) => {
              const tone = cellTone(header, value);
              return [
                <span key={`${header}-k`} {...stylex.props(styles.key)}>
                  {headerLabel(header)}
                </span>,
                <span
                  key={`${header}-v`}
                  {...stylex.props(
                    styles.value,
                    tone === 'up' && styles.up,
                    tone === 'down' && styles.down,
                  )}
                >
                  {value}
                </span>,
              ];
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
