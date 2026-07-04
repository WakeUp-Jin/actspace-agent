import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  KAIROS_SOUL_PRESETS,
  type AppSettings,
  type KairosBriefSummary,
  type KairosBriefTrigger,
  type KairosBriefPriority,
  type KairosBudgetRuntime,
  type KairosConfigName,
  type KairosModelId,
  type KairosThinkingMode,
  type SettingsUpdateInput,
} from "@actspace/shared";
import {
  MultiSelect,
  NumberField,
  SettingGroup,
  SettingRow,
  SettingsSelect,
  TextField,
  Toggle,
  type SelectOption,
} from "./SettingsPrimitives";
import { TOOL_ITEMS } from "./tool-catalog";

/**
 * Kairos 设置：结构化表单编辑 `<userData>/kairos/config/` 下的配置。
 *
 * 3 份 JSON（preferences / paths / blocklist）用表单/开关/多选/列表呈现，**不暴露 raw JSON**；
 * `rule.md` 是自由 markdown，保留文本框。控件即时生效：开关/下拉/多选改即写，文本/数字 commit-on-blur，
 * 列表增删即写。写回策略：**读出整个对象 → patch 表单认识的字段 → 序列化写回**，保留未暴露字段（含 `tip`）。
 *
 * 模型与思考链写统一 `settings.json`；运行偏好仍编辑 Kairos 自己的 `preferences.json`。
 * 样式所有权：本组件持有 Kairos 配置的业务状态；展示原子复用 SettingsPrimitives。
 */

const BTN_SECONDARY =
  "inline-flex h-8 items-center rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60";
const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-act-md border border-line bg-surface text-text-faint transition-colors hover:border-on-danger/40 hover:text-on-danger";

const RULE_MAX_CHARS = 20_000;
const DEFAULT_MODEL_VALUE = "__default__";

const MODEL_OPTIONS: SelectOption[] = [
  { value: DEFAULT_MODEL_VALUE, label: "DeepSeek V4 Flash（默认）" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { value: "kimi-k2.6", label: "Kimi K2.6（偏贵）" },
  { value: "kimi-k2.7-code", label: "Kimi K2.7 Code（偏贵）" },
];

const THINKING_OPTIONS: SelectOption[] = [
  { value: "auto", label: "自动" },
  { value: "on", label: "开启" },
  { value: "off", label: "关闭" },
];

const BIAS_OPTIONS: SelectOption[] = [
  { value: "light", label: "浅睡（更活跃）" },
  { value: "normal", label: "正常" },
  { value: "deep", label: "深睡（更安静）" },
];

const TOOL_DENY_OPTIONS: SelectOption[] = TOOL_ITEMS.map((t) => ({ value: t.name, label: t.label }));

// 仅镜像本组件会读取 / 重置的默认值（与 agent-core schema.ts 对齐）。
const SLEEP_DEFAULT = { min: 30, max: 900, default: 120 } as const;
const RHYTHM_DEFAULT = {
  timezone: "Asia/Shanghai",
  workHours: { start: "09:00", end: "21:00", sleepBias: "normal" },
  quietHours: { start: "23:00", end: "07:00", sleepBias: "deep" },
  weekend: { sleepBias: "light" },
} as const;

const PREFERENCES_DEFAULT: Record<string, unknown> = {
  tip: "Kairos 默认偏好；如需调整 sleep / tickBudget 等请编辑本文件。",
  enabled: false,
  sleepRangeSeconds: { ...SLEEP_DEFAULT },
  tickBudget: { perDay: 200, perHour: 30 },
  circuitBreaker: { errorThreshold: 5, cooldownSec: 60 },
  memory: { loadBudgetRatio: 0.75, compressionThreshold: 0.85 },
  rhythm: {
    timezone: RHYTHM_DEFAULT.timezone,
    workHours: { ...RHYTHM_DEFAULT.workHours },
    quietHours: { ...RHYTHM_DEFAULT.quietHours },
    weekend: { ...RHYTHM_DEFAULT.weekend },
  },
};

// ─── 轻量取值 / 解析工具 ───
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asObj(v: unknown): Record<string, unknown> {
  return isObj(v) ? v : {};
}
function asStr(v: unknown, fb: string): string {
  return typeof v === "string" ? v : fb;
}
function asNum(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
function setPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (!isObj(cur[k])) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
}

type Parsed = { obj: Record<string, unknown>; parseError: boolean };
type PatchFn = (mutate: (obj: Record<string, unknown>) => void) => void;

function parseObj(content: string): Parsed {
  const trimmed = content.trim();
  if (!trimmed) return { obj: {}, parseError: false };
  try {
    const v = JSON.parse(trimmed);
    if (!isObj(v)) return { obj: {}, parseError: true };
    return { obj: v, parseError: false };
  } catch {
    return { obj: {}, parseError: true };
  }
}

function getKairosBridge() {
  return typeof window !== "undefined" ? window.kairos : undefined;
}

export function KairosSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
}) {
  const bridgeAvailable = Boolean(getKairosBridge());
  const [budget, setBudget] = useState<KairosBudgetRuntime | null>(null);
  const [prefs, setPrefs] = useState<Parsed | null>(null);
  const [pathsObj, setPathsObj] = useState<Parsed | null>(null);
  const [blocklistObj, setBlocklistObj] = useState<Parsed | null>(null);
  const [ruleText, setRuleText] = useState("");
  const [soulText, setSoulText] = useState("");
  const [loading, setLoading] = useState(bridgeAvailable);
  const [loadError, setLoadError] = useState<string | null>(null);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const pathsRef = useRef(pathsObj);
  pathsRef.current = pathsObj;
  const blockRef = useRef(blocklistObj);
  blockRef.current = blocklistObj;

  useEffect(() => {
    const bridge = getKairosBridge();
    if (!bridge) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [p, pa, bl, ru, so] = await Promise.all([
          bridge.readConfig({ name: "preferences" }),
          bridge.readConfig({ name: "paths" }),
          bridge.readConfig({ name: "blocklist" }),
          bridge.readConfig({ name: "rule" }),
          bridge.readConfig({ name: "soul" }),
        ]);
        if (cancelled) return;
        setPrefs(parseObj(p.content));
        setPathsObj(parseObj(pa.content));
        setBlocklistObj(parseObj(bl.content));
        setRuleText(ru.content);
        setSoulText(so.content);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "读取 Kairos 配置失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 额度护栏（开关 + 剩余额度）走 window.kairos，与上面的 config 文件读写独立：
  // 初值取 getState().budget，并订阅 onState 让运行时余额递减 / 充值后实时反映到 UI。
  useEffect(() => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await bridge.getState();
        if (!cancelled) setBudget(state.budget);
      } catch {
        /* 桥暂不可用：保持 null，渲染兜底默认值 */
      }
    })();
    const off = bridge.onState((s) => {
      if (!cancelled) setBudget(s.budget);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const applyBudget = useCallback((next: { enabled: boolean; balanceCny: number }) => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    // 乐观更新，避免等 IPC 往返；exhausted 本地按同一规则推导。
    setBudget({ enabled: next.enabled, balanceCny: next.balanceCny, exhausted: next.enabled && next.balanceCny <= 0 });
    void bridge.control({ type: "set_budget", enabled: next.enabled, balanceCny: next.balanceCny }).catch(() => {
      // 写失败 → 回读真实状态恢复一致视图
      void bridge
        .getState()
        .then((s) => setBudget(s.budget))
        .catch(() => {});
    });
  }, []);

  const writeObj = useCallback(
    async (name: KairosConfigName, obj: Record<string, unknown>) => {
      const bridge = getKairosBridge();
      if (!bridge) return;
      try {
        await bridge.writeConfig({ name, content: JSON.stringify(obj, null, 2) + "\n" });
      } catch {
        // 结构化表单产出的 JSON 恒合法，写失败多为 IO；回读磁盘以恢复一致视图。
        try {
          const res = await bridge.readConfig({ name });
          const parsed = parseObj(res.content);
          if (name === "preferences") setPrefs(parsed);
          else if (name === "paths") setPathsObj(parsed);
          else if (name === "blocklist") setBlocklistObj(parsed);
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const patchPrefs = useCallback<PatchFn>(
    (mutate) => {
      const base = clone(prefsRef.current?.obj ?? {});
      mutate(base);
      setPrefs({ obj: base, parseError: false });
      void writeObj("preferences", base);
    },
    [writeObj],
  );

  const patchPaths = useCallback<PatchFn>(
    (mutate) => {
      const base = clone(pathsRef.current?.obj ?? {});
      mutate(base);
      setPathsObj({ obj: base, parseError: false });
      // 写盘前过滤空 path 行（与 main parsePathsConfig 丢空一致）；空行仅留本地 UI 待填。
      const forWrite = clone(base);
      forWrite.paths = asArr(forWrite.paths).filter(
        (it) => isObj(it) && asStr(it.path, "").trim().length > 0,
      );
      void writeObj("paths", forWrite);
    },
    [writeObj],
  );

  const patchBlocklist = useCallback<PatchFn>(
    (mutate) => {
      const base = clone(blockRef.current?.obj ?? {});
      mutate(base);
      setBlocklistObj({ obj: base, parseError: false });
      const forWrite = clone(base);
      forWrite.paths = asArr(forWrite.paths).filter(
        (s) => typeof s === "string" && s.trim().length > 0,
      );
      forWrite.timeWindows = asArr(forWrite.timeWindows).filter(
        (w) => isObj(w) && (asStr(w.from, "").trim().length > 0 || asStr(w.to, "").trim().length > 0),
      );
      void writeObj("blocklist", forWrite);
    },
    [writeObj],
  );

  const writeRule = useCallback(async (text: string) => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    setRuleText(text);
    try {
      await bridge.writeConfig({ name: "rule", content: text });
    } catch {
      try {
        const res = await bridge.readConfig({ name: "rule" });
        setRuleText(res.content);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const writeSoul = useCallback(async (text: string) => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    setSoulText(text);
    try {
      await bridge.writeConfig({ name: "soul", content: text });
    } catch {
      try {
        const res = await bridge.readConfig({ name: "soul" });
        setSoulText(res.content);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const resetPreferences = useCallback(() => {
    const def = clone(PREFERENCES_DEFAULT);
    setPrefs({ obj: def, parseError: false });
    void writeObj("preferences", def);
  }, [writeObj]);

  const prefsParseError = prefs?.parseError ?? false;
  const modelValue = settings.kairos.modelId ?? DEFAULT_MODEL_VALUE;
  const formsReady = bridgeAvailable && !loading && !loadError;

  return (
    <>
      <SettingGroup title="Kairos 自主智能体">
        <SettingRow
          title="模型"
          description={
            bridgeAvailable
              ? "Kairos 自主模式使用的模型，保存到 settings.json；改后会立即重建 Kairos 并生效。Kimi 单价更高，自主模式量大建议配合下方额度护栏。"
              : "Kairos 模型仅在桌面端可配置（保存在 settings.json）。"
          }
          align="start"
          control={
            <div className="flex flex-col items-end gap-1">
              <SettingsSelect
                value={modelValue}
                options={MODEL_OPTIONS}
                onChange={(value) => {
                  onUpdate({
                    kairos: { modelId: value === DEFAULT_MODEL_VALUE ? null : (value as KairosModelId) },
                  });
                }}
                disabled={!bridgeAvailable || loading}
                ariaLabel="Kairos 模型"
              />
              {prefsParseError ? (
                <span className="max-w-[220px] text-right text-[11px] leading-snug text-on-danger">
                  preferences.json 解析失败；模型设置仍会保存到 settings.json。
                </span>
              ) : null}
            </div>
          }
        />
        <SettingRow
          title="思考链"
          description="是否启用模型的思考过程。"
          control={
            <SettingsSelect
              value={settings.kairos.thinking}
              options={THINKING_OPTIONS}
              onChange={(value) => onUpdate({ kairos: { thinking: value as KairosThinkingMode } })}
              ariaLabel="Kairos 思考链"
            />
          }
        />
        {bridgeAvailable ? (
          <BudgetRows
            budget={budget ?? { enabled: false, balanceCny: 0, exhausted: false }}
            onApply={applyBudget}
          />
        ) : (
          <SettingRow
            title="额度限制"
            description="Kairos 额度护栏仅在桌面端可配置。"
            control={<Toggle checked={false} disabled ariaLabel="Kairos 额度限制" onChange={() => {}} />}
          />
        )}
      </SettingGroup>

      {!bridgeAvailable ? (
        <SettingGroup title="Kairos 配置">
          <div className="px-4 py-3.5 text-[13px] text-text-faint">Kairos 配置仅在桌面端可编辑。</div>
        </SettingGroup>
      ) : loading ? (
        <SettingGroup title="Kairos 配置">
          <div className="px-4 py-3.5 text-[13px] text-text-faint">加载配置中…</div>
        </SettingGroup>
      ) : loadError ? (
        <SettingGroup title="Kairos 配置">
          <div className="px-4 py-3.5 text-[13px] text-on-danger">读取配置失败：{loadError}</div>
        </SettingGroup>
      ) : null}

      {formsReady ? <SoulForm value={soulText} onSave={(text) => void writeSoul(text)} /> : null}
      {formsReady ? <RuleForm value={ruleText} onSave={(text) => void writeRule(text)} /> : null}
      {formsReady ? <BriefsForm /> : null}
      {formsReady && prefs ? (
        <PreferencesForm prefs={prefs} patch={patchPrefs} onReset={resetPreferences} />
      ) : null}
      {formsReady && pathsObj ? <PathsForm paths={pathsObj} patch={patchPaths} /> : null}
      {formsReady && blocklistObj ? <BlocklistForm blocklist={blocklistObj} patch={patchBlocklist} /> : null}
    </>
  );
}

// ─── 额度护栏（单一余额：开关 + 剩余额度）───

function formatBalance(n: number): string {
  // 余额最多 2 位小数；去掉无意义的尾随零（5.00 → "5"，0.5 → "0.5"）。
  return String(Math.round(n * 100) / 100);
}

function BudgetRows({
  budget,
  onApply,
}: {
  budget: KairosBudgetRuntime;
  onApply: (next: { enabled: boolean; balanceCny: number }) => void;
}) {
  return (
    <>
      <SettingRow
        title="额度限制"
        description="开启后 Kairos 每次模型回复都会从下方「剩余额度」扣费；额度用完（≤0）会自动暂停，需充值后手动重新开启。关闭则不限额、持续运行。"
        control={
          <Toggle
            checked={budget.enabled}
            ariaLabel="Kairos 额度限制"
            onChange={(next) => onApply({ enabled: next, balanceCny: budget.balanceCny })}
          />
        }
      />
      <SettingRow
        title="剩余额度"
        align="start"
        description={
          budget.enabled && budget.exhausted
            ? "额度已用完，Kairos 已暂停。调高下方数值即为「充值」，保存后回 Kairos 页手动开启。"
            : "Kairos 还能花的钱（按人民币估算），运行时会不断减少；想充值就直接把这个数调大。仅在开启额度限制时可编辑。"
        }
        control={
          <div className="flex flex-col items-end gap-1">
            <BudgetBalanceField
              balanceCny={budget.balanceCny}
              disabled={!budget.enabled}
              onCommit={(value) => onApply({ enabled: budget.enabled, balanceCny: value })}
            />
            {budget.enabled && budget.exhausted ? (
              <span className="text-[11px] font-medium text-on-danger">额度不足</span>
            ) : null}
          </div>
        }
      />
    </>
  );
}

function BudgetBalanceField({
  balanceCny,
  disabled,
  onCommit,
}: {
  balanceCny: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatBalance(balanceCny));
  const focused = useRef(false);

  // 运行时余额递减 / 外部充值 → 同步显示，但不打断用户正在输入。
  useEffect(() => {
    if (!focused.current) setDraft(formatBalance(balanceCny));
  }, [balanceCny]);

  const commit = () => {
    focused.current = false;
    const raw = draft.trim();
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed) || parsed < 0) {
      // 非法输入回退到当前余额，不提交
      setDraft(formatBalance(balanceCny));
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    setDraft(formatBalance(rounded));
    if (rounded !== balanceCny) onCommit(rounded);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-text-faint">¥</span>
      <input
        type="number"
        inputMode="decimal"
        aria-label="Kairos 剩余额度"
        value={draft}
        min={0}
        step={0.5}
        disabled={disabled}
        spellCheck={false}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className={[
          "h-9 w-[120px] rounded-act-md border border-line bg-surface px-3 text-right text-[13px] font-medium tabular-nums text-text-main outline-none transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-brand/40 focus-visible:border-brand",
        ].join(" ")}
      />
    </div>
  );
}

// ─── 运行偏好（精简：固定时段频率 + 睡眠区间）───

function PreferencesForm({
  prefs,
  patch,
  onReset,
}: {
  prefs: Parsed;
  patch: PatchFn;
  onReset: () => void;
}) {
  if (prefs.parseError) {
    return (
      <SettingGroup title="运行偏好">
        <div className="flex flex-col items-start gap-2 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-on-danger">
            preferences.json 解析失败（可能被手动改坏）。可用默认值覆盖以恢复表单编辑。
          </p>
          <button type="button" className={BTN_SECONDARY} onClick={onReset}>
            用默认值覆盖 preferences.json
          </button>
        </div>
      </SettingGroup>
    );
  }

  const rh = asObj(prefs.obj.rhythm);
  const sr = asObj(prefs.obj.sleepRangeSeconds);

  return (
    <SettingGroup title="运行偏好">
      <HoursRow
        title="工作时段"
        timeLabel={`${RHYTHM_DEFAULT.workHours.start} - ${RHYTHM_DEFAULT.workHours.end}`}
        description="固定为默认工作时间；只调整这段时间内的运行频率。"
        hours={asObj(rh.workHours)}
        biasFallback={RHYTHM_DEFAULT.workHours.sleepBias}
        onChange={(val) => patch((o) => setPath(o, ["rhythm", "workHours", "sleepBias"], val))}
      />
      <HoursRow
        title="晚上时段"
        timeLabel={`${RHYTHM_DEFAULT.quietHours.start} - ${RHYTHM_DEFAULT.quietHours.end}`}
        description="固定为默认夜间时间；只调整这段时间内的运行频率。"
        hours={asObj(rh.quietHours)}
        biasFallback={RHYTHM_DEFAULT.quietHours.sleepBias}
        onChange={(val) => patch((o) => setPath(o, ["rhythm", "quietHours", "sleepBias"], val))}
      />
      <SettingRow
        title="睡眠区间"
        description="Kairos 每次休眠的秒数会被限制在该区间内。"
        align="start"
        control={
          <div className="flex flex-col gap-2">
            <SleepField
              label="最短"
              value={asNum(sr.min, SLEEP_DEFAULT.min)}
              fallback={SLEEP_DEFAULT.min}
              onCommit={(n) => patch((o) => setPath(o, ["sleepRangeSeconds", "min"], n))}
            />
            <SleepField
              label="最长"
              value={asNum(sr.max, SLEEP_DEFAULT.max)}
              fallback={SLEEP_DEFAULT.max}
              onCommit={(n) => patch((o) => setPath(o, ["sleepRangeSeconds", "max"], n))}
            />
            <SleepField
              label="默认"
              value={asNum(sr.default, SLEEP_DEFAULT.default)}
              fallback={SLEEP_DEFAULT.default}
              onCommit={(n) => patch((o) => setPath(o, ["sleepRangeSeconds", "default"], n))}
            />
          </div>
        }
      />
    </SettingGroup>
  );
}

function HoursRow({
  title,
  timeLabel,
  description,
  hours,
  biasFallback,
  onChange,
}: {
  title: string;
  timeLabel: string;
  description: string;
  hours: Record<string, unknown>;
  biasFallback: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow
      title={title}
      description={`${timeLabel}，${description}`}
      align="start"
      control={
        <div className="flex flex-col items-end gap-2">
          <SettingsSelect
            value={asStr(hours.sleepBias, biasFallback)}
            options={BIAS_OPTIONS}
            onChange={onChange}
            ariaLabel={`${title}运行频率`}
          />
        </div>
      }
    />
  );
}

function SleepField({
  label,
  value,
  fallback,
  onCommit,
}: {
  label: string;
  value: number;
  fallback: number;
  onCommit: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="w-8 text-right text-[12px] text-text-faint">{label}</span>
      <NumberField
        value={value}
        placeholder={String(fallback)}
        min={1}
        step={1}
        suffix="秒"
        ariaLabel={`睡眠区间${label}`}
        onCommit={(n) => onCommit(typeof n === "number" && n >= 1 ? Math.floor(n) : fallback)}
      />
    </div>
  );
}

// ─── 可访问路径（点击编辑列表）───

/**
 * 识别「Kairos 默认 workspace」那一条：main 端 scaffolding 固定写 `<kairosRoot>/workspace`，
 * 后缀 `kairos/workspace` 稳定，故据此判定（渲染层无需新增 IPC 拿绝对根路径）。该行禁止删除/改路径。
 */
function isDefaultWorkspacePath(p: string): boolean {
  const norm = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return norm.endsWith("/kairos/workspace");
}

/** 行内「展示 → 点击编辑」字段（Cursor rule 风格）：默认只读文本，点一下变输入框，失焦 / 回车提交。 */
function InlineEdit({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  emptyHint,
  mono = false,
  autoEdit = false,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  emptyHint?: string;
  mono?: boolean;
  autoEdit?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={[
          "h-8 rounded-act-md border border-brand bg-surface px-2.5 text-text-main outline-none",
          mono ? "font-mono text-[12px]" : "text-[13px]",
          className ?? "w-full",
        ].join(" ")}
      />
    );
  }

  const isEmpty = value.trim().length === 0;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={value || undefined}
      onClick={() => setEditing(true)}
      className={[
        "truncate rounded-act-sm px-2.5 py-1 text-left transition-colors hover:bg-[var(--act-color-hover-overlay)]",
        mono ? "font-mono text-[12px]" : "text-[13px]",
        isEmpty ? "text-text-faint" : "text-text-main",
        className ?? "w-full",
      ].join(" ")}
    >
      {isEmpty ? (emptyHint ?? placeholder ?? "") : value}
    </button>
  );
}

function PathsForm({ paths, patch }: { paths: Parsed; patch: PatchFn }) {
  const list = asArr(paths.obj.paths);
  // 新增行自动进入编辑态（无需用户再点一下空文本）；只对新挂载的末行生效。
  const [autoEditIndex, setAutoEditIndex] = useState<number | null>(null);

  const addPath = () => {
    setAutoEditIndex(list.length);
    patch((o) => {
      const a = asArr(o.paths);
      a.push({ path: "" });
      o.paths = a;
    });
  };

  return (
    <SettingGroup title="可读写路径">
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <p className="text-[12px] leading-relaxed text-text-faint">
          Kairos 可读写这里声明的路径（默认只有自己的 workspace）。文件监听（fs-watch）的目录会自动并入只读范围，无需在此重复添加。新增前请确认不会暴露敏感目录。
        </p>
        {list.length === 0 ? (
          <p className="py-1 text-[12px] text-text-subtle">暂未配置；Kairos 仅能访问内置默认 workspace。</p>
        ) : (
          <div className="flex flex-col">
            {list.map((raw, i) => {
              const item = asObj(raw);
              const path = asStr(item.path, "");
              const isDefault = isDefaultWorkspacePath(path);
              return (
                <div
                  key={i}
                  className="group flex flex-col gap-0.5 rounded-act-md py-1.5 transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex items-center gap-1.5">
                    {isDefault ? (
                      <span className="shrink-0 rounded-act-sm bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium text-text-faint">
                        默认
                      </span>
                    ) : null}
                    {isDefault ? (
                      <span
                        title={path}
                        className="min-w-0 flex-1 truncate px-2.5 py-1 font-mono text-[12px] text-text-main"
                      >
                        {path}
                      </span>
                    ) : (
                      <InlineEdit
                        value={path}
                        ariaLabel={`路径 ${i + 1}`}
                        placeholder="/绝对路径 或 <userData>/…"
                        emptyHint="点击填写路径"
                        mono
                        autoEdit={autoEditIndex === i}
                        className="min-w-0 flex-1"
                        onCommit={(v) =>
                          patch((o) => {
                            const a = asArr(o.paths);
                            const it = asObj(a[i]);
                            it.path = v.trim();
                            a[i] = it;
                            o.paths = a;
                          })
                        }
                      />
                    )}
                    {isDefault ? (
                      <span className="w-8 shrink-0" aria-hidden="true" />
                    ) : (
                      <button
                        type="button"
                        aria-label={`删除路径 ${i + 1}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-act-sm text-text-faint opacity-0 transition-opacity hover:text-on-danger focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() =>
                          patch((o) => {
                            const a = asArr(o.paths);
                            a.splice(i, 1);
                            o.paths = a;
                          })
                        }
                      >
                        <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="pl-2.5">
                    <InlineEdit
                      value={asStr(item.tip, "")}
                      ariaLabel={`路径 ${i + 1} 说明`}
                      placeholder="说明这个目录是干嘛的，给 Kairos 看"
                      emptyHint="+ 添加说明"
                      onCommit={(v) =>
                        patch((o) => {
                          const a = asArr(o.paths);
                          const it = asObj(a[i]);
                          const t = v.trim();
                          if (t) it.tip = t;
                          else delete it.tip;
                          a[i] = it;
                          o.paths = a;
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className={`${BTN_SECONDARY} self-start`} onClick={addPath}>
          <Plus size={15} strokeWidth={2.2} className="mr-1" aria-hidden="true" />
          添加路径
        </button>
      </div>
    </SettingGroup>
  );
}

// ─── 屏蔽规则 ───

function BlocklistForm({ blocklist, patch }: { blocklist: Parsed; patch: PatchFn }) {
  const globs = asArr(blocklist.obj.paths);
  const denied = asArr(blocklist.obj.toolsDenied).filter((s): s is string => typeof s === "string");

  return (
    <SettingGroup title="屏蔽规则">
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-text-main">屏蔽路径</span>
          <p className="text-[12px] leading-relaxed text-text-faint">
            命中即拒绝的 glob（如 <code className="font-mono">**/.env</code>、
            <code className="font-mono">**/secrets/**</code>）。LLM 看不到此列表。
          </p>
        </div>
        {globs.length === 0 ? (
          <p className="text-[12px] text-text-subtle">暂无屏蔽路径。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {globs.map((raw, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextField
                  value={typeof raw === "string" ? raw : ""}
                  placeholder="**/.env"
                  ariaLabel={`屏蔽路径 ${i + 1}`}
                  mono
                  className="min-w-0 flex-1"
                  onCommit={(v) =>
                    patch((o) => {
                      const a = asArr(o.paths);
                      a[i] = v;
                      o.paths = a;
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={`删除屏蔽路径 ${i + 1}`}
                  className={ICON_BTN}
                  onClick={() =>
                    patch((o) => {
                      const a = asArr(o.paths);
                      a.splice(i, 1);
                      o.paths = a;
                    })
                  }
                >
                  <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`${BTN_SECONDARY} self-start`}
          onClick={() =>
            patch((o) => {
              const a = asArr(o.paths);
              a.push("");
              o.paths = a;
            })
          }
        >
          <Plus size={15} strokeWidth={2.2} className="mr-1" aria-hidden="true" />
          添加屏蔽路径
        </button>
      </div>

      <SettingRow
        title="禁用工具"
        description="选中的工具对 Kairos 不可用（与上方「工具」分区的主 Agent 开关相互独立）。"
        align="start"
        control={
          <MultiSelect
            values={denied}
            options={TOOL_DENY_OPTIONS}
            placeholder="未禁用任何工具"
            ariaLabel="Kairos 禁用工具"
            onChange={(vals) =>
              patch((o) => {
                o.toolsDenied = vals;
              })
            }
          />
        }
      />
    </SettingGroup>
  );
}

// ─── 人格（soul.md：预设下拉 + 文本框）───

const SOUL_MAX_CHARS = 3_000;
const SOUL_CUSTOM_VALUE = "__custom__";

const SOUL_PRESET_OPTIONS: SelectOption[] = [
  ...KAIROS_SOUL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: SOUL_CUSTOM_VALUE, label: "自定义" },
];

/**
 * 通过「当前 soul 内容与哪个 preset 逐字节相等（trim 后）」反推下拉选中态。
 * 空内容视为「默认」——loader 会 fallback 到 KAIROS_DEFAULT_SOUL（= default preset）。
 */
function matchSoulPreset(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return KAIROS_SOUL_PRESETS[0].id;
  const hit = KAIROS_SOUL_PRESETS.find((p) => p.content.trim() === trimmed);
  return hit ? hit.id : SOUL_CUSTOM_VALUE;
}

function SoulForm({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const flash = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const commit = () => {
    focused.current = false;
    if (draft !== value) {
      onSave(draft);
      flash();
    }
  };

  const selectedPreset = matchSoulPreset(draft);

  const applyPreset = (presetId: string) => {
    if (presetId === SOUL_CUSTOM_VALUE) return;         // 「自定义」只是展示态，不可主动选中生效
    const preset = KAIROS_SOUL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // 覆盖用户自定义内容前确认；当前内容为空或等于某个预设时直接切换。
    if (matchSoulPreset(draft) === SOUL_CUSTOM_VALUE) {
      const ok = window.confirm("当前人格是自定义内容，切换预设会覆盖它。确定继续吗？");
      if (!ok) return;
    }
    setDraft(preset.content);
    onSave(preset.content);
    flash();
  };

  return (
    <SettingGroup title="人格">
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] leading-relaxed text-text-faint">
            Kairos 的身份与语气（soul.md，约 500 token 上限），作为人格插槽注入系统提示词开头；
            例程、场景应对等机制规则由内置模板兜底，人格随便改都不影响行为骨架。留空 = 使用默认人格。
          </p>
          {savedFlash ? <span className="shrink-0 text-[12px] text-on-success">已保存</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-faint">预设</span>
          <SettingsSelect
            value={selectedPreset}
            options={SOUL_PRESET_OPTIONS}
            onChange={applyPreset}
            ariaLabel="Kairos 人格预设"
          />
        </div>
        <textarea
          value={draft}
          maxLength={SOUL_MAX_CHARS}
          aria-label="soul.md 内容"
          placeholder={KAIROS_SOUL_PRESETS[0].content}
          spellCheck={false}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="min-h-[140px] w-full resize-y overflow-auto rounded-act-md border border-line bg-surface-subtle px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text-main outline-none transition-colors placeholder:text-text-subtle focus:border-brand"
        />
      </div>
    </SettingGroup>
  );
}

// ─── 任务表（briefs/tasks/*.md 列表编辑）───

const TRIGGER_OPTIONS: SelectOption[] = [
  { value: "interval", label: "定时（间隔）" },
  { value: "manual", label: "手动" },
  { value: "event", label: "事件" },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "high", label: "高" },
  { value: "normal", label: "普通" },
  { value: "low", label: "低" },
];

interface BriefDraft {
  id: string;
  active: boolean;
  trigger: KairosBriefTrigger;
  intervalSec: number | null;
  priority: KairosBriefPriority;
  body: string;
}

function BriefsForm() {
  const [briefs, setBriefs] = useState<KairosBriefSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 当前展开编辑的 brief id；`__new__` 表示新建表单。 */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BriefDraft | null>(null);

  const refresh = useCallback(async () => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    try {
      const res = await bridge.briefsList();
      setBriefs(res.briefs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取任务表失败。");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEditor = async (summary: KairosBriefSummary) => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    try {
      const res = await bridge.briefsRead({ id: summary.id });
      setDraft({
        id: summary.id,
        active: res.summary.status === "active",
        trigger: res.summary.trigger,
        intervalSec: res.summary.intervalSec,
        priority: res.summary.priority,
        body: res.body,
      });
      setExpandedId(summary.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取任务失败。");
    }
  };

  const openNew = () => {
    setDraft({ id: "", active: true, trigger: "interval", intervalSec: 3600, priority: "normal", body: "" });
    setExpandedId("__new__");
  };

  const closeEditor = () => {
    setExpandedId(null);
    setDraft(null);
  };

  const saveDraft = async () => {
    const bridge = getKairosBridge();
    if (!bridge || !draft) return;
    try {
      await bridge.briefsWrite({
        id: draft.id.trim(),
        status: draft.active ? "active" : "paused",
        trigger: draft.trigger,
        intervalSec: draft.trigger === "interval" ? draft.intervalSec : null,
        priority: draft.priority,
        body: draft.body,
      });
      closeEditor();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败。");
    }
  };

  const removeBrief = async (id: string) => {
    const bridge = getKairosBridge();
    if (!bridge) return;
    const ok = window.confirm(`确定删除任务「${id}」吗？该操作会移除对应的 brief 文件。`);
    if (!ok) return;
    try {
      await bridge.briefsDelete({ id });
      if (expandedId === id) closeEditor();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除任务失败。");
    }
  };

  return (
    <SettingGroup title="任务表">
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <p className="text-[12px] leading-relaxed text-text-faint">
          交给 Kairos 的例行任务（briefs/tasks/*.md）。定时任务到点会把正文投递进 Kairos 的下一次唤醒；
          最近运行 / 下次运行时间由系统维护。
        </p>
        {error ? <p className="text-[12px] text-on-danger">{error}</p> : null}
        {briefs.length === 0 && expandedId !== "__new__" ? (
          <p className="py-1 text-[12px] text-text-subtle">暂无任务。</p>
        ) : (
          <div className="flex flex-col">
            {briefs.map((b) => (
              <div key={b.id} className="flex flex-col border-b border-line/60 py-1.5 last:border-b-0">
                <div className="group flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`编辑任务 ${b.id}`}
                    onClick={() => (expandedId === b.id ? closeEditor() : void openEditor(b))}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-act-sm px-1.5 py-1 text-left transition-colors hover:bg-[var(--act-color-hover-overlay)]"
                  >
                    {expandedId === b.id ? (
                      <ChevronDown size={14} strokeWidth={2} className="shrink-0 text-text-faint" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-text-faint" aria-hidden="true" />
                    )}
                    <span className="truncate font-mono text-[12px] text-text-main">{b.id}</span>
                    <BriefStatusBadge status={b.status} />
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-faint">
                      {b.trigger === "interval" && b.intervalSec ? `每 ${formatInterval(b.intervalSec)}` : triggerLabel(b.trigger)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`删除任务 ${b.id}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-act-sm text-text-faint opacity-0 transition-opacity hover:text-on-danger focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => void removeBrief(b.id)}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                {expandedId === b.id && draft ? (
                  <BriefEditor draft={draft} isNew={false} onChange={setDraft} onSave={() => void saveDraft()} onCancel={closeEditor} />
                ) : null}
              </div>
            ))}
          </div>
        )}
        {expandedId === "__new__" && draft ? (
          <BriefEditor draft={draft} isNew onChange={setDraft} onSave={() => void saveDraft()} onCancel={closeEditor} />
        ) : (
          <button type="button" className={`${BTN_SECONDARY} self-start`} onClick={openNew}>
            <Plus size={15} strokeWidth={2.2} className="mr-1" aria-hidden="true" />
            新建任务
          </button>
        )}
      </div>
    </SettingGroup>
  );
}

function triggerLabel(trigger: KairosBriefTrigger): string {
  return TRIGGER_OPTIONS.find((o) => o.value === trigger)?.label ?? trigger;
}

function formatInterval(sec: number): string {
  if (sec % 86_400 === 0) return `${sec / 86_400} 天`;
  if (sec % 3_600 === 0) return `${sec / 3_600} 小时`;
  if (sec % 60 === 0) return `${sec / 60} 分钟`;
  return `${sec} 秒`;
}

function BriefStatusBadge({ status }: { status: KairosBriefSummary["status"] }) {
  const map: Record<KairosBriefSummary["status"], { label: string; cls: string }> = {
    active: { label: "启用", cls: "bg-brand-soft text-brand" },
    paused: { label: "暂停", cls: "bg-surface-subtle text-text-faint" },
    done: { label: "已完成", cls: "bg-surface-subtle text-text-faint" },
    failed: { label: "失败", cls: "bg-surface-subtle text-on-danger" },
  };
  const it = map[status];
  return (
    <span className={`shrink-0 rounded-act-sm px-1.5 py-0.5 text-[11px] font-medium ${it.cls}`}>{it.label}</span>
  );
}

function BriefEditor({
  draft,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  draft: BriefDraft;
  isNew: boolean;
  onChange: (next: BriefDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const idValid = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(draft.id.trim());
  const intervalValid = draft.trigger !== "interval" || (draft.intervalSec != null && draft.intervalSec > 0);
  const canSave = idValid && intervalValid;

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-act-md border border-line bg-surface-subtle p-3">
      {isNew ? (
        <label className="flex items-center gap-2 text-[12px] text-text-faint">
          <span className="w-14 shrink-0">任务 ID</span>
          <input
            value={draft.id}
            aria-label="任务 ID"
            placeholder="daily-report（字母/数字/-/_）"
            spellCheck={false}
            onChange={(e) => onChange({ ...draft, id: e.target.value })}
            className="h-8 min-w-0 flex-1 rounded-act-md border border-line bg-surface px-2.5 font-mono text-[12px] text-text-main outline-none transition-colors focus:border-brand"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-[12px] text-text-faint">
          <span>启用</span>
          <Toggle
            checked={draft.active}
            ariaLabel="任务启用"
            onChange={(next) => onChange({ ...draft, active: next })}
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-text-faint">
          <span>触发</span>
          <SettingsSelect
            value={draft.trigger}
            options={TRIGGER_OPTIONS}
            ariaLabel="任务触发方式"
            onChange={(v) => onChange({ ...draft, trigger: v as KairosBriefTrigger })}
          />
        </label>
        {draft.trigger === "interval" ? (
          <label className="flex items-center gap-2 text-[12px] text-text-faint">
            <span>间隔</span>
            <NumberField
              value={draft.intervalSec ?? 3600}
              placeholder="3600"
              min={60}
              step={60}
              suffix="秒"
              ariaLabel="任务间隔秒数"
              onCommit={(n) =>
                onChange({ ...draft, intervalSec: typeof n === "number" && n >= 1 ? Math.floor(n) : 3600 })
              }
            />
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-[12px] text-text-faint">
          <span>优先级</span>
          <SettingsSelect
            value={draft.priority}
            options={PRIORITY_OPTIONS}
            ariaLabel="任务优先级"
            onChange={(v) => onChange({ ...draft, priority: v as KairosBriefPriority })}
          />
        </label>
      </div>
      <textarea
        value={draft.body}
        aria-label="任务正文"
        placeholder={"# 任务说明\n写清楚要 Kairos 做什么、产出放哪里。"}
        spellCheck={false}
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
        className="min-h-[120px] w-full resize-y overflow-auto rounded-act-md border border-line bg-surface px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text-main outline-none transition-colors placeholder:text-text-subtle focus:border-brand"
      />
      <div className="flex items-center justify-between gap-3">
        {!idValid && draft.id.trim().length > 0 ? (
          <span className="text-[11px] text-on-danger">ID 仅限字母/数字/-/_，最长 64。</span>
        ) : !intervalValid ? (
          <span className="text-[11px] text-on-danger">定时任务需要正数间隔秒数。</span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={!canSave}
            onClick={onSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 用户规则（rule.md 文本框）───

function RuleForm({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = () => {
    focused.current = false;
    if (draft !== value) {
      onSave(draft);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    }
  };

  return (
    <SettingGroup title="用户规则">
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] leading-relaxed text-text-faint">
            写给 Kairos 的纯文本规则（markdown），整篇注入系统提示词（约 1500 token 上限）。失焦自动保存。
          </p>
          {savedFlash ? <span className="shrink-0 text-[12px] text-on-success">已保存</span> : null}
        </div>
        <textarea
          value={draft}
          maxLength={RULE_MAX_CHARS}
          aria-label="rule.md 内容"
          spellCheck={false}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="min-h-[160px] w-full resize-y overflow-auto rounded-act-md border border-line bg-surface-subtle px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text-main outline-none transition-colors focus:border-brand"
        />
      </div>
    </SettingGroup>
  );
}
