import { ListOrdered, Trash2 } from "lucide-react";
import type { QueuedMessage } from "../../sessions/composer-state";
import { IconButton } from "../../ui/IconButton";

/** 输入框上沿的排队托盘：本轮结束后按顺序发送，可撤回。 */
export function QueueTray({ items, onCancel }: { readonly items: readonly QueuedMessage[]; readonly onCancel: (taskId: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="queue-tray anim-rise" aria-label="排队中的消息">
      {items.map(item => (
        <div key={item.taskId} className="queue-row">
          <ListOrdered size={14} aria-hidden className="flex-none text-text-faint" />
          <span className="min-w-0 flex-1 truncate" title={item.text}>{item.text}</span>
          <IconButton label="撤回" size="sm" tone="faint" onClick={() => onCancel(item.taskId)}><Trash2 size={14} aria-hidden /></IconButton>
        </div>
      ))}
    </div>
  );
}
