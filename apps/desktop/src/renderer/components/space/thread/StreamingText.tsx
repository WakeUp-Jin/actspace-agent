import { ActorRefText } from "./ActorRef";

export interface StreamingTextProps {
  /** 带 [[id]] 引用的完整正文 */
  text: string;
  /** 去掉引用后的纯文本，流式时按它截取 */
  plain: string;
  typing?: boolean;
  /** 已显示的字数；null 或缺省表示已结束 */
  shown?: number | null;
}

/** 只显示 store 给的状态：跳动点、已出的字数加光标、或完整正文。 */
export function StreamingText({ text, plain, typing, shown }: StreamingTextProps) {
  if (typing) {
    return (
      <span className="space-typing" role="status" aria-label="正在回复">
        <i /><i /><i />
      </span>
    );
  }
  if (shown != null) {
    return (
      <>
        {plain.slice(0, shown)}
        <span className="space-caret" aria-hidden="true" />
      </>
    );
  }
  return <ActorRefText text={text} />;
}
