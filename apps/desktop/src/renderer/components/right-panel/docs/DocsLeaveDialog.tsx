import { useState } from "react";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../ui/Dialog";
import { useRightPanel } from "../RightPanelContext";
import { saveDocsDoc } from "./use-docs-draft";

/**
 * 有未保存内容时离开（切换到另一篇文档、关闭「文档」标签）的确认：保存 / 不保存 / 取消。
 * 挂在 `RightPanel` 外壳上而不是 `DocsPanel` 里：从标签栏关闭「文档」时，面板可能并没有挂载。
 */
export function DocsLeaveDialog({ workspaceRoot }: { workspaceRoot?: string }) {
  const { docsPendingLeave, clearDocsPendingLeave, docsDoc, setDocsDoc } = useRightPanel();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!docsPendingLeave) return null;

  const fileName = docsDoc?.relativePath.split("/").at(-1) ?? "这篇文档";
  const close = () => {
    setError(null);
    clearDocsPendingLeave();
  };
  const leave = () => {
    const { run } = docsPendingLeave;
    close();
    run();
  };
  const saveAndLeave = async () => {
    if (!docsDoc) {
      leave();
      return;
    }
    setSaving(true);
    setError(null);
    const failure = await saveDocsDoc(workspaceRoot, docsDoc, setDocsDoc);
    setSaving(false);
    if (failure) {
      // 保存失败就留在原地，由用户决定改选「不保存」还是取消。
      setError(failure);
      return;
    }
    leave();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) close(); }}>
      <DialogContent role="alertdialog" size="md" withDescription closeOnOutsideClick={false} className="p-5">
        <DialogTitle className="text-act-lg font-semibold text-text-main">{`要保存对「${fileName}」的修改吗？`}</DialogTitle>
        <DialogDescription className="mt-2 text-act-xs leading-relaxed text-text-muted">
          这篇文档有未保存的修改。不保存的话，这些修改会丢失。
        </DialogDescription>
        {error ? <p role="alert" className="mt-3 text-act-xs text-on-danger">{error}</p> : null}
        <DialogFooter className="mt-6">
          <Button variant="secondary" size="md" onClick={close} disabled={saving}>取消</Button>
          <Button variant="secondary" size="md" onClick={leave} disabled={saving}>不保存</Button>
          <Button variant="primary" size="md" autoFocus onClick={() => void saveAndLeave()} busy={saving} disabled={saving}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
