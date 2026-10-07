import { useEffect, useRef, useState } from "react";
import type { PermissionMode } from "@actspace/shared/runtime-v2";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { sessionsApi } from "../../api/sessions";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";

const PERMISSION_MODES = ["default", "full-access"] as const satisfies readonly PermissionMode[];

function permissionModeLabel(mode: PermissionMode): string {
  return mode === "full-access" ? "完全权限" : "自动";
}

/** 输入框状态行上的会话权限模式（16 T16b 改用 ui/Menu）：选中即保存，保存成功后关闭菜单并刷新会话投影。 */
export function PermissionModeControl({ sessionId, mode, disabled, onChanged }: { sessionId: string; mode: PermissionMode; disabled: boolean; onChanged: () => void | Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocusTrigger = useRef(false);
  useEffect(() => { setOpen(false); }, [sessionId]);
  // 保存期间按钮是禁用的，菜单关闭时 Radix 还焦点会落空；等按钮恢复可用后再还。
  useEffect(() => {
    if (submitting || !refocusTrigger.current) return;
    refocusTrigger.current = false;
    trigger.current?.focus();
  }, [submitting]);
  const update = async (next: PermissionMode) => {
    if (disabled || submitting) return;
    setSubmitting(true);
    try {
      const result = await sessionsApi.setPermissionMode({ sessionId, mode: next });
      if (result.ok) {
        refocusTrigger.current = true;
        setOpen(false);
        await onChanged();
      }
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <button
          ref={trigger}
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-act-sm border-0 bg-transparent px-1.5 text-act-xs text-text-muted hover:bg-surface-subtle hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="会话权限模式"
          disabled={disabled || submitting}
          title={`权限：${permissionModeLabel(mode)}。完全权限仅扩大文件范围，Bash、删除和敏感文件仍按策略审批。`}
        >
          <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
          <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-[144px] text-act-xs">
        {PERMISSION_MODES.map((next) => (
          <MenuItem
            key={next}
            role="menuitemradio"
            aria-checked={mode === next}
            disabled={disabled || submitting}
            onSelect={(event) => {
              // 选当前模式只关菜单；换模式时等保存成功再关，失败时菜单留着。
              if (next === mode) return;
              event.preventDefault();
              void update(next);
            }}
          >
            <ShieldCheck size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1">{permissionModeLabel(next)}</span>
            {mode === next ? <Check size={14} className="shrink-0 text-text-main" aria-hidden="true" /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
