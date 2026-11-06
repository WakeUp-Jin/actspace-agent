import { createContext } from "react";

/**
 * 所在的这一轮仍在流式输出。流式期间块的高度不能突变（mermaid 围栏闭合后变图、表格列宽重排），
 * 否则贴底跟随会被撑得一跳一跳；这一轮结束后再换成最终形态。历史回复和面板里的回复保持默认值 false。
 */
export const ReplyStreamingContext = createContext(false);

/**
 * 这一轮里正在写的那条回复的 id（聊天区规范 §7.1）：只有它带平滑输出、末尾渐显和光标。
 * 一轮里模型说完一句就去调工具，这句话已经写完，不能因为整轮还在跑就一直挂着流式样子。
 * `undefined` 表示外层没有指定（单独使用 MarkdownProse 时），末尾效果跟随 ReplyStreamingContext；
 * `null` 表示这一轮当前没有回复在写。
 */
export const WritingReplyContext = createContext<string | null | undefined>(undefined);
