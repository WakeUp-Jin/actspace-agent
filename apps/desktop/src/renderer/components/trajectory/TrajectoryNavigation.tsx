import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { TrajectoryRevealTarget } from "../../trajectory";

/**
 * 从右侧 Context 面板等处跳到轨迹里的某条记录。
 * Provider 由 WorkbenchLayout 挂载：`revealInTrajectory` 把中间区域切到轨迹视图并留下一个待处理目标，
 * TrajectoryView 在记录就绪后定位、选中，再调用 `consume`。
 */
export type PendingTrajectoryReveal = { readonly seq: number; readonly target: TrajectoryRevealTarget };

type TrajectoryNavigationValue = {
  readonly pending: PendingTrajectoryReveal | null;
  revealInTrajectory(target: TrajectoryRevealTarget): void;
  consume(seq: number): void;
};

const TrajectoryNavigationContext = createContext<TrajectoryNavigationValue | null>(null);

export function TrajectoryNavigationProvider({ onShowTrajectory, children }: { onShowTrajectory: () => void; children: ReactNode }) {
  const [pending, setPending] = useState<PendingTrajectoryReveal | null>(null);
  const seqRef = useRef(0);
  const revealInTrajectory = useCallback((target: TrajectoryRevealTarget) => {
    seqRef.current += 1;
    setPending({ seq: seqRef.current, target });
    onShowTrajectory();
  }, [onShowTrajectory]);
  const consume = useCallback((seq: number) => {
    setPending((current) => (current?.seq === seq ? null : current));
  }, []);
  const value = useMemo(() => ({ pending, revealInTrajectory, consume }), [pending, revealInTrajectory, consume]);
  return <TrajectoryNavigationContext.Provider value={value}>{children}</TrajectoryNavigationContext.Provider>;
}

/** 没有 Provider（例如单独渲染的测试、Space 视图）时返回 null，调用方不提供跳转。 */
export function useTrajectoryNavigation(): TrajectoryNavigationValue | null {
  return useContext(TrajectoryNavigationContext);
}
