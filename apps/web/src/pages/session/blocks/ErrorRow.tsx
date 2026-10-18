import { CircleAlert } from "lucide-react";

/** 运行失败：浅红底一行标题 + 原因。 */
export function ErrorRow({ title, content }: { readonly title: string; readonly content: string }) {
  return (
    <div role="alert" className="flex gap-2 rounded-act-lg bg-danger-soft px-3 py-2.5 text-act-md text-on-danger">
      <CircleAlert size={15} aria-hidden className="mt-[3px] flex-none" />
      <div className="min-w-0"><b className="block font-medium">{title}</b>{content ? <span className="block break-words text-act-sm">{content}</span> : null}</div>
    </div>
  );
}
