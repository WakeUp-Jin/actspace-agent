/**
 * 设置页「Skills」分区：已发现 Skill 的可视化管理。
 *
 * 每个 Skill 两个独立开关：
 * - 主 Agent：黑名单语义（默认全开，关闭 = 写入 settings.skills.disabled）；
 * - Kairos：白名单语义（默认全关，开启 = 写入 settings.kairos.enabledSkills）。
 * 另支持从目录安装（复制到用户数据目录）与卸载（仅设置页安装的）。
 */
import { useCallback, useEffect, useState } from "react";
import { CircleAlert, FolderDown, Trash2 } from "lucide-react";
import type { AppSettings, SettingsUpdateInput, SkillCatalogItem } from "@actspace/shared";
import { SectionShell, SettingGroup, Toggle } from "./SettingsPrimitives";

const BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60";

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
}: {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
}) {
  const bridgeReady = hasSkillsBridge();
  const [items, setItems] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridgeReady || !window.actspace.listSkills) {
      setLoading(false);
      return;
    }
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

  const toggleAgent = (name: string, enabled: boolean) => {
    const set = new Set(settings.skills.disabled);
    if (enabled) {
      set.delete(name);
    } else {
      set.add(name);
    }
    onUpdate({ skills: { disabled: [...set] } });
    setItems((current) =>
      current.map((item) => (item.name === name ? { ...item, enabledForAgent: enabled } : item)),
    );
  };

  const toggleKairos = (name: string, enabled: boolean) => {
    const set = new Set(settings.kairos.enabledSkills);
    if (enabled) {
      set.add(name);
    } else {
      set.delete(name);
    }
    onUpdate({ kairos: { enabledSkills: [...set] } });
    setItems((current) =>
      current.map((item) => (item.name === name ? { ...item, enabledForKairos: enabled } : item)),
    );
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
      <SectionShell title="Skills" description="管理 Agent 可用的知识型能力。">
        <div className="rounded-act-lg border border-line bg-surface px-4 py-6 text-center text-[13px] text-text-faint">
          Skill 管理仅在桌面端可用。
        </div>
      </SectionShell>
    );
  }

  const visible = items.filter((item) => !item.shadowed);

  return (
    <SectionShell
      title="Skills"
      description="Skill 是以 SKILL.md 描述的知识型能力。「主 Agent」开关控制聊天助手的可见性（默认全开）；「Kairos」开关控制自主模式加载（默认全关，逐个授权）。"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-faint">
          共 {visible.length} 个 Skill
          {items.length > visible.length ? `（另有 ${items.length - visible.length} 个同名被遮蔽）` : ""}
        </span>
        <button type="button" className={BTN_SECONDARY} onClick={() => void install()}>
          <FolderDown size={14} strokeWidth={2} className="mr-1.5" />
          安装 Skill
        </button>
      </div>

      {message ? (
        <p className={`text-[12px] ${message.includes("失败") ? "text-on-danger" : "text-on-success"}`}>{message}</p>
      ) : null}

      <SettingGroup>
        {loading ? (
          <div className="px-4 py-6 text-center text-[13px] text-text-faint">加载 Skill 列表中…</div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-text-faint">
            尚未发现任何 Skill。可点击右上角「安装 Skill」从本机目录导入。
          </div>
        ) : (
          visible.map((item) => (
            <div key={item.directory} className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-text-main">{item.name}</span>
                    <span className="inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-text-faint">
                      {item.scope === "project" ? "项目" : "用户"} · {SOURCE_LABELS[item.source] ?? item.source}
                    </span>
                    {item.status === "warning" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-on-danger">
                        <CircleAlert size={11} strokeWidth={2.2} /> 异常
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[12px] leading-relaxed text-text-faint" title={item.description}>
                    {item.description || "（无描述）"}
                  </p>
                  {item.warning ? <p className="mt-1 text-[12px] text-on-danger">{item.warning}</p> : null}
                  <p className="mt-1 break-all text-[11px] text-text-subtle">{item.directory}</p>
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
                <label className="flex items-center gap-2 text-[12px] text-text-muted">
                  <Toggle
                    checked={item.enabledForAgent}
                    onChange={(next) => toggleAgent(item.name, next)}
                    ariaLabel={`主 Agent 使用 ${item.name}`}
                  />
                  主 Agent
                </label>
                <label className="flex items-center gap-2 text-[12px] text-text-muted">
                  <Toggle
                    checked={item.enabledForKairos}
                    onChange={(next) => toggleKairos(item.name, next)}
                    ariaLabel={`Kairos 使用 ${item.name}`}
                  />
                  Kairos
                </label>
              </div>
            </div>
          ))
        )}
      </SettingGroup>
    </SectionShell>
  );
}
