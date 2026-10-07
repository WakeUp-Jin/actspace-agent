import { Info } from "lucide-react";
import { Button } from "../ui/Button";
import { useSpaceDemoActions } from "./model/use-space-demo";

/** 标签栏下方常驻的演示提示：数据是模拟的，可一键重置。 */
export function SpaceDemoNotice() {
  const { reset } = useSpaceDemoActions();
  return (
    <div role="note" className="flex min-h-[30px] shrink-0 items-center gap-2 border-b border-line bg-info-soft py-0.5 pl-4 pr-2.5 text-act-xs text-text-muted">
      <Info size={14} className="shrink-0 text-info" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b className="font-medium text-text-main">开发中演示</b> · 数据是模拟的，操作不会真正执行
      </span>
      <Button variant="ghost" size="xs" onClick={reset}>重置演示</Button>
    </div>
  );
}
