import type { ReactNode } from "react";

/** 右栏内容区的空态：图标 + 一两句话 */
export function PanelEmpty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-act-xs leading-[1.6] text-text-faint">
      <span className="flex opacity-70" aria-hidden="true">{icon}</span>
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}
