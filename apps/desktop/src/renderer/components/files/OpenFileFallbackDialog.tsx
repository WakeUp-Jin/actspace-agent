import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { workspacesApi } from "../../api/workspaces";
import { canChooseApplication, useFileApplications } from "../turn-tail/useFileApplications";
import { Button } from "../ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { ApplicationLabel } from "./ApplicationLabel";

export type OpenFileFallbackTarget = { workspaceRoot: string; relativePath: string };

const VSCODE_URL = "https://code.visualstudio.com/";

/** 只在 VS Code 明确「未安装」时才提示；列不出工具或没有这一项都不提示。 */
function useVsCodeMissing(): boolean {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { tools } = await workspacesApi.listOpenTools();
        if (!cancelled) setMissing(tools.some((tool) => tool.id === "vscode" && !tool.available));
      } catch {
        if (!cancelled) setMissing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return missing;
}

/**
 * 点了文件但系统里没有任何应用能打开它时的兜底：选一个应用、在 Finder 中显示、一行 VS Code 提示。
 * 只在这一刻出现；不在启动时检测软件。
 */
export function OpenFileFallbackDialog({ target, onClose }: { target: OpenFileFallbackTarget; onClose: () => void }) {
  const { workspaceRoot, relativePath } = target;
  const name = relativePath.split("/").pop() || relativePath;
  const apps = useFileApplications(workspaceRoot, relativePath, canChooseApplication());
  const vscodeMissing = useVsCodeMissing();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(input: { action: "open"; applicationId: string } | { action: "reveal" }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await workspacesApi.openFile({ workspaceRoot, relativePath, ...input });
      if (result.ok) {
        onClose();
        return;
      }
    } catch {
      // 落到下面的统一提示。
    }
    setPending(false);
    setError(input.action === "reveal" ? "无法在文件管理器中显示，请重试。" : "无法用这个应用打开，请换一个或重试。");
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="sm" withDescription>
        <div className="flex flex-col gap-3 p-5">
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle className="break-words text-act-md font-semibold text-text-main">
                没有可以打开「{name}」的应用
              </DialogTitle>
              <DialogDescription className="mt-1 text-act-sm text-text-muted">
                系统里没有为这类文件设置默认应用。
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {apps.applications.length > 0 ? (
              <section aria-label="选择应用打开" className="flex flex-col gap-1">
                <h3 className="m-0 px-2 text-act-xs font-medium text-text-faint">选择应用打开</h3>
                <div className="flex max-h-48 flex-col overflow-y-auto">
                  {apps.applications.map((app) => (
                    <Button
                      key={app.id}
                      variant="ghost"
                      size="md"
                      className="w-full justify-start"
                      disabled={pending}
                      onClick={() => void run({ action: "open", applicationId: app.id })}
                    >
                      <ApplicationLabel app={app} />
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
            {error ? (
              <p role="alert" className="m-0 px-2 text-act-xs text-danger">
                {error}
              </p>
            ) : null}
            {vscodeMissing ? (
              <p className="m-0 px-2 text-act-xs text-text-faint">
                推荐安装{" "}
                <a
                  className="text-text-muted underline hover:text-text-main"
                  href={VSCODE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  VS Code
                </a>{" "}
                打开代码文件
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter className="items-center justify-between">
            <Button variant="secondary" size="md" disabled={pending} onClick={() => void run({ action: "reveal" })}>
              <FolderOpen size={14} aria-hidden="true" />在 Finder 中显示
            </Button>
            <Button variant="ghost" size="md" onClick={onClose}>
              取消
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
