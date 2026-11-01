/**
 * 扩展页「插件」分区：当前形态里组合进来的全部插件，分「全局插件」「会话插件」两组。
 *
 * 每组里能关的插件放在最上面（开关），其余收进「内置插件 N 个，不能关闭」折叠行；有搜索词时自动展开。
 * 开关写 `tools.plugins[id]`，重启后生效：`enabled`（设置值）与 `loaded`（本次启动已加载）不同时显示提示。
 * 操控浏览器、英语学习开启并已加载时，行下展开原来的连接面板和学习设置；否则这些细节都不挂载，
 * 也就不会请求浏览器状态和英语学习状态。
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PluginListItem } from "@actspace/shared";
import { BrowserConnectPanel } from "./BrowserConnectPanel";
import { EnglishLearningCapability } from "./EnglishLearningCapability";
import { useBrowserBridgeStatus } from "../settings/browser-bridge-settings-shared";
import { SectionShell, Toggle } from "../settings/SettingsPrimitives";
import { Button } from "../ui/Button";
import { pluginsApi } from "../../api/plugins";
import { settingsApi } from "../../api/settings";

const GROUPS = [
  { scope: "global", title: "全局插件", description: "ActSpace 启动时加载，所有会话共用。" },
  { scope: "session", title: "会话插件", description: "每个会话里加载一份，决定 Agent 能做什么。" },
] as const;

function BrowserPluginDetail() {
  const { status, refreshStatus } = useBrowserBridgeStatus();
  return <BrowserConnectPanel status={status} refresh={refreshStatus} />;
}

function PluginRow({ item, pending, onToggle, onConfigureSpeech }: {
  item: PluginListItem;
  pending: boolean;
  onToggle: (item: PluginListItem, next: boolean) => void;
  onConfigureSpeech?: () => void;
}) {
  const restartHint = item.canDisable && item.enabled !== item.loaded ? (item.enabled ? "重启后开启" : "重启后关闭") : null;
  const showDetail = item.canDisable && item.loaded && item.enabled;
  return (
    <div>
      <div className="flex items-center gap-3.5 px-3.5 py-[11px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-act-sm font-medium text-text-main">
            <span>{item.title}</span>
            <span className="rounded-full bg-surface-subtle px-2 py-px font-mono text-act-xxs font-normal text-text-subtle">{item.directory}/</span>
          </div>
          <p className="mt-px text-act-xs text-text-faint">{item.description}</p>
        </div>
        {item.canDisable ? (
          <>
            {restartHint ? <span className="whitespace-nowrap rounded-full bg-warning-soft px-2 py-px text-act-xxs text-on-warning">{restartHint}</span> : null}
            <Toggle checked={item.enabled} disabled={pending} onChange={(next) => onToggle(item, next)} ariaLabel={item.title} />
          </>
        ) : <span className="whitespace-nowrap text-act-xxs text-text-faint">内置</span>}
      </div>
      {showDetail ? (
        <div className="mx-3.5 mb-3">
          {item.id === "browser-tools" ? <BrowserPluginDetail />
            : item.id === "english-learning" ? <EnglishLearningCapability onConfigure={onConfigureSpeech} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function PluginsSection({ query = "", onConfigureSpeech }: { query?: string; onConfigureSpeech?: () => void }) {
  const [items, setItems] = useState<PluginListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setItems(await pluginsApi.list());
      setError(null);
    } catch {
      setError("读取插件列表失败，请重试。");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (item: PluginListItem, next: boolean) => {
    setPendingId(item.id);
    setMessage(null);
    try {
      let snapshot = await settingsApi.getV4();
      let result = await settingsApi.updateV4({ expectedRevision: snapshot.revision, namespace: "tools", patch: { plugins: { [item.id]: next } } });
      if ("latest" in result) {
        snapshot = result.latest;
        result = await settingsApi.updateV4({ expectedRevision: snapshot.revision, namespace: "tools", patch: { plugins: { [item.id]: next } } });
      }
      if ("latest" in result) throw new Error(result.message);
      await load();
    } catch {
      setMessage("保存失败，请重试。开关状态未更改。");
    } finally {
      setPendingId(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const visible = (items ?? []).filter((item) => !needle || `${item.title} ${item.description} ${item.directory} ${item.id}`.toLowerCase().includes(needle));

  return (
    <SectionShell>
      <p className="text-act-xs text-text-faint">插件 · {visible.length}</p>
      {message ? <p role="alert" className="text-act-xs text-on-danger">{message}</p> : null}
      {error ? (
        <div role="alert" className="flex items-center gap-3 py-8 text-act-sm text-text-faint">
          {error}
          <Button size="xs" onClick={() => void load()}>重试</Button>
        </div>
      ) : items === null ? (
        <p role="status" className="py-8 text-act-sm text-text-faint">加载插件中…</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-act-sm text-text-faint">没有找到匹配的插件。</p>
      ) : (
        <div className="flex flex-col gap-[26px]">
          {GROUPS.map((group) => {
            const list = visible.filter((item) => item.scope === group.scope);
            if (list.length === 0) return null;
            const optional = list.filter((item) => item.canDisable);
            const builtin = list.filter((item) => !item.canDisable);
            const expanded = needle !== "" || open[group.scope] === true;
            const renderRow = (item: PluginListItem) => (
              <PluginRow key={item.id} item={item} pending={pendingId === item.id} onToggle={(row, next) => void toggle(row, next)} onConfigureSpeech={onConfigureSpeech} />
            );
            return (
              <section key={group.scope} aria-label={group.title} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2.5 px-1">
                  <h2 className="text-act-md font-semibold text-text-main">{group.title}</h2>
                  <span className="text-act-xs text-text-faint">{list.length}</span>
                </div>
                <p className="mx-1 -mt-1 text-act-xs text-text-faint">{group.description}</p>
                <div className="divide-y divide-line overflow-hidden rounded-act-lg border border-line bg-surface">
                  {optional.map(renderRow)}
                  {builtin.length > 0 ? (
                    // 整行铺满的折叠行，Button 是固定高度的居中文字按钮，不适用；基线里登记 1 个原生 button。
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen((current) => ({ ...current, [group.scope]: !expanded }))}
                      className="flex w-full items-center gap-2 px-3.5 py-[11px] text-left text-act-sm text-text-muted transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
                    >
                      <ChevronRight size={14} aria-hidden="true" className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                      内置插件 {builtin.length} 个，不能关闭
                    </button>
                  ) : null}
                  {expanded ? builtin.map(renderRow) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}
