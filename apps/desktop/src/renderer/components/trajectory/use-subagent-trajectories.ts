import { useEffect, useMemo, useRef } from 'react';
import { selectTrajectory } from '@actspace/client/sessions';
import type { RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import type { SessionProjectionContextValue } from '../../session';
import { buildTrajectorySnapshot } from '../../trajectory';
import { trajectoryDelegations } from '../../trajectory/subagents';

/** Related durable data lives in the existing Session store, not a component cache. */
export function useSubagentTrajectories(snapshot: RuntimeV2TrajectorySnapshot | null, projection: SessionProjectionContextValue | null, enabled: boolean) {
  const key = JSON.stringify(enabled ? trajectoryDelegations(snapshot) : []);
  const delegations = useMemo(() => JSON.parse(key) as ReturnType<typeof trajectoryDelegations>, [key]);
  const ids = useMemo(() => [...new Set(delegations.map(item => item.childSessionId))], [delegations]);
  const bridge = projection?.bridge;
  useEffect(() => {
    const disposers = ids.map(id => bridge?.watch(id));
    return () => disposers.forEach(dispose => dispose?.());
  }, [ids, bridge]);
  const cells = ids.map(id => projection?.store.get(id));
  const windows = cells.map(cell => cell?.window);
  // A parent live update must not rebuild unchanged child histories.
  const cache = useMemo(() => new WeakMap<object, ReturnType<typeof buildTrajectorySnapshot>>(), [projection?.store]);
  const children = new Map<string, ReturnType<typeof buildTrajectorySnapshot>>();
  const notices: { id: string; error: string | null; earlier: boolean; loading: boolean }[] = [];
  for (const [index, id] of ids.entries()) {
    const cell = cells[index]; const window = windows[index];
    if (cell && window) {
      let runtime = cache.get(window);
      if (!runtime) { const trajectory = selectTrajectory(cell); if (trajectory) { runtime = buildTrajectorySnapshot(trajectory); cache.set(window, runtime); } }
      if (runtime) children.set(id, runtime);
    }
    if (cell?.error || window?.beforeSeq != null || !window) notices.push({ id, error: cell?.error ?? null, earlier: window?.beforeSeq != null, loading: !window && !cell?.error });
  }
  const stable = useRef(children);
  if (stable.current.size !== children.size || [...children].some(([id, value]) => stable.current.get(id) !== value)) stable.current = children;
  return { delegations, children: stable.current, notices, bridge };
}
