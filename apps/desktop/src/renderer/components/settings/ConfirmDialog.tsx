import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/Button";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

/**
 * 破坏性操作的确认弹窗：默认焦点在「取消」，Esc 关闭，焦点困在弹窗内。
 * onConfirm 返回字符串或抛错时，错误留在弹窗里显示，由调用方在成功后自行关闭。
 * 渲染到 body，避免被分组的分隔线和 overflow 影响。
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
  const { dialogRef, trapTabKey } = useDialogFocusTrap();
  const titleId = useId();
  const descriptionId = useId();
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
  return createPortal(
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-(--act-z-modal) grid place-items-center bg-scrim px-5" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (!pending) onCancel(); } else trapTabKey(event); }}>
      <div className="w-full max-w-[460px] rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <h2 id={titleId} className="text-act-lg font-semibold text-text-main">{title}</h2>
        <p id={descriptionId} className="mt-2 text-act-xs leading-relaxed text-text-muted">{description}</p>
        {error ? <p role="alert" className="mt-3 text-act-xs text-on-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="md" autoFocus onClick={onCancel} disabled={pending}>取消</Button>
          <Button variant="danger-solid" size="md" onClick={() => void confirm()} disabled={pending}>{pending ? pendingLabel : confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
