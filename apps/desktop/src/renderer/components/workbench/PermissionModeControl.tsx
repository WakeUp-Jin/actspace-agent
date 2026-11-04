import { useEffect, useRef, useState } from "react";
import type { PermissionMode } from "@actspace/shared/runtime-v2";
import { Check, ChevronDown, Shield, ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { sessionsApi } from "../../api/sessions";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";

const PERMISSION_MODES = ["default", "auto-review", "full-access"] as const satisfies readonly PermissionMode[];

function permissionModeLabel(mode: PermissionMode): string {
  return mode === "auto-review" ? "替我审批" : mode === "full-access" ? "完全权限" : "自动";
}

// 每种模式一个图标，触发按钮跟着当前模式换，菜单里也能一眼区分。
const PERMISSION_MODE_META: Record<(typeof PERMISSION_MODES)[number], { icon: LucideIcon }> = {
  default: { icon: Shield },
  "auto-review": { icon: ShieldCheck },
  "full-access": { icon: ShieldOff },
};

function permissionModeIcon(mode: PermissionMode): LucideIcon {
  return mode in PERMISSION_MODE_META ? PERMISSION_MODE_META[mode as keyof typeof PERMISSION_MODE_META].icon : Shield;
}

/** 输入框状态行上的会话权限模式（16 T16b 改用 ui/Menu）：选中即保存，保存成功后关闭菜单并刷新会话投影；切到「完全权限」先经 ConfirmDialog 确认。 */
export function PermissionModeControl({ sessionId, mode, disabled, onChanged }: { sessionId: string; mode: PermissionMode; disabled: boolean; onChanged: () => void | Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocusTrigger = useRef(false);
  useEffect(() => { setOpen(false); setConfirmFull(false); }, [sessionId]);
  // 保存期间按钮是禁用的，菜单关闭时 Radix 还焦点会落空；等按钮恢复可用后再还。
  useEffect(() => {
    if (submitting || !refocusTrigger.current) return;
    refocusTrigger.current = false;
    trigger.current?.focus();
  }, [submitting]);
  /** 保存成功返回 null；失败返回给确认弹窗显示的原因（菜单路径忽略，菜单留着）。 */
  const update = async (next: PermissionMode): Promise<string | null> => {
    if (disabled || submitting) return "当前不能切换权限模式。";
    setSubmitting(true);
    try {
      const result = await sessionsApi.setPermissionMode({ sessionId, mode: next });
      if (!result.ok) return result.error || "保存失败，请稍后重试。";
      refocusTrigger.current = true;
      setOpen(false);
      await onChanged();
      return null;
    } finally {
      setSubmitting(false);
    }
  };
  const TriggerIcon = permissionModeIcon(mode);
  return (
    <><Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <button
          ref={trigger}
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-act-sm border-0 bg-transparent px-1.5 text-act-xs text-text-muted hover:bg-surface-subtle hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="会话权限模式"
          disabled={submitting}
          title={`权限：${permissionModeLabel(mode)}`}
        >
          <TriggerIcon size={14} strokeWidth={2} aria-hidden="true" />
          <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="text-act-xs">
        {PERMISSION_MODES.map((next) => {
          const { icon: Icon } = PERMISSION_MODE_META[next];
          return (
          <MenuItem
            key={next}
            role="menuitemradio"
            aria-checked={mode === next}
            aria-label={permissionModeLabel(next)}
            disabled={disabled || submitting}
            onSelect={(event) => {
              // 选当前模式只关菜单；换模式时等保存成功再关，失败时菜单留着。
              if (next === mode) return;
              // 完全权限：Bash 不进沙箱，先弹确认；菜单随选择关闭，确认后才保存。
              if (next === "full-access") { setConfirmFull(true); return; }
              event.preventDefault();
              void update(next);
            }}
          >
            <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{permissionModeLabel(next)}</span>
            {mode === next ? <Check size={14} className="shrink-0 text-text-main" aria-hidden="true" /> : null}
          </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
    {confirmFull ? (
      <ConfirmDialog
        key={sessionId}
        title="开启完全权限？"
        description="Bash 命令将不在沙箱中运行，可直接修改本机文件。"
        confirmLabel="开启"
        pendingLabel="开启中…"
        returnFocus={trigger}
        onCancel={() => setConfirmFull(false)}
        onConfirm={async () => {
          const error = await update("full-access");
          if (!error) setConfirmFull(false);
          return error;
        }}
      />
    ) : null}
    </>
  );
}
