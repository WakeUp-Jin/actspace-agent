import { createContext } from "react";

/**
 * 所在的这一轮仍在流式输出。流式期间块的高度不能突变（mermaid 围栏闭合后变图、表格列宽重排），
 * 否则贴底跟随会被撑得一跳一跳；这一轮结束后再换成最终形态。历史回复和面板里的回复保持默认值 false。
 */
export const ReplyStreamingContext = createContext(false);
