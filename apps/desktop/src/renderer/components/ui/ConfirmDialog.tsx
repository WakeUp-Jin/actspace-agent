import { useState } from "react";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./Dialog";

/**
 * 破坏性操作的确认弹窗：默认焦点在「取消」，Esc 关闭，点遮罩不关闭。
 * onConfirm 返回字符串或抛错时，错误留在弹窗里显示，由调用方在成功后自行关闭。
 * 进行中不能关闭（Esc 和「取消」都不生效）。
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<string | null | void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const nextError = await onConfirm();
      if (nextError) setError(nextError);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "操作失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent role="alertdialog" size="md" withDescription closeOnOutsideClick={false} className="p-5">
        <DialogTitle className="text-act-lg font-semibold text-text-main">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-act-xs leading-relaxed text-text-muted">{description}</DialogDescription>
        {error ? <p role="alert" className="mt-3 text-act-xs text-on-danger">{error}</p> : null}
        <DialogFooter className="mt-6">
          <Button variant="secondary" size="md" autoFocus onClick={onCancel} disabled={pending}>取消</Button>
          <Button variant="danger-solid" size="md" onClick={() => void confirm()} disabled={pending}>{pending ? pendingLabel : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
