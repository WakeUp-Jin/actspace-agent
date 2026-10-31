import { useEffect, useRef, useState } from "react";
import type { PermissionMode } from "@actspace/shared/runtime-v2";
import { Check, ChevronDown, KeyRound, Shield, ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { sessionsApi } from "../../api/sessions";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { SessionGrantsDialog } from "./SessionGrantsDialog";

const PERMISSION_MODES = ["default", "auto-review", "full-access"] as const satisfies readonly PermissionMode[];

function permissionModeLabel(mode: PermissionMode): string {
  return mode === "auto-review" ? "替我审批" : mode === "full-access" ? "完全权限" : "自动";
}

// 每种模式一个图标，触发按钮跟着当前模式换，菜单里也能一眼区分。
const PERMISSION_MODE_META: Record<(typeof PERMISSION_MODES)[number], { icon: LucideIcon; hint: string }> = {
  default: { icon: Shield, hint: "按策略询问" },
  "auto-review": { icon: ShieldCheck, hint: "模型代为判断" },
  "full-access": { icon: ShieldOff, hint: "Bash 不进沙箱" },
};

function permissionModeIcon(mode: PermissionMode): LucideIcon {
  return mode in PERMISSION_MODE_META ? PERMISSION_MODE_META[mode as keyof typeof PERMISSION_MODE_META].icon : Shield;
}

/** 输入框状态行上的会话权限模式（16 T16b 改用 ui/Menu）：选中即保存，保存成功后关闭菜单并刷新会话投影。 */
export function PermissionModeControl({ sessionId, mode, disabled, onChanged }: { sessionId: string; mode: PermissionMode; disabled: boolean; onChanged: () => void | Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocusTrigger = useRef(false);
  useEffect(() => { setOpen(false); setManage(false); }, [sessionId]);
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
          title={`权限：${permissionModeLabel(mode)}。替我审批由所选模型判断，未允许时交回人工。完全权限扩大文件范围；Bash 不进沙箱，通过禁止规则后直接运行；文件删除及敏感文件仍按策略审批。`}
        >
          <TriggerIcon size={14} strokeWidth={2} aria-hidden="true" />
          <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-[208px] text-act-xs">
        {PERMISSION_MODES.map((next) => {
          const { icon: Icon, hint } = PERMISSION_MODE_META[next];
          return (
          <MenuItem
            key={next}
            role="menuitemradio"
            aria-checked={mode === next}
            aria-label={permissionModeLabel(next)}
            aria-description={hint}
            disabled={disabled || submitting}
            onSelect={(event) => {
              // 选当前模式只关菜单；换模式时等保存成功再关，失败时菜单留着。
              if (next === mode) return;
              event.preventDefault();
              void update(next);
            }}
          >
            <Icon size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {permissionModeLabel(next)}
              <span className="ml-1.5 text-text-muted">{hint}</span>
            </span>
            {mode === next ? <Check size={14} className="shrink-0 text-text-main" aria-hidden="true" /> : null}
          </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem onSelect={() => setManage(true)}>
          <KeyRound size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">管理会话授权</span>
        </MenuItem>
      </MenuContent>
    </Menu>
    {manage ? <SessionGrantsDialog key={sessionId} sessionId={sessionId} onClose={() => setManage(false)} onChanged={onChanged} returnFocus={trigger} /> : null}
    </>
  );
}
