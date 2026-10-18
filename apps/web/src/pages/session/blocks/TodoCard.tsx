import { Check } from "lucide-react";
import type { TodoItem } from "@actspace/shared";

export function TodoCard({ todos, completedCount }: { readonly todos: readonly TodoItem[]; readonly completedCount: number }) {
  return (
    <div className="tool-card px-3 py-2.5">
      <div className="mb-1.5 text-act-sm text-text-faint">任务清单 <span className="tabular-nums">{completedCount}/{todos.length}</span></div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {todos.map(todo => (
          <li key={todo.id} className="flex items-start gap-2.5 text-act-md leading-[22px]">
            <span className="todo-box mt-[3px]" data-state={todo.status}>{todo.status === "completed" ? <Check size={11} strokeWidth={3} aria-hidden /> : null}</span>
            <span className={todo.status === "completed" ? "text-text-faint line-through" : todo.status === "in_progress" ? "text-text-main" : "text-text-muted"}>{todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
