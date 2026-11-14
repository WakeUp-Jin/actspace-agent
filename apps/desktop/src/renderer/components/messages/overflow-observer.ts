/**
 * 所有工具行共用一个 ResizeObserver 和一个 window resize 监听。
 * 每行各建一个 observer / 监听会让长会话里的行数线性放大，窗口缩放时整串回调同时触发。
 */
const callbacks = new Map<Element, Set<() => void>>();
let observer: ResizeObserver | null = null;
let windowListening = false;

function notify(element: Element): void {
  for (const callback of [...(callbacks.get(element) ?? [])]) callback();
}

function onWindowResize(): void {
  for (const element of [...callbacks.keys()]) notify(element);
}

/** 观察元素尺寸变化（以及窗口缩放）；返回取消函数。 */
export function observeOverflow(element: Element, callback: () => void): () => void {
  let set = callbacks.get(element);
  if (!set) {
    set = new Set();
    callbacks.set(element, set);
    if (typeof ResizeObserver !== "undefined") {
      observer ??= new ResizeObserver((entries) => {
        for (const entry of entries) notify(entry.target);
      });
      observer.observe(element);
    }
  }
  set.add(callback);
  if (!windowListening && typeof window !== "undefined") {
    window.addEventListener("resize", onWindowResize);
    windowListening = true;
  }
  return () => {
    const current = callbacks.get(element);
    if (!current) return;
    current.delete(callback);
    if (current.size > 0) return;
    callbacks.delete(element);
    observer?.unobserve(element);
    if (callbacks.size === 0) {
      observer?.disconnect();
      observer = null;
      if (windowListening) {
        window.removeEventListener("resize", onWindowResize);
        windowListening = false;
      }
    }
  };
}

/** 测试用：当前被观察的元素数。 */
export function observedOverflowCount(): number {
  return callbacks.size;
}
