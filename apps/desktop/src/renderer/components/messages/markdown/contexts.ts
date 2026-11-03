import { createContext } from "react";

/**
 * 聊天区 Markdown 内部共享的 context。值都由 `MarkdownProse` 保证稳定引用（原始值或 useMemo），
 * 否则平滑输出的每一帧都会让整页历史回复重渲染。
 */

/** 每条回复稳定的 id 前缀（脚注、原始 HTML 的 id / name 都挂在它下面），不同回复之间互不串跳。 */
export const IdPrefixContext = createContext("user-content-");

/** 有效的流式状态：所在轮仍在输出，或平滑输出还有积压没放完。Mermaid 围栏、表格列宽据此判断。 */
export const ProseStreamingContext = createContext(false);

/** 当前块的状态：块自己的源码（不含追加的定义），以及它是不是一个还没闭合、正在写的代码围栏。 */
export type BlockState = { source: string; fenceOpen: boolean };
export const BlockStateContext = createContext<BlockState>({ source: "", fenceOpen: false });

/** 脚注编号：key 是脚注标识（小写），按全文第一次被引用的顺序从 1 开始。 */
export const FootnoteNumbersContext = createContext<ReadonlyMap<string, number>>(new Map());
