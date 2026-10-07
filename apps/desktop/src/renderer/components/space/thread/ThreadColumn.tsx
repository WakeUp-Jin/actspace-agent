import type { ReactNode } from "react";

/** 和现有会话同宽的中间列。 */
export function ThreadColumn({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] flex-col gap-3.5 pb-2 pt-5">
      {children}
    </div>
  );
}
