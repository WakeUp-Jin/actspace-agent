// 聊天区流式渲染的测量入口（执行计划 T28），由 measure-chat.mjs 临时拷到被测代码树的 apps/desktop/ 下，测完删除。
// 只依赖新旧版本都有的 `MarkdownProse`、`ReplyStreamingContext` 和 `TooltipProvider`（Mermaid 工具栏要用，应用里由工作台提供），
// 所以同一份入口能测改造前后两版。
import { Profiler, createElement, type ProfilerOnRenderCallback } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownProse } from "./src/renderer/components/messages/MarkdownProse";
import { ReplyStreamingContext } from "./src/renderer/components/messages/reply-streaming-context";
import { TooltipProvider } from "./src/renderer/components/ui/Tooltip";

export interface Commit {
  /** 这次提交时已经送进组件的字符数 */
  fed: number;
  /** React Profiler 的 actualDuration：这次更新渲染 MarkdownProse 子树的耗时 */
  ms: number;
}

/**
 * 模拟网络流：每 `interval` ms 送进 `batch` 个字符（ReplyStreamingContext 为 true），送完后结束流式，
 * 等页面安静 `settle` ms。返回每次提交的耗时。
 */
export async function runStream(content: string, { batch, interval, settle = 800 }: { batch: number; interval: number; settle?: number }) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:720px;z-index:9999;background:var(--color-bg-main,#fff)";
  document.body.append(host);
  const root = createRoot(host);
  const commits: Commit[] = [];
  let fed = 0;
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commits.push({ fed, ms: actualDuration });
  };
  const render = (text: string, streaming: boolean) =>
    root.render(
      createElement(TooltipProvider, null,
        createElement(Profiler, { id: "prose", onRender },
          createElement(ReplyStreamingContext.Provider, { value: streaming }, createElement(MarkdownProse, { content: text })))),
    );
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const started = performance.now();
  while (fed < content.length) {
    fed = Math.min(content.length, fed + batch);
    render(content.slice(0, fed), true);
    await sleep(interval);
  }
  render(content, false);
  await sleep(settle);
  const wall = performance.now() - started;
  const height = host.getBoundingClientRect().height;
  root.unmount();
  host.remove();
  return { commits, wall, height };
}
