import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, CircleAlert, Eye, EyeOff } from "lucide-react";
import {
  customModelDraftFromCatalog,
  findBuiltinCatalogModel,
  type CustomConnectionAddressResult,
  type CustomConnectionAuthMode,
  type CustomConnectionProbeResult,
  type CustomModelDraftInput,
  type ModelApi,
  type ProviderConnectionErrorKind,
  type SettingsV4ConnectionSettings,
} from "@actspace/shared";
import { SettingsInput, StatusDot, Stepper } from "./SettingsPrimitives";

/** 自定义服务向导、官方 Anthropic 和连接详情共用的常量与小组件。 */

/** 自定义连接没有「已配置即已连接」的前提，只有测过才算数。 */
export function ConnectionStatusDot({ status, testing = false }: { status?: string; testing?: boolean }) {
  if (testing) return <StatusDot tone="neutral">测试中…</StatusDot>;
  if (status === "available") return <StatusDot tone="ok">可用</StatusDot>;
  if (status === "unavailable") return <StatusDot tone="error">连接异常</StatusDot>;
  return <StatusDot tone="off">未测试</StatusDot>;
}

/** 「刚刚」「5 分钟前」「14:02」「9月20日」。 */
export function formatCheckedAt(iso: string | undefined, now = Date.now()): string {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  const date = new Date(time);
  if (new Date(now).toDateString() === date.toDateString()) return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export const PROTOCOL_OPTIONS: readonly { value: ModelApi; label: string }[] = [
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "openai-completions", label: "OpenAI Chat" },
  { value: "openai-responses", label: "OpenAI Responses" },
];

export const AUTH_MODE_OPTIONS: readonly { value: CustomConnectionAuthMode; label: string }[] = [
  { value: "auto", label: "自动" },
  { value: "x-api-key", label: "x-api-key" },
  { value: "bearer", label: "Bearer" },
];

export const OFFICIAL_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const COMMON_ANTHROPIC_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"] as const;
const PREFERRED_DEFAULT_MODEL = "claude-sonnet-5";

// 倍率档位和 demo 一致。
export const MULTIPLIER_STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.5, 2] as const;
export const DEFAULT_RELAY_MULTIPLIER = 0.3;

export function protocolLabel(protocol: ModelApi | undefined): string {
  return PROTOCOL_OPTIONS.find((option) => option.value === (protocol ?? "openai-completions"))!.label;
}

export function hostOf(url: string | null | undefined): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url ?? "");
  return match?.[1] ?? url ?? "";
}

export function isOfficialAnthropic(connection: SettingsV4ConnectionSettings): boolean {
  return connection.catalogId === "anthropic" && hostOf(connection.baseUrl) === hostOf(OFFICIAL_ANTHROPIC_BASE_URL);
}

/** 服务返回的名称优先，其次目录名，最后是模型 ID。 */
export function modelDisplayLabel(apiModel: string, listedLabel?: string): string {
  return listedLabel ?? findBuiltinCatalogModel(apiModel)?.name ?? apiModel;
}

export function isKnownCatalogModel(apiModel: string): boolean {
  return findBuiltinCatalogModel(apiModel) !== undefined;
}

/** 默认勾选常用 Claude 模型；一个都没有时勾第一个。默认模型优先 Sonnet。 */
export function initialModelSelection(ids: readonly string[]): { selected: string[]; defaultId: string | null } {
  const common = COMMON_ANTHROPIC_MODELS.filter((id) => ids.includes(id));
  const selected = common.length ? [...common] : ids.slice(0, 1);
  const defaultId = selected.includes(PREFERRED_DEFAULT_MODEL) ? PREFERRED_DEFAULT_MODEL : selected[0] ?? null;
  return { selected, defaultId };
}

export function modelDraftsForSave(ids: readonly string[], labels: ReadonlyMap<string, string>): CustomModelDraftInput[] {
  return ids.map((id) => ({ ...customModelDraftFromCatalog(id), label: modelDisplayLabel(id, labels.get(id)) }));
}

export function newConnectionId(): string {
  return `custom-${crypto.randomUUID()}`;
}

const ADDRESS_ERRORS = {
  empty: "请填写服务地址。",
  scheme: "地址需要以 http:// 或 https:// 开头。",
  invalid: "地址格式不对，检查一下有没有多余的字符。",
  credentials: "地址里不能带用户名和密码。",
} as const;

/** 地址下方一行：实际请求地址，以及去掉了哪些后缀；无效时给出原因。 */
export function AddressPreview({ result, showEmpty = false }: { result: CustomConnectionAddressResult; showEmpty?: boolean }) {
  if ("reason" in result) {
    if (result.reason === "empty" && !showEmpty) return null;
    return <p className="mt-1.5 flex items-center gap-1.5 text-act-xs text-on-danger"><CircleAlert size={12} aria-hidden="true" />{ADDRESS_ERRORS[result.reason]}</p>;
  }
  return (
    <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-act-xs text-text-muted" data-testid="request-url">
      <ArrowRight size={12} className="shrink-0 text-text-faint" aria-hidden="true" />
      <code className="min-w-0 break-all font-mono text-act-xs text-text-main">{result.requestUrl}</code>
      {result.strippedSuffixes.length ? <span className="text-operational">{result.strippedSuffixes.map((suffix) => `已去掉 ${suffix}`).join("，")}</span> : null}
    </p>
  );
}

export function probeFailureTitle(errorKind: ProviderConnectionErrorKind | undefined, statusCode?: number): string {
  const code = statusCode ? `（${statusCode}）` : "";
  if (errorKind === "auth") return `认证失败${code}`;
  if (errorKind === "timeout") return "连接超时";
  if (errorKind === "proxy") return "代理连接失败";
  if (errorKind === "network") return "无法连接";
  return `连接失败${code}`;
}

/** 以档位下标驱动通用 Stepper，显示为「× 0.30」。 */
export function MultiplierStepper({ value, onChange, ariaLabel = "倍率" }: { value: number; onChange: (value: number) => void; ariaLabel?: string }) {
  const index = nearestStep(value);
  return (
    <Stepper
      value={index}
      min={0}
      max={MULTIPLIER_STEPS.length - 1}
      ariaLabel={ariaLabel}
      // 不在档位里的旧值照原样显示，按一下才会落到档位上。
      format={(next) => `× ${(next === index ? value : MULTIPLIER_STEPS[next]!).toFixed(2)}`}
      onChange={(next) => onChange(MULTIPLIER_STEPS[next]!)}
    />
  );
}

function nearestStep(value: number): number {
  let best = 0;
  MULTIPLIER_STEPS.forEach((step, index) => { if (Math.abs(step - value) < Math.abs(MULTIPLIER_STEPS[best]! - value)) best = index; });
  return best;
}

export type ProbeState =
  | { readonly status: "idle" | "running" | "stale" }
  | { readonly status: "ok" | "fail"; readonly result: CustomConnectionProbeResult };

/** 修改连接信息后，已通过的测试作废；失败结果和进行中的测试直接清掉。 */
export function invalidateProbe(state: ProbeState): ProbeState {
  if (state.status === "ok") return { status: "stale" };
  if (state.status === "fail" || state.status === "running") return { status: "idle" };
  return state;
}

/** 调用失败（IPC 抛错）时也按一次失败的测试展示。 */
export function probeErrorResult(error: unknown): CustomConnectionProbeResult {
  return { ok: false, message: error instanceof Error ? error.message : "测试失败，请稍后重试。", checkedAt: new Date().toISOString(), models: null };
}

/** 添加和详情页共用的页头：返回链接、logo、标题和一行副标题。 */
export function SetupHeader({ backLabel, onBack, logo, title, subtitle, children }: { backLabel: string; onBack: () => void; logo?: ReactNode; title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="-ml-1.5 inline-flex h-[26px] items-center gap-0.5 rounded-act-sm pl-1 pr-2 text-act-xs text-text-muted transition-colors hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30">
        <ChevronLeft size={14} aria-hidden="true" />
        {backLabel}
      </button>
      <div className="mt-2 flex items-center gap-3">
        {logo ? <span className="shrink-0 [&>*]:h-10 [&>*]:w-10">{logo}</span> : null}
        <div className="min-w-0">
          <h3 className="text-act-lg font-semibold tracking-tight text-text-main">{title}</h3>
          {subtitle ? <div className="mt-0.5 flex flex-wrap items-center gap-1 text-act-xs text-text-muted">{subtitle}</div> : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** 表单底部：左侧提示，右侧按钮。 */
export function SetupFooter({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 max-[600px]:flex-col max-[600px]:items-stretch">
      <div className="min-w-0 text-act-xs text-text-muted">{hint}</div>
      <div className="flex shrink-0 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** 页头下方的两步指示：当前步高亮，已完成的步显示勾。 */
export function WizardSteps({ step }: { step: 1 | 2 }) {
  const item = (index: 1 | 2, label: string) => {
    const done = index < step;
    const on = index === step;
    return (
      <li aria-current={on ? "step" : undefined} className={`flex items-center gap-1.5 ${on ? "font-medium text-text-main" : ""}`}>
        <span aria-hidden="true" className={`grid h-[18px] w-[18px] place-items-center rounded-full border text-act-xxs font-semibold ${on ? "border-action bg-action text-on-action" : done ? "border-transparent bg-operational-soft text-operational" : "border-line-strong"}`}>
          {done ? <Check size={11} strokeWidth={3} /> : index}
        </span>
        {label}
      </li>
    );
  };
  return (
    <ol aria-label="步骤" className="flex list-none flex-wrap items-center gap-2.5 text-act-xs text-text-faint">
      {item(1, "连接")}
      <li aria-hidden="true" className="h-px w-7 bg-line" />
      {item(2, "选择模型")}
    </ol>
  );
}

/** 向导卡片里的一个竖排字段：标题在上，控件占满宽度。 */
export function FormField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      {htmlFor ? <label htmlFor={htmlFor} className="mb-1.5 block text-act-xs font-medium text-text-muted">{label}</label> : <span className="mb-1.5 block text-act-xs font-medium text-text-muted">{label}</span>}
      {children}
    </div>
  );
}

export function SecretInput({ id, value, onChange, placeholder = "sk-…", ariaLabel = "API Key", autoFocus }: { id?: string; value: string; onChange: (value: string) => void; placeholder?: string; ariaLabel?: string; autoFocus?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <SettingsInput id={id} width="full" mono className="pr-9" type={visible ? "text" : "password"} autoComplete="off" autoFocus={autoFocus} aria-label={ariaLabel} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" aria-label={visible ? `隐藏 ${ariaLabel}` : `显示 ${ariaLabel}`} onClick={() => setVisible((current) => !current)} className="absolute right-1 top-1/2 grid h-6 w-7 -translate-y-1/2 place-items-center rounded-act-xs text-text-faint hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30">
        {visible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
      </button>
    </span>
  );
}

/** 默认折叠的「更多设置」；折叠时在标题旁显示当前取值摘要。 */
export function MoreSettings({ open, onToggle, summary, children }: { open: boolean; onToggle: () => void; summary?: string; children: ReactNode }) {
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-act-sm text-text-muted transition-colors hover:text-text-main focus-visible:bg-hover-overlay focus-visible:outline-none">
        <span className="font-medium">更多设置</span>
        {summary && !open ? <span className="min-w-0 truncate text-act-xs text-text-faint">{summary}</span> : null}
        <ChevronDown size={14} aria-hidden="true" className={`ml-auto shrink-0 transition-transform duration-(--motion-base) ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="grid gap-3 px-4 pb-3">{children}</div> : null}
    </div>
  );
}

/** 测试结果：成功（附模型数）、失败（标题 + 原因）、或「需要重新测试」。 */
export function ProbeResultNotice({ state, authMode }: { state: ProbeState; authMode?: CustomConnectionAuthMode }) {
  if (state.status === "idle") return null;
  const box = "mx-4 my-3 flex items-start gap-2 rounded-act-md px-3 py-2.5 text-act-xs leading-relaxed";
  if (state.status === "running") return <div role="status" className={`${box} bg-surface-subtle text-text-muted`}><span className="mt-0.5 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-transparent motion-reduce:animate-none" aria-hidden="true" />正在测试…</div>;
  if (state.status === "stale") return <div role="status" className={`${box} bg-warning-soft text-warning`}><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />连接信息已修改，需要重新测试</div>;
  if (!("result" in state)) return null;
  const { result } = state;
  if (state.status === "fail") {
    return (
      <div role="alert" className={`${box} bg-danger-soft text-on-danger`}>
        <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div><b className="font-semibold">{probeFailureTitle(result.errorKind, result.statusCode)}</b><p>{result.message}</p></div>
      </div>
    );
  }
  const headline = result.models ? `连接成功 · 找到 ${result.models.length} 个模型` : "已连通 · 服务未提供模型列表";
  return (
    <div role="status" className={`${box} bg-operational-soft text-text-main`}>
      <Check size={14} className="mt-0.5 shrink-0 text-operational" aria-hidden="true" />
      <div>
        <b className="font-semibold">{headline}</b>
        {authMode === "auto" && result.resolvedAuth === "bearer" ? <p className="text-text-muted">已自动改用 Bearer 认证</p> : null}
      </div>
    </div>
  );
}
