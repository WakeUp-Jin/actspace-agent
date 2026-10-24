import type { EffectiveModel, ModelFacts, ModelOverrides } from "./model-layers";
import type { ModelApi, ModelKey } from "./model-config";
import type { ThinkingLevel } from "./model-thinking-profiles";
import type { ProviderConnectionErrorKind, ProviderConnectionState, ProviderProxySettings, CustomConnectionResolvedAuth } from "./settings";

/**
 * 设置 › 模型 的 IPC 契约：连接（统一形状）、连接下的模型（有效值 + 用户修改）、用途表。
 * 每个修改都返回整份视图，renderer 不自己拼状态。
 */

export type PurposeId = "chat" | "utility" | "autoReview" | "explore" | "vision";
export const PURPOSE_IDS: readonly PurposeId[] = ["chat", "utility", "autoReview", "explore", "vision"];

/** model 为 null 表示「跟随」：会话默认之外的用途跟随会话默认。thinking 为 null 表示用模型的默认档位。 */
export type PurposeBinding = { model: ModelKey | null; thinking: ThinkingLevel | null };
export type PurposesView = Record<PurposeId, PurposeBinding>;

export type ConnectionModelView = {
  key: ModelKey;
  apiModel: string;
  effective: EffectiveModel;
  /** 用户修改；null = 没有修改。 */
  overrides: ModelOverrides | null;
  usedBy: PurposeId[];
};

export type ConnectionView = {
  connectionId: string;
  templateId: string;
  label: string;
  /** 自定义中转：可以改协议，模型可能不在目录里。 */
  relay: boolean;
  protocol: ModelApi;
  baseUrl: string;
  /** 模板默认地址；中转没有。 */
  defaultBaseUrl: string | null;
  hasApiKey: boolean;
  enabled: boolean;
  lastConnection: ProviderConnectionState;
  multiplier: number;
  proxy: ProviderProxySettings;
  /** 这个连接能查余额（DeepSeek / Kimi / OpenRouter 模板）。 */
  balance: boolean;
  /** 只有 OpenRouter：查余额要单独的管理 Key。 */
  hasManagementKey?: boolean;
  models: ConnectionModelView[];
};

export type ModelConnectionsView = {
  connections: ConnectionView[];
  purposes: PurposesView;
};

export type ModelConnectionsErrorCode =
  | "invalid_input"
  | "invalid_api_key"
  | "invalid_base_url"
  | "invalid_proxy_url"
  | "connection_missing"
  | "connection_exists"
  | "model_missing"
  | "model_exists"
  | "model_unusable"
  | "secret_storage_unavailable"
  | "write_failed";

export type ModelConnectionsResult =
  | { ok: true; view: ModelConnectionsView; connectionId?: string }
  | { ok: false; error: { code: ModelConnectionsErrorCode; message: string } };

/** 添加连接时填写的内容。官方模板只需要 apiKey；中转还要 protocol 和 baseUrl。 */
export type ConnectionDraftInput = {
  templateId: string;
  apiKey: string;
  label?: string;
  protocol?: ModelApi;
  baseUrl?: string;
  proxy?: ProviderProxySettings;
};

export type ConnectionProbeInput =
  | { kind: "draft"; draft: ConnectionDraftInput }
  | { kind: "saved"; connectionId: string };

export type ProbedModel = {
  apiModel: string;
  /** 连接 /models 返回的字段；拿不到列表、退回目录时为空。 */
  providerFacts: ModelFacts;
  effective: EffectiveModel;
  /** 已经在这个连接里了（只对 saved 探测有意义），弹窗里打勾置灰。 */
  added: boolean;
};

export type ConnectionProbeResult = {
  ok: boolean;
  message: string;
  checkedAt: string;
  errorKind?: ProviderConnectionErrorKind;
  statusCode?: number;
  resolvedAuth?: CustomConnectionResolvedAuth;
  /** "provider"：来自连接的 /models；"catalog"：/models 不可用，退回模板对应的目录模型；"none"：都没有，只能手动添加。 */
  listSource: "provider" | "catalog" | "none";
  models: ProbedModel[];
};

/** 加进连接的模型。连接里的模型都在用，没有「启用」开关；不要就移除。 */
export type ConnectionModelInput = {
  apiModel: string;
  providerFacts?: ModelFacts;
  overrides?: ModelOverrides;
};

export type ConnectionCreateInput = ConnectionDraftInput & {
  multiplier?: number;
  resolvedAuth?: CustomConnectionResolvedAuth;
  models: ConnectionModelInput[];
};

export type ConnectionUpdateInput = {
  connectionId: string;
  label?: string;
  protocol?: ModelApi;
  baseUrl?: string;
  /** 空字符串或缺省 = 不改 Key。 */
  apiKey?: string;
  proxy?: ProviderProxySettings;
  multiplier?: number;
  enabled?: boolean;
  /** 只有 OpenRouter；null = 清除。 */
  managementKey?: string | null;
};

export type ConnectionIdInput = { connectionId: string };

export type ConnectionModelsAddInput = { connectionId: string; models: ConnectionModelInput[] };

/** overrides：整份替换；null = 恢复目录值（清掉全部修改）。 */
export type ConnectionModelPatch = { key: ModelKey; overrides: ModelOverrides | null };

export type ModelKeyInput = { key: ModelKey };

export type ModelPreviewInput = {
  apiModel: string;
  connectionId?: string;
  /** 还没保存的连接：按模板 / 协议 / 倍率预览。 */
  templateId?: string;
  protocol?: ModelApi;
  multiplier?: number;
  overrides?: ModelOverrides;
};
export type ModelPreviewResult = { effective: EffectiveModel; added: boolean };

export type PurposesUpdateInput = Partial<Record<PurposeId, PurposeBinding>>;
