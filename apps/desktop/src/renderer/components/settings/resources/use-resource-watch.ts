import { useEffect, useState } from "react";
import { RESOURCE_HISTORY_LENGTH, type ResourceHistoryPoint, type ResourceSample } from "@actspace/shared";
import { eventsApi } from "../../../api/events";
import { resourceMonitorApi } from "../../../api/resource-monitor";

export type ResourceWatch = {
  readonly history: readonly ResourceHistoryPoint[];
  readonly latest: ResourceSample | null;
  readonly error: string | null;
};

const EMPTY: ResourceWatch = { history: [], latest: null, error: null };

/**
 * 页面打开且可见时订阅主进程采集器，隐藏或卸载时退订（front-资源监控规范 §1）。
 * 进入页面时采集器若已在跑（悬浮窗开着），直接拿到已有的 5 分钟曲线。
 */
export function useResourceWatch(): ResourceWatch {
  const [state, setState] = useState<ResourceWatch>(EMPTY);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const apply = (active: boolean) => {
      const id = ++generation;
      resourceMonitorApi.watch(active).then((initial) => {
        if (!alive || id !== generation || !active) return;
        setState({ history: initial.history, latest: initial.latest, error: null });
      }, (error: unknown) => {
        if (alive && id === generation) setState(current => ({ ...current, error: error instanceof Error ? error.message : "无法读取资源占用" }));
      });
    };
    const removeSample = eventsApi.resourceSample(({ sample, point }) => {
      if (!alive) return;
      setState((current) => {
        const history = current.history.length >= RESOURCE_HISTORY_LENGTH
          ? [...current.history.slice(current.history.length - RESOURCE_HISTORY_LENGTH + 1), point]
          : [...current.history, point];
        return { history, latest: sample, error: null };
      });
    });
    const onVisibility = () => apply(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    apply(!document.hidden);
    return () => {
      alive = false;
      removeSample();
      document.removeEventListener("visibilitychange", onVisibility);
      // 退订失败不影响页面卸载；主窗口重载 / 关闭时主进程也会自动退订。
      void resourceMonitorApi.watch(false).catch(() => undefined);
    };
  }, []);
  return state;
}
