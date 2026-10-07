import { CircleHelp, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/Dialog";
import { IconButton } from "../../ui/IconButton";

const STEPS: readonly (readonly (string | { b: string })[])[] = [
  ["在输入框发一句话，协调 Agent 会交给", { b: "空闲的 Actor" }, "；名册里没有合适的，就", { b: "新起一个" }, "（小球头像，头部写着「归属 Space」）。"],
  ["右栏「Actor」里被交到事的那一行会", { b: "亮一下" }, "，头像外出现翡翠绿光环：工作中。"],
  ["几秒后有 Actor 要跑命令，", { b: "琥珀色胶囊" }, "亮起。点它展开托盘，就地运行或拒绝。"],
  ["点右栏「有结果」里的", { b: "性能分析" }, "，看过之后它会滑到「空闲」。"],
  ["协调 Agent 问要不要留下「环境巡检」，点", { b: "留下" }, "，看它长成。"],
  [{ b: "右栏跟着标签页走" }, "：协调 Agent 下是 Actor / 库 / 记忆，右上角「+」还能加文件和终端；切到某个 Actor 或一对一对话，右栏就和普通会话一样，从启动页打开文件、Review、上下文、终端。"],
  ["左栏顺序和桌面端一致：主操作是新建会话、新建 Space、扩展、Actor 名册，下面是 Space 列表；和 Actor 的一对一对话出现在「工作区」的会话里。"],
];

/** 标签栏右侧的「?」按钮和「这是什么」弹窗。 */
export function SpaceDemoHelpButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <IconButton label="这是什么" size="sm" className="[-webkit-app-region:no-drag]">
          <CircleHelp size={15} aria-hidden="true" />
        </IconButton>
      </DialogTrigger>
      <DialogContent size="lg" withDescription className="flex max-h-[calc(100vh_-_64px)] flex-col gap-3 p-5">
        <DialogHeader>
          <DialogTitle className="text-act-lg font-semibold text-text-main">这是什么</DialogTitle>
          <DialogClose asChild>
            <IconButton label="关闭" tooltip={false} size="sm"><X size={14} aria-hidden="true" /></IconButton>
          </DialogClose>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <DialogDescription className="text-act-sm leading-relaxed text-text-muted">
            Space 把几个 Actor 聚在一起解决一个问题。你只和协调 Agent 说话，它把事交给合适的 Actor；每个 Actor 在中间开成一个标签页。
          </DialogDescription>
          <ol className="flex list-decimal flex-col gap-1.5 pl-[18px] text-act-sm leading-relaxed text-text-muted marker:text-text-faint">
            {STEPS.map((parts, i) => (
              <li key={i}>
                {parts.map((p, j) => (typeof p === "string" ? p : <b key={j} className="font-medium text-text-main">{p.b}</b>))}
              </li>
            ))}
          </ol>
          <p className="text-act-xs text-text-faint">数据都是模拟的，刷新或点顶部「重置演示」回到初始状态。</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild><Button variant="primary" size="md">知道了</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
