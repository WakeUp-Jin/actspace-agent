// 流式输出的高频更新按帧合并（参考 DSH 的 animation-frame publication）：
// 一帧里登记的回调在同一个 requestAnimationFrame 回调里依次执行，几个 store 的通知因此只触发一次 React 渲染。
// 结构性事件（run 开始 / 结束、工具结果等）不走这里，由各 store 立即通知。

export type FrameScheduler = (flush: () => void) => void;

export function createFrameScheduler(requestFrame: (callback: () => void) => void = defaultRequestFrame): FrameScheduler {
  const queue = new Set<() => void>();
  let pending = false;
  return (flush) => {
    queue.add(flush);
    if (pending) return;
    pending = true;
    requestFrame(() => {
      pending = false;
      const due = [...queue];
      queue.clear();
      for (const callback of due) {
        try { callback(); } catch (error) { console.error("Frame batch callback failed", error); }
      }
    });
  };
}

function defaultRequestFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => callback());
  else setTimeout(callback, 16);
}

/** 渲染进程共用的一个调度器：live run 与会话 store 的流式通知落在同一帧。 */
export const scheduleFrame = createFrameScheduler();
