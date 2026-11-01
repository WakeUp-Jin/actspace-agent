import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { OpenFileFallbackDialog, type OpenFileFallbackTarget } from "./OpenFileFallbackDialog";
import { openWorkspacePath, type OpenWorkspacePath } from "./open-workspace-path";

const OpenFileFallbackContext = createContext<OpenWorkspacePath | null>(null);

/**
 * 挂在工作台里：向下提供 `useOpenWorkspacePath()`，系统打不开文件（`no_app`）时弹兜底对话框。
 * 调用方拿到 `no_app` 不需要再提示，只需要处理 `error`。
 */
export function OpenFileFallbackProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<OpenFileFallbackTarget | null>(null);
  const open = useCallback<OpenWorkspacePath>(async (input) => {
    const result = await openWorkspacePath(input);
    if (result.ok === false && result.reason === "no_app") {
      setTarget({ workspaceRoot: input.workspaceRoot, relativePath: result.relativePath });
    }
    return result;
  }, []);
  return (
    <OpenFileFallbackContext.Provider value={open}>
      {children}
      {target ? <OpenFileFallbackDialog key={`${target.workspaceRoot}\u0000${target.relativePath}`} target={target} onClose={() => setTarget(null)} /> : null}
    </OpenFileFallbackContext.Provider>
  );
}

/** 没有 Provider（单测、独立挂载）时退回不带对话框的路由，`no_app` 由调用方自己处理。 */
export function useOpenWorkspacePath(): OpenWorkspacePath {
  return useContext(OpenFileFallbackContext) ?? openWorkspacePath;
}
