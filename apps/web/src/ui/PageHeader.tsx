import type { ReactNode } from "react";
import { GlassPill } from "./GlassPill";
import { IconButton } from "./IconButton";

/** 顶栏左右的 36px 玻璃圆钮。 */
export function HeaderButton({ label, onClick, children }: { readonly label: string; readonly onClick: () => void; readonly children: ReactNode }) {
  return <GlassPill className="rounded-full"><IconButton label={label} size="md" onClick={onClick}>{children}</IconButton></GlassPill>;
}

/**
 * 玻璃顶栏：左钮 · 标题胶囊（标题 + 一行小字）· 右钮，相对所在栏绝对定位，下方渐隐。
 * 左右不给时留出同宽空位，标题保持居中。
 */
export function PageHeader({ title, sub, left, right }: { readonly title: ReactNode; readonly sub?: ReactNode; readonly left?: ReactNode; readonly right?: ReactNode }) {
  return (
    <>
      <div aria-hidden className="fade-top pointer-events-none absolute inset-x-0 top-0 z-1 h-[calc(env(safe-area-inset-top)+66px)]" />
      <header className="absolute inset-x-0 top-0 z-2 grid h-[calc(env(safe-area-inset-top)+50px)] grid-cols-[48px_minmax(0,1fr)_48px] items-center px-2 pt-[env(safe-area-inset-top)]">
        <div className="justify-self-start">{left}</div>
        <GlassPill className="flex h-9 min-w-0 max-w-[250px] flex-col items-center justify-center justify-self-center rounded-act-pill px-3.5">
          <b className="max-w-full truncate text-act-base font-semibold leading-5">{title}</b>
          {sub ? <span className="flex max-w-full items-center gap-1 text-act-xxs leading-[14px] text-text-faint">{sub}</span> : null}
        </GlassPill>
        <div className="justify-self-end">{right}</div>
      </header>
    </>
  );
}
