import { createContext, useContext, useState, type ReactNode } from "react";
import type { ConnectionProbeResult, ModelApi } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { PageHeader } from "../SettingsPrimitives";
import { useModelConnections, type ModelConnectionsController } from "./use-model-connections";
import { PurposesSection } from "./PurposesSection";
import { ConnectionListSection } from "./ConnectionListSection";
import { TemplateCatalogPage } from "./TemplateCatalogPage";
import { ConnectionSetupPage } from "./ConnectionSetupPage";
import { ConnectionDetailPage } from "./ConnectionDetailPage";

/**
 * 设置 › 模型。一个页面里的几步：列表 → 选服务商 → 填 Key → 连接详情（弹出选择窗口）；列表 → 连接详情。
 * 数据都来自 `modelConnections` 的整份视图，页面只保存路由和添加连接时的草稿。
 */

export type ModelsRoute =
  | { name: "list" }
  | { name: "catalog" }
  | { name: "setup" }
  /** probe：刚建好的连接带着这次的探测结果，详情页直接弹出选择窗口。 */
  | { name: "detail"; connectionId: string; expand?: string; probe?: ConnectionProbeResult };

export type ConnectionDraft = {
  templateId: string;
  apiKey: string;
  protocol: ModelApi;
  baseUrl: string;
  proxyUrl: string;
};

type ModelsContextValue = {
  controller: ModelsPageController;
  go: (route: ModelsRoute) => void;
  draft: ConnectionDraft | null;
  setDraft: (draft: ConnectionDraft | null) => void;
};

type ModelsPageController = ModelConnectionsController;

const ModelsContext = createContext<ModelsContextValue | null>(null);

export function useModelsPage(): ModelsContextValue {
  const value = useContext(ModelsContext);
  if (!value) throw new Error("useModelsPage 只能在 ModelsPage 里用。");
  return value;
}

/** 页头下面的出错提示：最近一次修改失败的原因。 */
export function ModelsError() {
  const { controller } = useModelsPage();
  if (!controller.error) return null;
  return (
    <div role="alert" className="flex items-center gap-2.5 rounded-act-md bg-danger-soft px-3 py-2 text-act-xs text-on-danger">
      <span className="min-w-0 flex-1">{controller.error}</span>
      <Button variant="ghost" size="xs" onClick={() => controller.setError(null)}>知道了</Button>
    </div>
  );
}

export function ModelsPage({ onChanged }: { onChanged?: () => void }) {
  const controller = useModelConnections(onChanged);
  const [route, setRoute] = useState<ModelsRoute>({ name: "list" });
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const go = (next: ModelsRoute) => {
    controller.setError(null);
    setRoute(next);
  };
  const value: ModelsContextValue = { controller, go, draft, setDraft };

  let page: ReactNode;
  if (!controller.view) {
    page = (
      <>
        <PageHeader title="模型" description="模型连接、各用途的默认模型与思考档位。" />
        {controller.error ? <ModelsError /> : <p className="text-act-sm text-text-muted">正在读取…</p>}
      </>
    );
  } else if (route.name === "catalog") {
    page = <TemplateCatalogPage />;
  } else if (route.name === "setup" && draft) {
    page = <ConnectionSetupPage draft={draft} />;
  } else if (route.name === "detail" && controller.view.connections.some((item) => item.connectionId === route.connectionId)) {
    page = <ConnectionDetailPage key={route.connectionId} connectionId={route.connectionId} initialExpanded={route.expand ?? null} initialProbe={route.probe ?? null} />;
  } else {
    page = (
      <>
        <PageHeader title="模型" description="模型连接、各用途的默认模型与思考档位。" />
        <ModelsError />
        <PurposesSection view={controller.view} />
        <ConnectionListSection connections={controller.view.connections} />
      </>
    );
  }
  return <ModelsContext.Provider value={value}>{page}</ModelsContext.Provider>;
}
