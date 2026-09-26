import { useEffect, useState } from "react";
import { Search, Unplug } from "lucide-react";
import type { AppSettings, SettingsUpdateInput } from "@actspace/shared";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { SkillsSection } from "./SkillsSection";

const TABS = [
  { id: "capabilities", label: "能力" },
  { id: "skills", label: "Skills" },
  { id: "mcp", label: "MCP" },
] as const;
type ExtensionTab = typeof TABS[number]["id"];

export function ExtensionsPage({ onSettingsChange, onConfigureSpeech }: { onSettingsChange?: (settings: AppSettings) => void; onConfigureSpeech?: () => void }) {
  const [tab, setTab] = useState<ExtensionTab>("capabilities");
  const [queries, setQueries] = useState<Record<ExtensionTab, string>>({ capabilities: "", skills: "", mcp: "" });
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let canceled = false;
    setError(null);
    if (!window.actspace?.getSettings) {
      setError("Skill 管理仅在桌面端可用。");
      return;
    }
    void window.actspace.getSettings().then((next) => {
      if (!canceled) setSettings(next);
    }).catch(() => {
      if (!canceled) setError("读取 Skills 设置失败，请重试。");
    });
    return () => { canceled = true; };
  }, [reload]);

  const updateSkills = async (input: SettingsUpdateInput) => {
    const next = await window.actspace.updateSettings(input);
    setSettings(next);
    onSettingsChange?.(next);
  };

  return (
    <main aria-label="扩展内容" className="h-full min-h-0 min-w-0 overflow-y-auto bg-app-bg text-text-main">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 px-8 pb-12 pt-8 max-[600px]:px-4 max-[600px]:pt-5">
        <h1 className="sr-only">扩展</h1>
        <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface-subtle px-3.5 focus-within:border-line-strong focus-within:ring-2 focus-within:ring-focus-ring/20">
          <Search size={15} className="shrink-0 text-text-faint" aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索扩展"
            placeholder={tab === "skills" ? "搜索 Skills…" : tab === "mcp" ? "MCP 暂未接入" : "搜索能力…"}
            value={queries[tab]}
            onChange={(event) => setQueries((current) => ({ ...current, [tab]: event.target.value }))}
            disabled={tab === "mcp"}
            className="min-w-0 flex-1 border-0 bg-transparent text-act-sm text-text-main outline-none placeholder:text-text-faint disabled:cursor-not-allowed"
          />
        </div>
        <div role="tablist" aria-label="扩展分类" className="flex items-center gap-2">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              id={`extension-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={tab === item.id}
              aria-controls={`extension-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
                  : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
                  : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                setTab(TABS[next].id);
                document.getElementById(`extension-tab-${TABS[next].id}`)?.focus();
              }}
              className={`h-9 rounded-full border px-4 text-act-sm transition-colors hover:bg-hover-overlay active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${tab === item.id ? "border-line-strong bg-selected font-medium text-text-main" : "border-line bg-transparent text-text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="pt-3">
          <section role="tabpanel" id="extension-panel-capabilities" aria-labelledby="extension-tab-capabilities" hidden={tab !== "capabilities"}>
            <CapabilitiesSection query={queries.capabilities} onConfigureSpeech={onConfigureSpeech} />
          </section>
          <section role="tabpanel" id="extension-panel-skills" aria-labelledby="extension-tab-skills" hidden={tab !== "skills"}>
            {error ? (
              <div role="alert" className="flex items-center gap-3 py-8 text-act-sm text-text-faint">
                {error}
                {window.actspace?.getSettings ? <button type="button" className="text-text-main underline" onClick={() => setReload((value) => value + 1)}>重试</button> : null}
              </div>
            ) : settings ? <SkillsSection settings={settings} onUpdate={updateSkills} query={queries.skills} />
              : <p role="status" className="py-8 text-act-sm text-text-faint">加载 Skills 中…</p>}
          </section>
          <section role="tabpanel" id="extension-panel-mcp" aria-labelledby="extension-tab-mcp" hidden={tab !== "mcp"}>
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Unplug size={25} strokeWidth={1.5} className="text-text-faint" />
              <h2 className="text-act-md font-medium">MCP 暂未接入</h2>
              <p className="max-w-[34ch] text-act-sm leading-relaxed text-text-faint">接入后，你可以在这里管理 MCP 服务。</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
