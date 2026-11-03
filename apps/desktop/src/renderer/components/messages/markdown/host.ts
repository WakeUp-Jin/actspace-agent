import { createContext } from "react";

/**
 * 聊天区 Markdown 需要宿主提供的能力（规范 §4）。没有提供的能力，对应元素退回普通文字或占位。
 * 宿主在组件树上方提供 `MarkdownHostContext`；`MarkdownProse` 的 `onOpenWorkspaceFile` 会覆盖其中的 `openPath`。
 */
export type MarkdownHost = {
  /** 打开工作区内的文件；path 是相对工作区根的路径，line 只对 Markdown 文件生效。没有时路径、本地链接都不可点。 */
  openPath?: (path: string, line?: number) => void;
  /** 读取工作区内的图片并返回 data URL；读不到返回 null。没有时图片显示占位（远端会话不加载）。 */
  loadImage?: (path: string) => Promise<string | null>;
  /** 本机工作区根目录的绝对路径：回复里写的工作区内绝对路径去掉这个前缀后可点；没有时绝对路径都不可点。 */
  workspaceRoot?: string;
};

const NO_HOST: MarkdownHost = Object.freeze({});

export const MarkdownHostContext = createContext<MarkdownHost>(NO_HOST);
