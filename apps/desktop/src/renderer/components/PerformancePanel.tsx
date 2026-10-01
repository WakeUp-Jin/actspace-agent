import { useEffect, useState } from "react";
import type { DesktopPerformanceSnapshot } from "@actspace/shared";

/** Local state isolates the two-second refresh from the conversation tree. */
export function PerformancePanel({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [sample, setSample] = useState<DesktopPerformanceSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      try {
        const settings = await window.actspace?.getSettingsV4?.();
        if (alive && revision === current) setEnabled(settings?.settings.general.performanceMonitoring === true);
      } catch { if (alive) setEnabled(false); }
    };
    void refresh();
    const remove = window.actspace?.onSettingsChangedV4?.(() => { void refresh(); });
    return () => { alive = false; remove?.(); };
  }, []);
  useEffect(() => {
    if (!enabled || !window.actspace?.samplePerformance || !window.actspace.setPerformanceActive) return;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bridge = window.actspace;
    const cycle = async () => {
      const id = ++generation;
      clearTimeout(timer);
      setSample(null);
      setStale(false);
      const active = !document.hidden;
      try { await bridge.setPerformanceActive!(active); }
      catch { if (id === generation) setStale(true); return; }
      if (!active || id !== generation) return;
      const schedule = () => {
        timer = setTimeout(async () => {
          if (id !== generation) return;
          setStale(true);
          try {
            const next = await bridge.samplePerformance!();
            if (id !== generation) return;
            setSample(next); setStale(false);
          } catch { if (id === generation) setStale(true); }
          if (id === generation) schedule();
        }, 2000);
      };
      schedule();
    };
    void cycle();
    document.addEventListener("visibilitychange", cycle);
    return () => {
      generation++; clearTimeout(timer);
      document.removeEventListener("visibilitychange", cycle);
      void bridge.setPerformanceActive!(false).catch(() => undefined);
    };
  }, [enabled]);
  if (!enabled) return null;
  const cpu = sample?.processes.reduce((sum, row) => sum + row.cpuPercent, 0);
  const memory = sample?.processes.reduce((sum, row) => sum + row.workingSetKiB, 0);
  return (
    <div aria-label="性能监控" className={`${compact ? "fixed bottom-0 left-0 z-10" : "mt-auto shrink-0 max-[820px]:fixed max-[820px]:bottom-0 max-[820px]:left-0 max-[820px]:z-10"} bg-sidebar text-act-xxs text-text-muted`}>
      <span className="whitespace-nowrap" title={stale ? "等待采样，数据可能过期" : "当前应用进程 CPU 与工作集内存之和"}>
        {stale ? "◷ " : ""}CPU {cpu === undefined ? "—" : `${cpu.toFixed(1)}%`} · 内存 {memory === undefined ? "—" : `${(memory / 1024).toFixed(0)} MB`}
      </span>
    </div>
  );
}
