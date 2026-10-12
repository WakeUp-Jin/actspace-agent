import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  type AppSettings,
  type QuickOpenShortcutSettings,
  type QuickOpenShortcutStatus,
  type QuickOpenShortcutUpdateInput,
  type WorkspaceEntry,
} from "@actspace/shared";
import { SettingGroup, SettingRow, SettingsSelect, Toggle } from "./SettingsPrimitives";
import { IconButton } from "../ui/IconButton";
import { quickOpenApi } from "../../api/quick-open";
import { SessionSearch } from "../sidebar/SessionSearch";
import { workspacesApi } from "../../api/workspaces";

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
  const [choosingSession, setChoosingSession] = useState(false);
  const [chosenTitle, setChosenTitle] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const recorderRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isRecording) recorderRef.current?.focus();
  }, [isRecording]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      quickOpenApi.getShortcutStatus(),
      workspacesApi.list(),
    ]).then(([nextStatus, registry]) => {
      if (cancelled) return;
      setStatus(nextStatus);
      setWorkspaces(registry?.items.filter((workspace) => !workspace.hidden) ?? []);
    }).catch((error: unknown) => {
      if (!cancelled) console.error("Failed to load shortcut settings context", error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (input: QuickOpenShortcutUpdateInput) => {
    if (saving) return false;
    setSaving(true);
    try {
      const result = await quickOpenApi.updateShortcut(input);
      setStatus(result.ok === true ? result.status : { ...result.status, error: result.error });
      onSettingsChange(result.settings);
      return result.ok;
    } catch (error) {
      console.error("Failed to update quick open shortcut", error);
      setStatus({ registered: false, accelerator: quickOpen.accelerator, error: "快捷键设置保存失败。" });
      return false;
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
  const targetKind = quickOpen.target.kind;
  const selectedWorkspaceId = quickOpen.target.kind === "workspace" ? quickOpen.target.workspaceId : "";
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
                className="inline-flex h-[30px] items-center gap-1 rounded-act-sm px-1 outline-none transition-colors hover:bg-hover-overlay focus-visible:ring-[3px] focus-visible:ring-focus-ring/15 disabled:cursor-not-allowed"
              >
                {isRecording ? (
                  <span className="px-1.5 text-act-xs text-text-muted">请按下组合键…</span>
                ) : (
                  keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
                      {key.separator ? <span className="text-act-xxs text-text-subtle">+</span> : null}
                      <Kbd>{key.label}</Kbd>
                    </span>
                  ))
                )}
              </button>
              <IconButton
                label="恢复默认快捷键"
                disabled={dependentDisabled || saving || quickOpen.accelerator === DEFAULT_QUICK_OPEN_ACCELERATOR}
                onClick={() => void update({ accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR })}
              >
                <RotateCcw size={13} strokeWidth={1.9} aria-hidden="true" />
              </IconButton>
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
              value={choosingSession ? "session" : targetKind}
              options={targetOptions}
              disabled={dependentDisabled || saving}
              ariaLabel="快速唤起打开目标"
              onChange={(kind) => {
                if (kind !== "session") setChoosingSession(false);
                if (kind === "workspace" && projectOptions[0]) void update({ target: { kind, workspaceId: projectOptions[0].value } });
                else if (kind === "session") setChoosingSession(true);
                else void update({ target: { kind: "automatic" } });
              }}
            />
          }
        />
        {targetKind === "workspace" && !choosingSession ? (
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
        {targetKind === "session" || choosingSession ? (
          <SettingRow
            indent
            disabled={dependentDisabled}
            title="默认会话"
            description={chosenTitle ?? (targetKind === "session" ? "已保存指定会话，可搜索标题或消息片段更换。" : "选择会话后保存打开目标。")}
            control={<SessionSearch buttonLabel="选择快速唤起会话" disabled={dependentDisabled || saving} onSelect={(sessionId, title) => {
              void update({ target: { kind: "session", sessionId } }).then(saved => {
                if (saved) { setChosenTitle(title ?? null); setChoosingSession(false); }
              });
            }} />}
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

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-act-sm border border-b-2 border-line bg-surface px-1.5 font-sans text-act-xs font-medium text-text-main">
      {children}
    </kbd>
  );
}
