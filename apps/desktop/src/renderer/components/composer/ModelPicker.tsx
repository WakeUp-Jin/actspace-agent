import { Check, ChevronDown, Search } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ModelSelectionId } from "@actspace/shared";
import type { CatalogModel, ModelCatalog, ModelCatalogGroup } from "../../target/use-model-catalog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { Button } from "../ui/Button";
import {
  currentModelRuntimeOptions,
  isModelEditable,
  modelReasoningEfforts,
  reasoningEffortLabel,
  type ComposerModelOption,
  type ComposerModelRuntimeOptions,
} from "./model-options";

const MODEL_BUTTON_CLASS =
  "model-button inline-flex h-8 max-w-[220px] items-center gap-[6px] rounded-full border-0 bg-transparent px-1.5 text-act-md leading-5 font-medium text-text-muted transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main max-[600px]:max-w-[210px]";
const MODEL_BUTTON_TEXT_CLASS = "model-button-text truncate";
// 模型菜单维持 Cursor 式紧凑单列：主菜单只负责选择，Options 作为贴行的轻量二级浮层。
// 外框（边框、背景、阴影、层级）来自 ui/Popover；滚动放在里面一层，Options 浮层才能伸到外框之外。
const MODEL_MENU_BASE_CLASS =
  "model-menu relative w-[244px] transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none";
// 展开动画从贴着按钮的那个角缩放出来。
const MODEL_MENU_ORIGIN_CLASS = {
  top: { start: "origin-bottom-left", end: "origin-bottom-right" },
  bottom: { start: "origin-top-left", end: "origin-top-right" },
} as const;
const MODEL_MENU_SCROLL_CLASS ="max-h-[290px] overflow-y-auto rounded-act-lg p-1";
const MODEL_SEARCH_WRAP_CLASS =
  "sticky top-0 z-10 flex h-9 items-center gap-2 rounded-act-md bg-surface-raised px-2 text-text-faint";
const MODEL_SEARCH_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-act-sm leading-5 text-text-main outline-none placeholder:text-text-subtle";
const MODEL_SEARCH_EMPTY_CLASS = "px-2.5 py-6 text-center text-act-sm text-text-faint";
const MODEL_PROVIDER_GROUP_CLASS = "model-provider-group";
const MODEL_PROVIDER_LABEL_CLASS =
  "model-provider-label px-2 pb-1 pt-2 text-act-xxs font-semibold leading-4 text-text-faint";
const MODEL_MENU_ROW_CLASS =
  "model-menu-row relative flex min-h-[34px] items-center rounded-act-md transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-within:bg-selected";
const MODEL_MENU_ROW_SELECTED_CLASS = "is-selected-row";
const MODEL_SELECT_BUTTON_CLASS =
  "model-select-button flex min-h-[34px] min-w-0 flex-1 items-center justify-start rounded-act-md border-0 bg-transparent px-2 py-1.5 pr-[46px] text-left text-act-md font-normal leading-5 text-text-main";
const MODEL_SELECT_BUTTON_SELECTED_CLASS = "pr-[58px]";
const MODEL_ROW_ACTIONS_CLASS =
  "model-row-actions absolute right-2 flex h-full min-w-[34px] items-center justify-end gap-1";
const MODEL_ROW_ACTIONS_SELECTED_CLASS = "min-w-[50px]";
const MODEL_EDIT_BUTTON_CLASS =
  "model-edit-button h-6 min-w-[34px] justify-center rounded-act-sm border-0 bg-transparent px-1.5 text-act-xxs font-medium text-text-muted transition-[opacity,background,color] duration-(--motion-fast) ease-in-out focus-visible:bg-selected focus-visible:outline-none hover:bg-selected hover:text-text-main";
const MODEL_CHECK_ICON_CLASS = "model-check-icon text-text-main";
const MODEL_OPTIONS_MENU_BASE_CLASS =
  "model-options-menu absolute z-40 w-[210px] rounded-xl border border-line bg-surface-raised/96 p-1 shadow-act-popover transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none";
const MODEL_OPTIONS_WIDTH_PX = 210;
const MODEL_OPTIONS_GAP_PX = 8;
const MODEL_OPTIONS_ESTIMATED_HEIGHT_PX = 292;
const DROPDOWN_LABEL_CLASS = "dropdown-label px-2 pb-1 pt-1.5 text-act-xxs font-medium text-text-faint";
const OPTION_SEPARATOR_CLASS = "mx-1 my-1 h-px bg-line";
const OPTION_TOGGLE_ROW_CLASS =
  "option-toggle-row flex min-h-[34px] cursor-pointer items-center gap-2 rounded-act-md px-2 py-1.5 text-act-md text-text-main hover:bg-hover-overlay";
const OPTION_TOGGLE_LABEL_CLASS = "flex-1";
const OPTION_TOGGLE_INPUT_CLASS = "absolute opacity-0 pointer-events-none";
// 注意：track 的底色不写进基类，由 on/off 分支二选一给出，避免同属性 utility 互相覆盖。
const TOGGLE_TRACK_CLASS =
  "toggle-track relative inline-flex h-5 w-8 rounded-full transition-colors duration-(--motion-fast) ease-in-out";
const TOGGLE_TRACK_ON_CLASS = "bg-toggle-on";
const TOGGLE_TRACK_OFF_CLASS = "bg-line";
const TOGGLE_THUMB_CLASS =
  "toggle-thumb absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-act-knob transition-transform duration-(--motion-fast) ease-in-out";
const TOGGLE_THUMB_ON_CLASS = "translate-x-3";
const OPTION_EMPTY_CLASS = "px-2.5 py-2 text-act-md leading-5 text-text-faint";
const OPTION_CHOICE_CLASS =
  "flex min-h-[32px] w-full items-center rounded-act-md border-0 bg-transparent px-2 text-left text-act-sm text-text-main transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const OPTION_CHOICE_LABEL_CLASS = "flex-1 capitalize";

/** 本机模型的运行时选项（Thinking、推理强度）；远端模型没有，不显示「编辑」。 */
export type ModelPickerOptions = {
  find: (modelId: string) => ComposerModelOption | undefined;
  /** 各模型已保存的选项；没有的按模型默认值显示。 */
  values: Partial<Record<ModelSelectionId, ComposerModelRuntimeOptions>>;
  onChange: (
    modelId: ModelSelectionId,
    update: (current: ComposerModelRuntimeOptions) => ComposerModelRuntimeOptions,
  ) => void;
};

type ModelListProps = {
  /** 15 的 `useModelCatalog`：本机按供应商 / 连接分组，远端一个以 Host 命名的分组。 */
  catalog: ModelCatalog;
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  options?: ModelPickerOptions;
};

export type ModelPickerMenuProps = ModelListProps & {
  /** 浮层相对按钮的位置；输入框在底部所以默认向上展开。 */
  side?: "top" | "bottom";
  align?: "start" | "end";
  ariaLabel?: string;
  /** 列在分组之前、不属于任何供应商的项（例如设置里的「未配置」）；搜索时隐藏。 */
  pinned?: readonly CatalogModel[];
};

export type ModelPickerProps = ModelListProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 模型按钮上的文字和悬停说明（同名模型的消歧由调用方算好）。 */
  triggerLabel: string;
  triggerTitle: string;
  disabled?: boolean;
};

function normalizeLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

/** 搜索匹配模型名、模型 id（本机的 id 以供应商 id 开头）、详情（本机是 API 模型名）和分组名；空分组去掉。 */
function filterModelGroups(catalog: ModelCatalog, query: string): ModelCatalogGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return catalog.groups
    .map((group) => ({
      ...group,
      models: normalizedQuery
        ? group.models.filter((model) =>
            [model.label, model.id, model.detail ?? "", group.label]
              .some((text) => text.toLocaleLowerCase().includes(normalizedQuery)))
        : group.models,
    }))
    .filter((group) => group.models.length > 0);
}

/** 列表为空时的提示：远端还没拿到模型时说明在等 Host。 */
function modelListEmptyText(catalog: ModelCatalog): string {
  const totalModels = catalog.groups.reduce((count, group) => count + group.models.length, 0);
  return totalModels === 0 && catalog.source === "host" ? "等待 Host 模型" : "没有匹配的模型。";
}

/** 同一分组里有同名模型时，第二行显示详情区分。 */
function showModelDetail(group: ModelCatalogGroup, spec: CatalogModel): boolean {
  return Boolean(spec.detail) && group.models.filter((model) => normalizeLabel(model.label) === normalizeLabel(spec.label)).length > 1;
}

/**
 * 输入框工具行的模型选择：按钮打开一个浮层，里面是搜索、按供应商分组的模型列表，
 * 行上的「编辑」打开贴着这一行的 Options（Thinking、推理强度）。
 */
export function ModelPicker({ open, onOpenChange, triggerLabel, triggerTitle, disabled, ...list }: ModelPickerProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className={MODEL_BUTTON_CLASS} type="button" disabled={disabled}>
          <span className={MODEL_BUTTON_TEXT_CLASS} title={triggerTitle}>{triggerLabel}</span>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      {open ? <ModelPickerMenu {...list} /> : null}
    </Popover>
  );
}

// 只在打开时挂载：搜索词、正在编辑的模型这些状态随浮层关闭一起丢掉。
// 设置页的模型下拉也复用这个菜单，外面自己包 Popover 和触发器。
export function ModelPickerMenu({
  catalog, selectedModelId, onSelect, options, side = "top", align = "start", ariaLabel = "模型", pinned = [],
}: ModelPickerMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [focusedModelId, setFocusedModelId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [optionsOffset, setOptionsOffset] = useState(0);
  const [optionsSide, setOptionsSide] = useState<"left" | "right">("right");
  const [menuEntered, setMenuEntered] = useState(false);
  const [optionsEntered, setOptionsEntered] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    const handle = window.requestAnimationFrame(() => setMenuEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, []);

  useLayoutEffect(() => {
    setOptionsEntered(false);
    if (editingModelId === null) return;
    const handle = window.requestAnimationFrame(() => setOptionsEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, [editingModelId]);

  const filteredGroups = filterModelGroups(catalog, searchQuery);
  const emptyText = modelListEmptyText(catalog);
  const editingSpec = editingModelId === null ? undefined : options?.find(editingModelId);
  const pinnedRows = searchQuery.trim() ? [] : pinned;
  const originClass = MODEL_MENU_ORIGIN_CLASS[side][align];

  const menuMotionClass = menuEntered
    ? "translate-y-0 scale-100 opacity-100"
    : "pointer-events-none translate-y-1 scale-[0.985] opacity-0";
  const optionsMotionClass = optionsEntered
    ? "translate-x-0 opacity-100"
    : optionsSide === "left"
      ? "pointer-events-none translate-x-1 opacity-0"
      : "pointer-events-none -translate-x-1 opacity-0";
  const optionsMenuClass = `${MODEL_OPTIONS_MENU_BASE_CLASS} ${optionsMotionClass} ${
    optionsSide === "left" ? "right-[calc(100%_+_8px)]" : "left-[calc(100%_+_8px)]"
  }`;

  return (
    <PopoverContent
      ref={menuRef}
      className={`${MODEL_MENU_BASE_CLASS} ${menuMotionClass} ${originClass}`}
      radius="lg"
      side={side}
      align={align}
      sideOffset={8}
      role="menu"
      aria-label={ariaLabel}
      data-composer-floating=""
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        searchInputRef.current?.focus();
      }}
    >
      <div className={MODEL_MENU_SCROLL_CLASS} ref={scrollRef} onScroll={() => setEditingModelId(null)}>
        <label className={MODEL_SEARCH_WRAP_CLASS}>
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          <input
            ref={searchInputRef}
            className={MODEL_SEARCH_INPUT_CLASS}
            type="search"
            value={searchQuery}
            placeholder="搜索模型"
            aria-label="搜索模型"
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setEditingModelId(null);
            }}
          />
        </label>
        {pinnedRows.map((spec) => {
          const selected = spec.id === selectedModelId;
          return (
            <div className={`${MODEL_MENU_ROW_CLASS} ${selected ? MODEL_MENU_ROW_SELECTED_CLASS : ""}`} key={`pinned:${spec.id}`}>
              <Button
                variant="ghost"
                className={`model-select-button min-w-0 flex-1 justify-start text-left ${selected ? "pr-[58px]" : "pr-[46px]"}`}
                onClick={() => onSelect(spec.id)}
              >
                <span className="block min-w-0 truncate">{spec.label}</span>
              </Button>
              <div className={`${MODEL_ROW_ACTIONS_CLASS} ${selected ? MODEL_ROW_ACTIONS_SELECTED_CLASS : ""}`}>
                {selected ? <Check className={MODEL_CHECK_ICON_CLASS} size={14} strokeWidth={2.2} /> : null}
              </div>
            </div>
          );
        })}
        {filteredGroups.map((group) => (
          <div
            className={MODEL_PROVIDER_GROUP_CLASS}
            key={group.key}
            role="group"
            aria-label={group.label}
          >
            <div className={MODEL_PROVIDER_LABEL_CLASS}>{group.label}</div>
            {group.models.map((spec) => {
              const selected = spec.id === selectedModelId;
              const showEdit = hoveredModelId === spec.id || focusedModelId === spec.id || editingModelId === spec.id;
              const showDetail = showModelDetail(group, spec);
              const editable = options?.find(spec.id);
              const enter = () => setHoveredModelId(spec.id);
              const leave = () => setHoveredModelId((currentId) => (currentId === spec.id ? null : currentId));
              return (
                <div
                  className={`${MODEL_MENU_ROW_CLASS} ${selected ? MODEL_MENU_ROW_SELECTED_CLASS : ""}`}
                  key={spec.id}
                  onPointerEnter={enter}
                  onPointerOver={enter}
                  onPointerLeave={leave}
                  onMouseEnter={enter}
                  onMouseOver={enter}
                  onMouseLeave={leave}
                  onFocusCapture={() => setFocusedModelId(spec.id)}
                  onBlurCapture={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                      setFocusedModelId((currentId) => (currentId === spec.id ? null : currentId));
                    }
                  }}
                >
                  <button
                    type="button"
                    className={`${MODEL_SELECT_BUTTON_CLASS} ${selected ? MODEL_SELECT_BUTTON_SELECTED_CLASS : ""}`}
                    onClick={() => onSelect(spec.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{spec.label}</span>
                      {showDetail ? (
                        <span className="block truncate font-mono text-act-xxs leading-3 text-text-faint">
                          {spec.detail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div className={`${MODEL_ROW_ACTIONS_CLASS} ${selected ? MODEL_ROW_ACTIONS_SELECTED_CLASS : ""}`}>
                    {editable && isModelEditable(editable) ? (
                      <button
                        type="button"
                        className={MODEL_EDIT_BUTTON_CLASS}
                        aria-label={`编辑 ${spec.id} 选项`}
                        style={{ opacity: showEdit ? 1 : 0 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          const row = event.currentTarget.closest<HTMLElement>(".model-menu-row");
                          const menu = menuRef.current;
                          const scroller = scrollRef.current;
                          if (row && menu && scroller) {
                            const rowOffset = Math.max(0, row.offsetTop - scroller.scrollTop);
                            const maxOffset = Math.max(0, scroller.clientHeight - MODEL_OPTIONS_ESTIMATED_HEIGHT_PX);
                            setOptionsOffset(Math.min(rowOffset, maxOffset));
                            // 右边放不下 Options 时放到左边。
                            const roomOnRight = window.innerWidth - menu.getBoundingClientRect().right;
                            setOptionsSide(roomOnRight < MODEL_OPTIONS_WIDTH_PX + MODEL_OPTIONS_GAP_PX * 2 ? "left" : "right");
                          }
                          setEditingModelId(spec.id);
                        }}
                      >
                        编辑
                      </button>
                    ) : null}
                    {selected ? <Check className={MODEL_CHECK_ICON_CLASS} size={14} strokeWidth={2.2} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {filteredGroups.length === 0 ? <div className={MODEL_SEARCH_EMPTY_CLASS}>{emptyText}</div> : null}
      </div>
      {editingSpec && options ? (
        <div className={optionsMenuClass} style={{ top: `${optionsOffset}px` }}>
          <ModelOptionsBody spec={editingSpec} options={options} />
        </div>
      ) : null}
    </PopoverContent>
  );
}

/** Options 的内容（Thinking、推理强度）：模型按钮浮层里贴行显示。 */
function ModelOptionsBody({ spec, options }: { spec: ComposerModelOption; options: ModelPickerOptions }) {
  const current = currentModelRuntimeOptions(spec, options.values[spec.id]);
  const efforts = modelReasoningEfforts(spec);
  return (
    <>
      <div className={DROPDOWN_LABEL_CLASS}>选项</div>
      {spec.supportsThinkingToggle ? (
        <label className={OPTION_TOGGLE_ROW_CLASS}>
          <span className={OPTION_TOGGLE_LABEL_CLASS}>Thinking</span>
          <input
            className={OPTION_TOGGLE_INPUT_CLASS}
            type="checkbox"
            checked={current.thinkingEnabled}
            onChange={(event) => {
              const checked = event.target.checked;
              options.onChange(spec.id, (previous) => ({ ...previous, thinkingEnabled: checked }));
            }}
            aria-label={`${spec.id} Thinking`}
          />
          <span
            className={`${TOGGLE_TRACK_CLASS} ${current.thinkingEnabled ? TOGGLE_TRACK_ON_CLASS : TOGGLE_TRACK_OFF_CLASS}`}
            aria-hidden="true"
          >
            <span className={`${TOGGLE_THUMB_CLASS}${current.thinkingEnabled ? ` ${TOGGLE_THUMB_ON_CLASS}` : ""}`} />
          </span>
        </label>
      ) : spec.reasoningMandatory ? (
        <div className="px-2 py-1.5 text-act-sm text-text-muted">此模型始终启用 Thinking。</div>
      ) : null}
      {efforts.length > 0 ? (
        <>
          {(spec.supportsThinkingToggle || spec.reasoningMandatory) ? (
            <div className={OPTION_SEPARATOR_CLASS} />
          ) : null}
          <div className={DROPDOWN_LABEL_CLASS}>Effort</div>
          {spec.provider !== "deepseek" ? (
            <button
              type="button"
              className={OPTION_CHOICE_CLASS}
              disabled={!current.thinkingEnabled}
              onClick={() => options.onChange(spec.id, (previous) => ({ thinkingEnabled: previous.thinkingEnabled }))}
            >
              <span className={OPTION_CHOICE_LABEL_CLASS}>Auto</span>
              {!current.reasoningEffort ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
            </button>
          ) : null}
          {efforts.map((effort) => (
            <button
              type="button"
              className={OPTION_CHOICE_CLASS}
              disabled={!current.thinkingEnabled}
              key={effort}
              onClick={() => options.onChange(spec.id, (previous) => ({ ...previous, reasoningEffort: effort }))}
            >
              <span className={OPTION_CHOICE_LABEL_CLASS}>{reasoningEffortLabel(effort)}</span>
              {current.reasoningEffort === effort ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
            </button>
          ))}
        </>
      ) : !spec.supportsThinkingToggle && !spec.reasoningMandatory ? (
        <div className={OPTION_EMPTY_CLASS}>暂无其他选项。</div>
      ) : null}
    </>
  );
}
