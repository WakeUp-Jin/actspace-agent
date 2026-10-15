import type { TrajectoryCell } from "./contract";
import { TAB_LABEL } from "./strings";

/** Detail tab ids; labels come from `TAB_LABEL` except where a kind relabels one. */
export type DetailTab = "overview" | "preview" | "raw" | "source" | "payload" | "result" | "schema" | "timing" | "diff" | "systemPrompt" | "tools" | "options" | "usage";
export type DetailTabItem = { readonly id: DetailTab; readonly label: string };

const tab = (id: DetailTab, label: string = TAB_LABEL[id as keyof typeof TAB_LABEL]): DetailTabItem => ({ id, label });

export const isMarkdownCell = (cell: TrajectoryCell) => cell.kind === "user" || cell.kind === "context" || cell.kind === "message";
export const toolInput = (cell: TrajectoryCell) => cell.record.toolArguments ?? cell.record.inputDetail ?? null;
export const toolOutput = (cell: TrajectoryCell) => cell.record.resultRaw ?? cell.record.outputDetail ?? cell.record.result ?? null;

/** DSH 按类型和字段是否存在决定页签。 */
export function detailTabs(cell: TrajectoryCell): readonly DetailTabItem[] {
  if (cell.kind === "system") return [...(cell.record.previousPromptDetail ? [tab("diff")] : []), tab("systemPrompt"), tab("tools")];
  if (cell.kind === "compacted") return [tab("overview"), tab("raw", TAB_LABEL.rawOutput)];
  if (isMarkdownCell(cell)) return [tab("overview"), tab("preview"), tab("raw"), ...(cell.record.messageSource == null ? [] : [tab("source")])];
  return [
    tab("overview"),
    ...(toolInput(cell) == null ? [] : [tab("payload")]),
    ...(toolOutput(cell) == null ? [] : [tab("result")]),
    tab("schema"),
    tab("timing"),
  ];
}

export const REQUEST_TABS: readonly DetailTabItem[] = [tab("overview"), tab("options"), tab("usage"), tab("timing")];
/** 请求页签：没有记录选项时不出现「选项」。 */
export const requestTabs = (request: { readonly options?: unknown }): readonly DetailTabItem[] =>
  REQUEST_TABS.filter(item => item.id !== "options" || request.options != null);

/** The most recently activated tab that this selection offers, else its first tab. */
export function pickTab(tabs: readonly DetailTabItem[], history: readonly DetailTab[]): DetailTab {
  const available = new Set(tabs.map(item => item.id));
  return [...history].reverse().find(id => available.has(id)) ?? tabs[0]?.id ?? "overview";
}
