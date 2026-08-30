import { Keyboard, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  type AppSettings,
  type QuickOpenShortcutSettings,
  type QuickOpenShortcutStatus,
  type QuickOpenShortcutUpdateInput,
  type SessionListItem,
  type WorkspaceEntry,
} from "@actspace/shared";
import { SectionShell, SettingGroup, SettingRow, SettingsSelect, Toggle } from "./SettingsPrimitives";

const FALLBACK_QUICK_OPEN_SETTINGS: QuickOpenShortcutSettings = {
  enabled: true,
  accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR,
  target: { kind: "automatic" },
};

export function getQuickOpenSettings(settings: AppSettings): QuickOpenShortcutSettings {
  return settings.shortcuts?.quickOpen ?? FALLBACK_QUICK_OPEN_SETTINGS;
}

export function acceleratorFromKeyboardEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (modifiers.length === 0) return null;
  const key = ({
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  } as Record<string, string>)[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [...modifiers, key].join("+");
}

export function formatAccelerator(accelerator: string): string {
  if (typeof navigator === "undefined" || !/Mac|iPhone|iPad/.test(navigator.platform)) return accelerator;
  return accelerator
    .replace("CommandOrControl+", "⌘")
    .replace("Command+", "⌘")
    .replace("Control+", "⌃")
    .replace("Alt+", "⌥")
    .replace("Shift+", "⇧");
}

export function ShortcutSettings({
  settings,
  onSettingsChange,
}: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const quickOpen = getQuickOpenSettings(settings);
  const [status, setStatus] = useState<QuickOpenShortcutStatus | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const recorderRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isRecording) recorderRef.current?.focus();
  }, [isRecording]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.actspace.getQuickOpenShortcutStatus?.() ?? Promise.resolve(null),
      window.actspace.listWorkspaces?.() ?? Promise.resolve(null),
      window.actspace.listSessions?.() ?? Promise.resolve([]),
    ]).then(([nextStatus, registry, listedSessions]) => {
      if (cancelled) return;
      setStatus(nextStatus);
      setWorkspaces(registry?.items.filter((workspace) => !workspace.hidden) ?? []);
      setSessions(listedSessions);
    }).catch((error: unknown) => {
      if (!cancelled) console.error("Failed to load shortcut settings context", error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (input: QuickOpenShortcutUpdateInput) => {
    if (!window.actspace.updateQuickOpenShortcut || saving) return;
    setSaving(true);
    try {
      const result = await window.actspace.updateQuickOpenShortcut(input);
      setStatus(result.status);
      onSettingsChange(result.settings);
    } catch (error) {
      console.error("Failed to update quick open shortcut", error);
      setStatus({ registered: false, accelerator: quickOpen.accelerator, error: "快捷键设置保存失败。" });
    } finally {
      setSaving(false);
    }
  };

  const projectOptions = useMemo(
    () => workspaces.filter((workspace) => workspace.kind !== "default").map((workspace) => ({
      value: workspace.id,
      label: workspace.label,
    })),
    [workspaces],
  );
  const sessionOptions = useMemo(() => sessions.map((session) => {
    const workspace = workspaces.find((item) => item.id === session.workspaceId || item.path === session.workspaceRoot);
    return {
      value: session.id,
      label: workspace ? `${session.title} · ${workspace.label}` : session.title,
    };
  }), [sessions, workspaces]);
  const targetKind = quickOpen.target.kind;
  const selectedWorkspaceId = quickOpen.target.kind === "workspace" ? quickOpen.target.workspaceId : "";
  const selectedSessionId = quickOpen.target.kind === "session" ? quickOpen.target.sessionId : "";
  const targetOptions = [
    { value: "automatic", label: "自动选择第一个项目" },
    { value: "workspace", label: "指定工作区" },
    { value: "session", label: "指定会话" },
  ];

  return (
    <SectionShell title="快捷键" description="从其他应用快速唤起 Actspace。后续快捷动作会继续集中在这里。">
      <SettingGroup title="快速唤起">
        <div className="flex items-center gap-3.5 px-4 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-act-lg bg-surface-subtle text-text-main">
            <Keyboard size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-text-main">快速打开 Actspace</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">唤起紧凑窗口并将焦点放到输入框。</p>
          </div>
          <Toggle checked={quickOpen.enabled} disabled={saving} ariaLabel="启用快速唤起" onChange={(enabled) => void update({ enabled })} />
        </div>
        <SettingRow
          title="快捷键"
          description={status?.error ?? (quickOpen.enabled && status?.registered ? "快捷键已生效。" : "点击后按下新的组合键。")}
          control={
            <div className="flex items-center gap-2">
              <button
                ref={recorderRef}
                type="button"
                disabled={!quickOpen.enabled || saving}
                aria-label="录制快速唤起快捷键"
                onClick={() => setIsRecording(true)}
                onBlur={() => setIsRecording(false)}
                onKeyDown={(event) => {
                  if (!isRecording) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    setIsRecording(false);
                    return;
                  }
                  const accelerator = acceleratorFromKeyboardEvent(event.nativeEvent);
                  if (!accelerator) return;
                  setIsRecording(false);
                  void update({ accelerator });
                }}
                className="min-w-[150px] rounded-act-md border border-line bg-surface px-3 py-2 font-mono text-[13px] font-semibold text-text-main outline-none transition hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isRecording ? "请按下组合键…" : formatAccelerator(quickOpen.accelerator)}
              </button>
              <button
                type="button"
                disabled={!quickOpen.enabled || saving || quickOpen.accelerator === DEFAULT_QUICK_OPEN_ACCELERATOR}
                aria-label="恢复默认快捷键"
                title="恢复默认快捷键"
                onClick={() => void update({ accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR })}
                className="grid h-9 w-9 place-items-center rounded-act-md border border-line bg-surface text-text-muted transition hover:border-line-strong hover:bg-hover-overlay hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={15} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
          }
        />
        <SettingRow
          title="打开目标"
          description="目标不可用时自动回到第一个项目；项目为空时打开空白 New chat。"
          control={
            <SettingsSelect
              value={targetKind}
              options={targetOptions}
              disabled={!quickOpen.enabled || saving}
              ariaLabel="快速唤起打开目标"
              onChange={(kind) => {
                if (kind === "workspace" && projectOptions[0]) void update({ target: { kind, workspaceId: projectOptions[0].value } });
                else if (kind === "session" && sessionOptions[0]) void update({ target: { kind, sessionId: sessionOptions[0].value } });
                else void update({ target: { kind: "automatic" } });
              }}
            />
          }
        />
        {targetKind === "workspace" ? (
          <SettingRow
            title="默认工作区"
            control={
              <SettingsSelect
                value={selectedWorkspaceId}
                options={projectOptions.some((option) => option.value === selectedWorkspaceId)
                  ? projectOptions
                  : [{ value: selectedWorkspaceId, label: "已移除的工作区（将自动降级）" }, ...projectOptions]}
                disabled={!quickOpen.enabled || saving || projectOptions.length === 0}
                ariaLabel="快速唤起默认工作区"
                onChange={(workspaceId) => void update({ target: { kind: "workspace", workspaceId } })}
              />
            }
          />
        ) : null}
        {targetKind === "session" ? (
          <SettingRow
            title="默认会话"
            control={
              <SettingsSelect
                value={selectedSessionId}
                options={sessionOptions.some((option) => option.value === selectedSessionId)
                  ? sessionOptions
                  : [{ value: selectedSessionId, label: "已移除的会话（将自动降级）" }, ...sessionOptions]}
                disabled={!quickOpen.enabled || saving || sessionOptions.length === 0}
                ariaLabel="快速唤起默认会话"
                onChange={(sessionId) => void update({ target: { kind: "session", sessionId } })}
              />
            }
          />
        ) : null}
      </SettingGroup>
    </SectionShell>
  );
}
