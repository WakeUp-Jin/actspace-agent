import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  type AppSettings,
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
function asBool(v: unknown, fb: boolean): boolean {
  return typeof v === "boolean" ? v : fb;
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
        const [p, pa, bl, ru] = await Promise.all([
          bridge.readConfig({ name: "preferences" }),
          bridge.readConfig({ name: "paths" }),
          bridge.readConfig({ name: "blocklist" }),
          bridge.readConfig({ name: "rule" }),
        ]);
        if (cancelled) return;
        setPrefs(parseObj(p.content));
        setPathsObj(parseObj(pa.content));
        setBlocklistObj(parseObj(bl.content));
        setRuleText(ru.content);
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
              ? "Kairos 自主模式使用的模型，保存到 settings.json；改后会立即重建 Kairos 并生效。"
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

      {formsReady && prefs ? (
        <PreferencesForm prefs={prefs} patch={patchPrefs} onReset={resetPreferences} />
      ) : null}
      {formsReady && pathsObj ? <PathsForm paths={pathsObj} patch={patchPaths} /> : null}
      {formsReady && blocklistObj ? <BlocklistForm blocklist={blocklistObj} patch={patchBlocklist} /> : null}
      {formsReady ? <RuleForm value={ruleText} onSave={(text) => void writeRule(text)} /> : null}
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

// ─── 运行偏好（精简：作息节律 + 睡眠区间）───

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
        description="该时段 Kairos 更活跃，倾向更短的休眠。"
        hours={asObj(rh.workHours)}
        startFallback={RHYTHM_DEFAULT.workHours.start}
        endFallback={RHYTHM_DEFAULT.workHours.end}
        biasFallback={RHYTHM_DEFAULT.workHours.sleepBias}
        onChange={(field, val) => patch((o) => setPath(o, ["rhythm", "workHours", field], val))}
      />
      <HoursRow
        title="安静时段"
        description="该时段尽量少打扰，倾向更长的休眠。"
        hours={asObj(rh.quietHours)}
        startFallback={RHYTHM_DEFAULT.quietHours.start}
        endFallback={RHYTHM_DEFAULT.quietHours.end}
        biasFallback={RHYTHM_DEFAULT.quietHours.sleepBias}
        onChange={(field, val) => patch((o) => setPath(o, ["rhythm", "quietHours", field], val))}
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
  description,
  hours,
  startFallback,
  endFallback,
  biasFallback,
  onChange,
}: {
  title: string;
  description: string;
  hours: Record<string, unknown>;
  startFallback: string;
  endFallback: string;
  biasFallback: string;
  onChange: (field: "start" | "end" | "sleepBias", value: string) => void;
}) {
  return (
    <SettingRow
      title={title}
      description={description}
      align="start"
      control={
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <TextField
              value={asStr(hours.start, startFallback)}
              ariaLabel={`${title}开始`}
              className="w-[76px] text-center"
              onCommit={(v) => onChange("start", v.trim())}
            />
            <span className="text-text-faint">–</span>
            <TextField
              value={asStr(hours.end, endFallback)}
              ariaLabel={`${title}结束`}
              className="w-[76px] text-center"
              onCommit={(v) => onChange("end", v.trim())}
            />
          </div>
          <SettingsSelect
            value={asStr(hours.sleepBias, biasFallback)}
            options={BIAS_OPTIONS}
            onChange={(v) => onChange("sleepBias", v)}
            ariaLabel={`${title}睡眠倾向`}
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
      a.push({ path: "", watch: false });
      o.paths = a;
    });
  };

  return (
    <SettingGroup title="可访问路径">
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <p className="text-[12px] leading-relaxed text-text-faint">
          Kairos 仅能读写这里声明的路径；「巡检」开启后每次唤醒前对该路径做变化检测。新增前请确认不会暴露敏感目录。
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
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-text-faint">
                      巡检
                      <Toggle
                        checked={asBool(item.watch, false)}
                        ariaLabel={`路径 ${i + 1} 巡检`}
                        onChange={(next) =>
                          patch((o) => {
                            const a = asArr(o.paths);
                            const it = asObj(a[i]);
                            it.watch = next;
                            a[i] = it;
                            o.paths = a;
                          })
                        }
                      />
                    </span>
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
