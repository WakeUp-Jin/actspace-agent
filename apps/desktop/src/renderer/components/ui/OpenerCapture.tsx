import * as React from "react";

// 在浮层内容第一次渲染时（React 处理 autoFocus 之前）记下当时的焦点，供关闭后把焦点还回去。
// Dialog 和 Popover 在没有 Trigger 时用它兜底：项目里多数浮层是条件渲染的，Radix 只会把焦点还给 Trigger。
export function OpenerCapture({ target }: { target: React.MutableRefObject<HTMLElement | null> }) {
  const [origin] = React.useState(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  });
  React.useLayoutEffect(() => { target.current = origin; }, [origin, target]);
  return null;
}
