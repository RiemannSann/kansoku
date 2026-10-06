import * as stylex from '@stylexjs/stylex';
import type { CockpitComment, IntradaySidebar, SymbolAnalysisRow } from '@kansoku/shared/types';
import type { SidebarTab } from '@web/features/charts/SidebarTabs';
import { NewsTab } from '@web/features/charts/intraday/tabs/NewsTab';
import { SymbolEventsTab } from '@web/features/events/SymbolEventsTab';
import { marketOfSymbol } from '@web/lib/market';
import { Badge } from '@web/ui';
import { AiTab } from './AiTab';
import { DepthTab } from './DepthTab';
import type { CockpitEnvState } from './useCockpitEnv';
import { EnvTab } from './EnvTab';
import { FlowTab } from './FlowTab';
import { ReviewTab, type ReviewSection } from './ReviewTab';

const styles = stylex.create({
  unreadBadge: {
    marginLeft: '4px',
  },
});

/** A 股个股页最前面的「盘口」tab；别的市场没有盘口数据，返回空 */
export function buildDepthTabs(sym: string): SidebarTab[] {
  if (marketOfSymbol(sym) !== 'CN') return [];
  return [{ key: 'depth', label: '盘口', content: <DepthTab symbol={sym} /> }];
}

/** A 股默认先看盘口，其余市场默认看预测 */
export function defaultSidebarTab(sym: string): string {
  return marketOfSymbol(sym) === 'CN' ? 'depth' : 'prediction';
}

export function buildSharedSidebarTabs(params: {
  sym: string;
  sidebar: IntradaySidebar;
  env: CockpitEnvState;
  analysesRows: SymbolAnalysisRow[];
  latestId: string | null;
  journalEntries: { name: string; date: string }[];
  reloadJournal: () => void;
  reviewSection: ReviewSection;
  setReviewSection: (section: ReviewSection) => void;
  selectedJournal: string | null;
  setSelectedJournal: (name: string | null) => void;
  comments: CockpitComment[];
  commentsError: string | null;
  commentsLoaded: boolean;
  unread: number;
}): SidebarTab[] {
  const {
    sym,
    sidebar,
    env,
    analysesRows,
    latestId,
    journalEntries,
    reloadJournal,
    reviewSection,
    setReviewSection,
    selectedJournal,
    setSelectedJournal,
    comments,
    commentsError,
    commentsLoaded,
    unread,
  } = params;
  const hasNews =
    Boolean(sidebar.context?.news?.length) || Boolean(sidebar.news?.length) || Boolean(sym);

  return [
    {
      key: 'env',
      label: '环境',
      content: (
        <>
          <EnvTab
            position={env.position}
            positionError={env.positionError}
            benchmark={env.benchmark}
            benchmarkError={env.benchmarkError}
            relvol={env.relvol}
          />
          <FlowTab symbol={sym} />
        </>
      ),
    },
    {
      key: 'news',
      label: '消息',
      hidden: !hasNews,
      content: <NewsTab context={sidebar.context} news={sidebar.news ?? []} sym={sym} />,
    },
    {
      key: 'events',
      label: '事件',
      content: <SymbolEventsTab symbol={sym} />,
    },
    {
      key: 'review',
      label: '复盘',
      content: (
        <ReviewTab
          symbol={sym}
          rows={analysesRows}
          currentId={latestId}
          journal={journalEntries}
          section={reviewSection}
          onSectionChange={setReviewSection}
          selectedJournal={selectedJournal}
          onSelectJournal={setSelectedJournal}
          reloadJournal={reloadJournal}
        />
      ),
    },
    {
      key: 'ai',
      label: (
        <>
          AI 点评
          {unread > 0 && (
            <Badge tone="down" className={stylex.props(styles.unreadBadge).className}>
              {unread}
            </Badge>
          )}
        </>
      ),
      content: (
        <AiTab
          symbol={sym}
          comments={comments}
          error={commentsError}
          loaded={commentsLoaded}
          analysisRevision={analysesRows[0]?.id ?? latestId ?? undefined}
        />
      ),
    },
  ];
}
