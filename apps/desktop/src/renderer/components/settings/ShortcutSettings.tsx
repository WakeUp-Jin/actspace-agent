import { RotateCcw } from "lucide-react";
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
import { Kbd, SettingGroup, SettingRow, SettingsButton, SettingsSelect, Toggle } from "./SettingsPrimitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

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

  const keys = acceleratorKeys(formatAccelerator(quickOpen.accelerator));
  const dependentDisabled = !quickOpen.enabled;

  return (
      <SettingGroup title="快捷键" headingLevel={3}>
        <SettingRow
          title="快速唤起"
          description="在任何应用中唤起紧凑窗口，焦点直达输入框。"
          control={<Toggle checked={quickOpen.enabled} disabled={saving} ariaLabel="启用快速唤起" onChange={(enabled) => void update({ enabled })} />}
        />
        <SettingRow
          indent
          disabled={dependentDisabled}
          title="快捷键"
          description={status?.error
            ? <span className="text-on-danger">{status.error}</span>
            : isRecording ? "按下新的组合键，Esc 取消。" : quickOpen.enabled && status?.registered ? "已生效。" : "点击按键后录制新的组合键。"}
          control={
            <>
              <button
                ref={recorderRef}
                type="button"
                disabled={dependentDisabled || saving}
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
                className="inline-flex h-[30px] items-center gap-1 rounded-[7px] px-1 outline-none transition-colors hover:bg-hover-overlay focus-visible:ring-[3px] focus-visible:ring-focus-ring/15 disabled:cursor-not-allowed"
              >
                {isRecording ? (
                  <span className="px-1.5 text-[12.5px] text-text-muted">请按下组合键…</span>
                ) : (
                  keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
                      {key.separator ? <span className="text-[11px] text-text-subtle">+</span> : null}
                      <Kbd>{key.label}</Kbd>
                    </span>
                  ))
                )}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SettingsButton
                    variant="quiet"
                    size="icon"
                    disabled={dependentDisabled || saving || quickOpen.accelerator === DEFAULT_QUICK_OPEN_ACCELERATOR}
                    aria-label="恢复默认快捷键"
                    onClick={() => void update({ accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR })}
                  >
                    <RotateCcw size={13} strokeWidth={1.9} aria-hidden="true" />
                  </SettingsButton>
                </TooltipTrigger>
                <TooltipContent>恢复默认快捷键</TooltipContent>
              </Tooltip>
            </>
          }
        />
        <SettingRow
          indent
          disabled={dependentDisabled}
          title="打开目标"
          description="目标不可用时回到第一个项目；没有项目时打开空白会话。"
          control={
            <SettingsSelect
              value={targetKind}
              options={targetOptions}
              disabled={dependentDisabled || saving}
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
            indent
            disabled={dependentDisabled}
            title="默认工作区"
            control={
              <SettingsSelect
                value={selectedWorkspaceId}
                options={projectOptions.some((option) => option.value === selectedWorkspaceId)
                  ? projectOptions
                  : [{ value: selectedWorkspaceId, label: "已移除的工作区（将自动降级）" }, ...projectOptions]}
                disabled={dependentDisabled || saving || projectOptions.length === 0}
                ariaLabel="快速唤起默认工作区"
                onChange={(workspaceId) => void update({ target: { kind: "workspace", workspaceId } })}
              />
            }
          />
        ) : null}
        {targetKind === "session" ? (
          <SettingRow
            indent
            disabled={dependentDisabled}
            title="默认会话"
            control={
              <SettingsSelect
                value={selectedSessionId}
                options={sessionOptions.some((option) => option.value === selectedSessionId)
                  ? sessionOptions
                  : [{ value: selectedSessionId, label: "已移除的会话（将自动降级）" }, ...sessionOptions]}
                disabled={dependentDisabled || saving || sessionOptions.length === 0}
                ariaLabel="快速唤起默认会话"
                onChange={(sessionId) => void update({ target: { kind: "session", sessionId } })}
              />
            }
          />
        ) : null}
      </SettingGroup>
  );
}

/**
 * 把格式化后的快捷键拆成键帽。macOS 的修饰符是单字符（⌘⇧），其他平台用 "+" 连接；
 * 非 macOS 保留 "+" 分隔，使按钮文字与原始 accelerator 一致。
 */
function acceleratorKeys(formatted: string): Array<{ label: string; separator: boolean }> {
  if (formatted.includes("+")) {
    return formatted.split("+").map((label, index) => ({ label, separator: index > 0 }));
  }
  const modifiers = formatted.match(/^[⌘⌃⌥⇧]*/)?.[0] ?? "";
  const rest = formatted.slice(modifiers.length);
  return [...modifiers.split(""), ...(rest ? [rest] : [])].map((label) => ({ label, separator: false }));
}
