import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelConnectionsResult, ModelConnectionsView } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { useSettingsSaveNotice } from "../SettingsPrimitives";

/**
 * 设置 › 模型的数据：读整份视图，所有修改走 `run`。
 * 修改成功换成返回的新视图并提示「已保存」；失败把原因放进 error，由页面顶部显示。
 */
export function useModelConnections(onChanged?: () => void) {
  const [view, setView] = useState<ModelConnectionsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notify = useSettingsSaveNotice();
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const reload = useCallback(async () => {
    try {
      setView(await modelConnectionsApi.list());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取模型设置失败。");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(async (mutation: () => Promise<ModelConnectionsResult>, savedText?: string): Promise<ModelConnectionsResult> => {
    let result: ModelConnectionsResult;
    try {
      result = await mutation();
    } catch (cause) {
      result = { ok: false, error: { code: "write_failed", message: cause instanceof Error ? cause.message : "保存失败。" } };
    }
    // renderer 的 tsconfig 不是 strict，ok 字面量不收窄，用 "error" in 判断。
    if ("error" in result) {
      setError(result.error.message);
      return result;
    }
    setView(result.view);
    setError(null);
    notify(savedText);
    changed.current?.();
    return result;
  }, [notify]);

  return { view, error, setError, reload, run };
}

export type ModelConnectionsController = ReturnType<typeof useModelConnections>;
