import { useRef, useState, type KeyboardEvent } from "react";
import { SectionShell, SettingGroup, SettingRow, SettingsSelect, Stepper, type SelectOption } from "../SettingsPrimitives";
import { ACCENT_PALETTES } from "../../../appearance/accents";
import { CODE_FONT_PRESETS, UI_FONT_PRESETS } from "../../../appearance/fonts";
import { applyAppearance } from "../../../appearance/apply";
import { loadAppearance, saveAppearance } from "../../../appearance/storage";
import { CODE_FONT_SIZE_MAX, CODE_FONT_SIZE_MIN, CODE_FONT_SIZE_STEP, DEFAULT_APPEARANCE, UI_FONT_SIZE_MAX, UI_FONT_SIZE_MIN, UI_FONT_SIZE_STEP, type AccentPaletteId, type AppearancePrefs, type CodeFontId, type ThemeMode, type UiFontId } from "../../../appearance/types";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

const PREVIEW_PALETTE = {
  light: {
    bg: "bg-[var(--act-preview-light-bg)]",
    sidebar: "bg-[var(--act-preview-light-sidebar)]",
    line: "bg-[var(--act-preview-light-line)]",
    ink: "bg-[var(--act-preview-light-ink)]",
  },
  dark: {
    bg: "bg-[var(--act-preview-dark-bg)]",
    sidebar: "bg-[var(--act-preview-dark-sidebar)]",
    line: "bg-[var(--act-preview-dark-line)]",
    ink: "bg-[var(--act-preview-dark-ink)]",
  },
} as const;

function ThemeMiniWindow({ tone, className = "" }: { tone: "light" | "dark"; className?: string }) {
  const palette = PREVIEW_PALETTE[tone];
  return (
    <span aria-hidden="true" className={`absolute inset-0 flex ${palette.bg} ${className}`}>
      <span className={`flex w-[30%] flex-col gap-[5px] px-1.5 py-2.5 ${palette.sidebar}`}>
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-2.5 py-3">
        <i className={`block h-[5px] w-1/2 rounded-full ${palette.ink}`} />
        <i className={`block h-[5px] rounded-full ${palette.line}`} />
        <i className={`block h-[5px] w-[70%] rounded-full ${palette.line}`} />
      </span>
    </span>
  );
}

function ThemeTiles({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  return (
    <div role="radiogroup" aria-label="主题" className="grid grid-cols-3 gap-3 max-[600px]:gap-2">
      {THEME_OPTIONS.map(({ value: optionValue, label }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => onChange(optionValue)}
            className="group rounded-act-group text-left focus-visible:outline-none"
          >
            <span
              className={`relative block h-[84px] overflow-hidden rounded-act-md border transition-shadow duration-(--motion-base) group-focus-visible:ring-[3px] group-focus-visible:ring-focus-ring/20 ${
                selected ? "border-transparent ring-2 ring-text-main" : "border-line group-hover:border-line-strong"
              }`}
            >
              {optionValue === "system" ? (
                <>
                  <ThemeMiniWindow tone="light" />
                  <ThemeMiniWindow tone="dark" className="[clip-path:polygon(55%_0,100%_0,100%_100%,45%_100%)]" />
                </>
              ) : (
                <ThemeMiniWindow tone={optionValue} />
              )}
            </span>
            <span className={`mt-2 block text-act-xs font-medium ${selected ? "text-text-main" : "text-text-muted"}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 强调色色样：固定预览色（--act-preview-accent-*），不随当前主题或当前选择翻转。 */
const ACCENT_SWATCH: Record<AccentPaletteId, string> = {
  default:
    "bg-[linear-gradient(135deg,var(--act-preview-accent-default-ink)_50%,var(--act-preview-accent-default-emerald)_50%)]",
  blue: "bg-[var(--act-preview-accent-blue)]",
  purple: "bg-[var(--act-preview-accent-purple)]",
  pink: "bg-[var(--act-preview-accent-pink)]",
  orange: "bg-[var(--act-preview-accent-orange)]",
};

const ACCENT_NAV_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function AccentPicker({ value, onChange }: { value: AccentPaletteId; onChange: (value: AccentPaletteId) => void }) {
  const optionRefs = useRef(new Map<AccentPaletteId, HTMLButtonElement>());

  // 单选组键盘约定：方向键在全部选项间循环移动并立即选中，Home / End 跳到首尾。
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = ACCENT_PALETTES.findIndex((palette) => palette.id === value);
    const count = ACCENT_PALETTES.length;
    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = count - 1;
    else if (event.key in ACCENT_NAV_STEP) nextIndex = (index + ACCENT_NAV_STEP[event.key] + count) % count;
    else return;
    event.preventDefault();
    const next = ACCENT_PALETTES[nextIndex].id;
    onChange(next);
    optionRefs.current.get(next)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="强调色" className="flex flex-wrap gap-2">
      {ACCENT_PALETTES.map((palette) => {
        const selected = value === palette.id;
        return (
          <button
            key={palette.id}
            ref={(node) => {
              if (node) optionRefs.current.set(palette.id, node);
              else optionRefs.current.delete(palette.id);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={palette.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(palette.id)}
            onKeyDown={handleKeyDown}
            className={`inline-flex h-8 items-center gap-2 rounded-act-pill border py-1 pr-3 pl-1.5 text-act-xs transition-[border-color,color,box-shadow] duration-(--motion-base) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              selected
                ? "border-transparent font-medium text-text-main ring-2 ring-text-main"
                : "border-line text-text-muted hover:border-line-strong hover:text-text-main"
            }`}
          >
            <span aria-hidden="true" className={`size-5 shrink-0 rounded-full ring-1 ring-line ring-inset ${ACCENT_SWATCH[palette.id]}`} />
            {palette.label}
          </button>
        );
      })}
    </div>
  );
}

const UI_FONT_OPTIONS: SelectOption[] = UI_FONT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));
const CODE_FONT_OPTIONS: SelectOption[] = CODE_FONT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export function AppearanceSection() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => loadAppearance());

  const update = (patch: Partial<AppearancePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveAppearance(next);
      applyAppearance(next);
      return next;
    });
  };

  return (
    <>
      <SectionShell title="主题" description="“跟随系统”会随 macOS 外观自动切换。">
        <ThemeTiles value={prefs.theme} onChange={(value) => update({ theme: value })} />
      </SectionShell>

      <SectionShell title="强调色" description="用于发送按钮、开关、焦点和链接；导航选中和状态颜色保持不变。">
        <AccentPicker value={prefs.accentPalette} onChange={(value) => update({ accentPalette: value })} />
      </SectionShell>

      <SettingGroup title="字体与字号" headingLevel={3}>
        <SettingRow
          title="界面字体"
          description="界面与 AI 回复正文。"
          control={
            <SettingsSelect
              size="sm"
              value={prefs.uiFontId}
              options={UI_FONT_OPTIONS}
              onChange={(value) => update({ uiFontId: value as UiFontId })}
              ariaLabel="界面字体"
            />
          }
        />
        <SettingRow
          title="界面字号"
          control={
            <Stepper
              value={prefs.uiFontSize}
              onChange={(value) => update({ uiFontSize: value })}
              min={UI_FONT_SIZE_MIN}
              max={UI_FONT_SIZE_MAX}
              step={UI_FONT_SIZE_STEP}
              format={(value) => `${value}px`}
              defaultValue={DEFAULT_APPEARANCE.uiFontSize}
              ariaLabel="界面字号"
            />
          }
        />
        <SettingRow
          title="代码字体"
          description="代码块、diff 与终端输出。"
          control={
            <SettingsSelect
              size="sm"
              value={prefs.codeFontId}
              options={CODE_FONT_OPTIONS}
              onChange={(value) => update({ codeFontId: value as CodeFontId })}
              ariaLabel="代码字体"
            />
          }
        />
        <SettingRow
          title="代码字号"
          control={
            <Stepper
              value={prefs.codeFontSize}
              onChange={(value) => update({ codeFontSize: value })}
              min={CODE_FONT_SIZE_MIN}
              max={CODE_FONT_SIZE_MAX}
              step={CODE_FONT_SIZE_STEP}
              format={(value) => `${value}px`}
              defaultValue={DEFAULT_APPEARANCE.codeFontSize}
              ariaLabel="代码字号"
            />
          }
        />
        <div aria-label="字体预览" className="px-4 py-4">
          <p className="leading-relaxed text-text-main" style={{ fontSize: prefs.uiFontSize }}>
            让想法清晰呈现。The quick brown fox jumps over the lazy dog. 0123456789
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-act-sm bg-surface-subtle px-3 py-2.5 font-mono text-text-muted" style={{ fontSize: prefs.codeFontSize }}>
            {'const greeting = "你好，ActSpace";'}
          </pre>
        </div>
      </SettingGroup>
    </>
  );
}
