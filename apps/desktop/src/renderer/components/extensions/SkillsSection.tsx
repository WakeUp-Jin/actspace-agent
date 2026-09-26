/**
 * 扩展页「Skills」分区：已发现 Skill 的可视化管理。
 *
 * 每个 Skill 使用主 Agent 黑名单语义（默认全开，关闭 = 写入 settings.skills.disabled）。
 * 另支持从目录安装（复制到用户数据目录）与卸载（仅从应用安装的）。
 */
import { useCallback, useEffect, useState } from "react";
import { CircleAlert, FolderDown, Trash2 } from "lucide-react";
import type { AppSettings, SettingsUpdateInput, SkillCatalogItem } from "@actspace/shared";
import { SectionShell, SettingGroup, Toggle } from "../settings/SettingsPrimitives";
import { Button } from "../ui/Button";


function hasSkillsBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace?.listSkills);
}

const SOURCE_LABELS: Record<string, string> = {
  actspace: ".actspace",
  "actspace-userData": "用户目录",
  agents: ".agents",
  claude: ".claude",
};

export function SkillsSection({
  settings,
  onUpdate,
  query = "",
}: {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => Promise<void>;
  query?: string;
}) {
  const bridgeReady = hasSkillsBridge();
  const [items, setItems] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridgeReady || !window.actspace.listSkills) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await window.actspace.listSkills();
      setItems(result.items);
    } catch (error) {
      console.error("Failed to list skills", error);
      setMessage("加载 Skill 列表失败。");
    } finally {
      setLoading(false);
    }
  }, [bridgeReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleAgent = async (name: string, enabled: boolean) => {
    const disabled = new Set(settings.skills.disabled);
    if (enabled) disabled.delete(name);
    else disabled.add(name);
    setSaving(true);
    setMessage(null);
    try {
      await onUpdate({ skills: { disabled: [...disabled] } });
    } catch {
      setMessage("保存失败，请重试。当前启用状态未更改。");
    } finally {
      setSaving(false);
    }
  };

  const install = async () => {
    if (!window.actspace.installSkill) return;
    setMessage(null);
    try {
      const result = await window.actspace.installSkill();
      if (result.ok) {
        setMessage(`已安装 Skill：${result.name ?? ""}`);
        await refresh();
      } else if (!result.canceled) {
        setMessage(result.error ?? "安装失败。");
      }
    } catch {
      setMessage("安装失败，请稍后重试。");
    }
  };

  const uninstall = async (item: SkillCatalogItem) => {
    if (!window.actspace.uninstallSkill) return;
    if (!window.confirm(`确定卸载 Skill「${item.name}」？其目录将被删除。`)) return;
    setMessage(null);
    try {
      const result = await window.actspace.uninstallSkill({ directory: item.directory });
      if (result.ok) {
        setMessage(`已卸载：${item.name}`);
        await refresh();
      } else {
        setMessage(result.error ?? "卸载失败。");
      }
    } catch {
      setMessage("卸载失败，请稍后重试。");
    }
  };

  if (!bridgeReady) {
    return (
      <SectionShell>
        <div className="rounded-act-lg border border-line bg-surface px-4 py-6 text-center text-act-sm text-text-faint">
          Skill 管理仅在桌面端可用。
        </div>
      </SectionShell>
    );
  }

  const discovered = items.filter((item) => !item.shadowed);
  const needle = query.trim().toLowerCase();
  const visible = discovered.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(needle));

  return (
    <SectionShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-act-xs text-text-faint">
          Skills · {visible.length}
          {items.length > discovered.length ? `（另有 ${items.length - discovered.length} 个同名被遮蔽）` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={loading} onClick={() => { setMessage(null); void refresh(); }}>刷新</Button>
          <Button variant="secondary" onClick={() => void install()}>
            <FolderDown size={14} strokeWidth={2} className="mr-1.5" />
            安装 Skill
          </Button>
        </div>
      </div>

      {message ? (
        <p className={`text-act-xs ${message.includes("失败") ? "text-on-danger" : "text-on-success"}`}>{message}</p>
      ) : null}

      <SettingGroup
        title="可用 Skills"
        description="启用后，主 Agent 可在后续对话中使用。"
      >
        {loading ? (
          <div className="px-4 py-6 text-center text-act-sm text-text-faint">加载 Skill 列表中…</div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-act-sm text-text-faint">
            {needle ? "没有找到匹配的 Skill。" : "尚未发现任何 Skill，可从本机目录安装。"}
          </div>
        ) : (
          visible.map((item) => (
            <div key={item.directory} className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-act-sm font-medium text-text-main">{item.name}</span>
                    <span className="inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-act-xxs font-medium text-text-faint">
                      {item.scope === "project" ? "项目" : "用户"} · {SOURCE_LABELS[item.source] ?? item.source}
                    </span>
                    {item.status === "warning" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-act-xxs font-medium text-on-danger">
                        <CircleAlert size={11} strokeWidth={2.2} /> 异常
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-act-xs leading-relaxed text-text-faint" title={item.description}>
                    {item.description || "（无描述）"}
                  </p>
                  {item.warning ? <p className="mt-1 text-act-xs text-on-danger">{item.warning}</p> : null}
                  <details className="mt-1 text-act-xxs text-text-subtle"><summary className="w-fit cursor-pointer hover:text-text-main">来源路径</summary><p className="mt-1 break-all">{item.directory}</p></details>
                </div>
                {item.removable ? (
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-act-md text-text-faint transition hover:bg-danger-soft hover:text-on-danger"
                    aria-label={`卸载 Skill ${item.name}`}
                    onClick={() => void uninstall(item)}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-act-xs text-text-muted">
                  <Toggle
                    checked={!settings.skills.disabled.includes(item.name)}
                    disabled={saving}
                    onChange={(next) => void toggleAgent(item.name, next)}
                    ariaLabel={`主 Agent 使用 ${item.name}`}
                  />
                  主 Agent
                </label>
              </div>
            </div>
          ))
        )}
      </SettingGroup>
    </SectionShell>
  );
}
