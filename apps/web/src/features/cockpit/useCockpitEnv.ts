import { useEffect, useState } from 'react';
import type {
  BenchmarkSeries,
  CnLiveHolding,
  CockpitPosition,
  RelativeVolume,
} from '@kansoku/shared/types';
import { useWsChannel } from '@web/lib/ws/useWsChannel';

interface PositionPayload {
  position: CockpitPosition | null;
  relvol: RelativeVolume | null;
  cnLive?: CnLiveHolding;
}

export interface CockpitEnvState {
  position: CockpitPosition | null;
  positionError: string | null;
  relvol: RelativeVolume | null;
  /** A 股：StockSeller 看板里的实盘明细；非 A 股为 null */
  cnLive: CnLiveHolding | null;
  benchmark: BenchmarkSeries[] | null;
  benchmarkError: string | null;
}

export function useCockpitEnv(sym: string): CockpitEnvState {
  const [position, setPosition] = useState<CockpitPosition | null>(null);
  const [relvol, setRelvol] = useState<RelativeVolume | null>(null);
  const [cnLive, setCnLive] = useState<CnLiveHolding | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkSeries[] | null>(null);
  useEffect(() => {
    setPosition(null);
    setRelvol(null);
    setCnLive(null);
    setBenchmark(null);
  }, [sym]);
  const { degraded: positionDegraded } = useWsChannel<PositionPayload>(
    { kind: 'position', symbol: sym },
    (d) => {
      setPosition(d.position);
      setRelvol(d.relvol);
      setCnLive(d.cnLive ?? null);
    },
  );
  const { degraded: benchmarkDegraded } = useWsChannel<BenchmarkSeries[]>(
    { kind: 'benchmark', symbol: sym },
    setBenchmark,
  );

  return {
    position,
    relvol,
    cnLive,
    benchmark,
    positionError: positionDegraded ? '持仓数据获取失败，正在重试' : null,
    benchmarkError: benchmarkDegraded ? '环境对照数据获取失败，正在重试' : null,
  };
}
