import type { ReactNode } from "react";

/**
 * 窄屏只渲染当前页面；宽屏左栏 360px 放列表，右栏放详情（front-web-pwa客户端规范 §7）。
 * 每个栏都是 relative 的满高容器：页面的玻璃顶栏、底部输入坞相对栏定位，而不是相对视口。
 */
export function Layout({ wide, list, detail, overlay }: { readonly wide: boolean; readonly list: ReactNode; readonly detail: ReactNode; readonly overlay?: ReactNode }) {
  if (!wide) {
    return (
      <div className="relative mx-auto h-dvh w-full max-w-[720px] overflow-hidden">
        {detail ?? list}
        {overlay}
      </div>
    );
  }
  return (
    <div className="is-wide grid h-dvh grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
      <aside className="pane-sidebar relative h-full overflow-hidden border-r border-line bg-sidebar">{list}</aside>
      <main className="relative h-full overflow-hidden">
        {detail}
        {overlay}
      </main>
    </div>
  );
}

export function EmptyDetail() {
  return <div className="grid h-full place-items-center px-6 text-center text-act-md text-text-faint">选择左侧的会话，或在左下角新建</div>;
}
