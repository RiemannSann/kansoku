import * as stylex from '@stylexjs/stylex';
import type { LiveSellerOut, LiveSellerSection } from '@kansoku/core/contract/index';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { useTitle } from '@web/lib/useTitle';
import { Badge, NoteBlock } from '@web/ui';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import {
  cellTone,
  headerLabel,
  isNumericHeader,
  SECTION_LABEL,
  SECTION_ORDER,
  type SectionKey,
} from './liveSellerView';

const POLL_MS = 5000;

const START_COMMAND =
  'cd ~/Projects/python/scripts/local_code && uv run --project .. python StockSeller/live_view_web.py --os --os3 --no-open';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '16px 20px',
  },
  header: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  titleRow: {
    alignItems: 'baseline',
    display: 'flex',
    gap: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    margin: 0,
  },
  back: {
    color: {
      'default': colors.textSecondary,
      ':hover': colors.accent,
    },
    fontSize: fontSizes.caption,
    textDecoration: 'none',
  },
  meta: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.caption,
    gap: 8,
  },
  warn: {
    color: colors.accent,
    fontSize: fontSizes.caption,
  },
  grid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: {
      'default': '1fr',
      '@media (min-width: 1200px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  panel: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  panelHead: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.control,
    fontWeight: 600,
    gap: 8,
    padding: '8px 12px',
  },
  count: {
    color: colors.textMuted,
    fontWeight: 400,
  },
  scroll: {
    maxHeight: 420,
    overflow: 'auto',
  },
  table: {
    borderCollapse: 'collapse',
    fontFamily: fonts.mono,
    fontSize: fontSizes.caption,
    whiteSpace: 'nowrap',
    width: '100%',
  },
  th: {
    backgroundColor: colors.backgroundSurface,
    color: colors.textSecondary,
    fontWeight: 400,
    padding: '6px 10px',
    position: 'sticky',
    textAlign: 'left',
    top: 0,
  },
  td: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    color: colors.textPrimary,
    padding: '5px 10px',
  },
  num: {
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  up: { color: colors.up },
  down: { color: colors.down },
  dim: { color: colors.textMuted },
  rowIntent: { color: colors.accent },
  codeLink: {
    color: {
      'default': colors.textBright,
      ':hover': colors.accent,
    },
    fontWeight: 600,
    textDecoration: 'none',
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    padding: '16px 12px',
  },
  command: {
    backgroundColor: colors.backgroundDeep,
    borderRadius: radii.md,
    color: colors.textSecondary,
    display: 'block',
    fontFamily: fonts.mono,
    fontSize: fontSizes.caption,
    marginTop: 8,
    overflowWrap: 'anywhere',
    padding: '8px 10px',
  },
});

function SectionTable({ section }: { section: LiveSellerSection }) {
  if (!section.rows.length) return <div {...stylex.props(styles.empty)}>暂无</div>;
  const codeIndex = section.headers.findIndex((h) => h.toLowerCase() === 'code');
  return (
    <div {...stylex.props(styles.scroll)}>
      <table {...stylex.props(styles.table)}>
        <thead>
          <tr>
            {section.headers.map((h) => (
              <th key={h} {...stylex.props(styles.th, isNumericHeader(h) && styles.num)}>
                {headerLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => {
            const rowHighlight = /intent|both|gfd/.test(row.style);
            return (
              <tr key={row.cells.join('|')}>
                {row.cells.map((cell, j) => {
                  const header = section.headers[j] ?? '';
                  const tone = cellTone(header, cell);
                  const isCode = j === codeIndex && row.symbol;
                  return (
                    <td
                      key={header || String(j)}
                      {...stylex.props(
                        styles.td,
                        isNumericHeader(header) && styles.num,
                        rowHighlight && styles.rowIntent,
                        row.cellStyles[j] === 'dim' && styles.dim,
                        tone === 'up' && styles.up,
                        tone === 'down' && styles.down,
                      )}
                    >
                      {isCode ? (
                        <a
                          {...stylex.props(styles.codeLink)}
                          href={`/symbol/${encodeURIComponent(row.symbol!)}`}
                        >
                          {cell}
                        </a>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ sectionKey, section }: { sectionKey: SectionKey; section: LiveSellerSection }) {
  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.panelHead)}>
        {SECTION_LABEL[sectionKey]}
        <span {...stylex.props(styles.count)}>{section.count}</span>
      </div>
      <SectionTable section={section} />
    </section>
  );
}

function Summary({ summary }: { summary: { headers: string[]; rows: string[][] } }) {
  if (!summary.rows.length) return null;
  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.panelHead)}>当日汇总</div>
      <SectionTable
        section={{
          headers: summary.headers,
          rows: summary.rows.map((cells) => ({ cells, style: '', cellStyles: [], symbol: null })),
          count: summary.rows.length,
        }}
      />
    </section>
  );
}

export function LiveSellerPage() {
  useTitle('实盘看板');
  const { data, error } = usePollingQuery<LiveSellerOut>(
    'positions.liveSeller',
    () => client.positions.liveSeller(),
    POLL_MS,
    // 实盘仓位不落本地缓存，打开页面一律现拉
    { persist: false },
  );
  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.titleRow)}>
          <h1 {...stylex.props(styles.title)}>实盘看板</h1>
          <a {...stylex.props(styles.back)} href="/">
            ← 回首页
          </a>
        </div>
        {data?.connected && (
          <div {...stylex.props(styles.meta)}>
            <span>StockSeller · 只读</span>
            <span>更新于 {data.updatedAt || '—'}</span>
            {data.dataAgeSeconds != null && (
              <span>数据延迟 {Math.round(data.dataAgeSeconds)} 秒</span>
            )}
            {data.degraded.level && data.degraded.level !== 'ok' && (
              <Badge tone="accent">{data.degraded.reason || data.degraded.level}</Badge>
            )}
          </div>
        )}
      </header>
      {error && <NoteBlock>读取失败：{error}</NoteBlock>}
      {data && !data.connected && (
        <NoteBlock>
          没连上 StockSeller 实盘看板（{data.url}：{data.error}）。先在终端把只读网页看板开起来：
          <code {...stylex.props(styles.command)}>{START_COMMAND}</code>
        </NoteBlock>
      )}
      {data?.connected && (
        <>
          {data.lastError && <div {...stylex.props(styles.warn)}>{data.lastError}</div>}
          <Summary summary={data.summary} />
          <div {...stylex.props(styles.grid)}>
            {SECTION_ORDER.map((key) => (
              <Panel key={key} sectionKey={key} section={data.sections[key]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
