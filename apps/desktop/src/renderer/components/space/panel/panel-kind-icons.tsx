import { BookOpen, Brain, Eye, File, FolderTree, GitBranch, MessageSquare, SquareTerminal, Users, type LucideIcon } from "lucide-react";
import type { PanelKind } from "../model/types";

// 右栏标签种类的图标。和普通会话右栏对得上的种类（子 Agent、文件、Review、上下文、终端、可视化回复）用同一个图标。
const ICONS: Record<PanelKind, LucideIcon> = {
  actors: Users,
  library: BookOpen,
  memory: Brain,
  files: FolderTree,
  terminal: SquareTerminal,
  subagents: MessageSquare,
  review: GitBranch,
  context: Eye,
  reply: MessageSquare,
  file: File,
};

export function PanelKindIcon({ kind, size = 15 }: { kind: PanelKind; size?: number }) {
  const Icon = ICONS[kind];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
