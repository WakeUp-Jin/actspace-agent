import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { MessageBlock, TodoItem } from "@actspace/shared";

type TodoMessage = Extract<MessageBlock, { kind: "todo" }>;

const SHELL_CLASS =
  "min-w-0 overflow-hidden rounded-act-md border border-line bg-surface text-sm text-text-main";
const ATTACHED_SHELL_CLASS =
  "min-w-0 overflow-hidden border-t border-line bg-transparent text-sm text-text-main";
const HEADER_CLASS =
  "flex min-h-9 w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--act-color-focus-ring)]";
const LIST_CLASS = "border-t border-line/80 px-3 py-1";
const ATTACHED_LIST_CLASS = "px-3 py-1";
const ITEM_CLASS = "grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-2 py-1";

export function TodoListBlock({
  message,
  className,
  attached = false,
}: {
  message: TodoMessage;
  className?: string;
  attached?: boolean;
}) {
  const allCompleted = message.totalCount > 0 && message.completedCount === message.totalCount;
  const shouldStartExpanded = message.status === "running" || !allCompleted;
  const [expanded, setExpanded] = useState(shouldStartExpanded);
  const summaryText = `${message.completedCount} of ${message.totalCount} To-dos Completed`;

  useEffect(() => {
    if (message.status === "running") setExpanded(true);
  }, [message.status]);

  return (
    <section
      className={`${attached ? ATTACHED_SHELL_CLASS : SHELL_CLASS}${className ? ` ${className}` : ""}`}
      aria-label="Agent Todo list"
      data-status={message.status}
    >
      <button
        type="button"
        className={HEADER_CLASS}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <ChevronDown className="shrink-0 text-text-faint" size={15} aria-hidden="true" />
        ) : (
          <ChevronRight className="shrink-0 text-text-faint" size={15} aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-text-muted">{summaryText}</span>
        {message.status === "failed" ? (
          <AlertCircle className="shrink-0 text-danger" size={15} aria-label="Todo update failed" />
        ) : null}
      </button>
      {expanded && message.todos.length > 0 ? (
        <ol className={attached ? ATTACHED_LIST_CLASS : LIST_CLASS}>
          {message.todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
        </ol>
      ) : null}
    </section>
  );
}

function TodoRow({ todo }: { todo: TodoItem }) {
  const completed = todo.status === "completed";
  const inProgress = todo.status === "in_progress";
  const Icon = completed ? CheckCircle2 : inProgress ? Loader2 : Circle;
  const iconClass = completed
    ? "text-text-faint"
    : inProgress ? "text-operational" : "text-text-faint";
  const contentClass = completed
    ? "break-words leading-5 text-text-faint line-through"
    : "break-words leading-5 text-text-main";

  return (
    <li
      className={ITEM_CLASS}
      data-todo-status={todo.status}
      aria-label={`${todoStatusLabel(todo.status)}: ${todo.content}`}
    >
      <Icon
        className={`mt-0.5 shrink-0 ${iconClass}${inProgress ? " animate-spin motion-reduce:animate-none" : ""}`}
        size={15}
        strokeWidth={1.9}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className={contentClass}>{todo.content}</p>
        {inProgress && todo.activeForm ? (
          <p className="mt-0.5 break-words text-xs leading-4 text-text-faint">{todo.activeForm}</p>
        ) : null}
      </div>
    </li>
  );
}

function todoStatusLabel(status: TodoItem["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Pending";
}
