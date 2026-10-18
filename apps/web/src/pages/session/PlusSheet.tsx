import { Bot, ImagePlus, ListTodo, MessageCircle } from "lucide-react";
import type { AgentMode } from "../../sessions/use-composer";
import { Sheet, SheetGroupLabel, SheetOption, type OptionTone } from "../../ui/Sheet";

export const MODE_LABELS: Record<AgentMode, string> = { agent: "Agent", plan: "Plan", chat: "Chat" };
const MODES: readonly { readonly value: AgentMode; readonly detail: string; readonly tone: OptionTone; readonly icon: typeof Bot }[] = [
  { value: "agent", detail: "读写文件、运行命令，直接完成任务", tone: "plain", icon: Bot },
  { value: "plan", detail: "先出方案，确认后再动手", tone: "plan", icon: ListTodo },
  { value: "chat", detail: "只对话，不使用工具", tone: "chat", icon: MessageCircle },
];
export const MODE_ICONS: Record<AgentMode, typeof Bot> = { agent: Bot, plan: ListTodo, chat: MessageCircle };

export const isAgentMode = (value: string | null | undefined): value is AgentMode => value === "agent" || value === "plan" || value === "chat";

/** 输入框「＋」：选模式；附件入口先占位（后续版本）。 */
export function PlusSheet({ open, onOpenChange, mode, onPick }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly mode: AgentMode; readonly onPick: (mode: AgentMode) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="模式">
      <div role="radiogroup" aria-label="模式">
        {MODES.map(({ value, detail, tone, icon: Icon }) => (
          <SheetOption key={value} selected={mode === value} title={MODE_LABELS[value]} detail={detail} tone={tone} icon={<Icon size={17} />} onSelect={() => { onPick(value); onOpenChange(false); }} />
        ))}
      </div>
      <SheetGroupLabel>添加</SheetGroupLabel>
      <SheetOption selected={false} disabled title="图片或文件" detail="后续版本" icon={<ImagePlus size={17} />} onSelect={() => undefined} />
    </Sheet>
  );
}
