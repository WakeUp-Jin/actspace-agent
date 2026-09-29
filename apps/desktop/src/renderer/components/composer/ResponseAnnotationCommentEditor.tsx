import { useState } from "react";
import { COMPOSER_REFERENCE_LIMITS, codePointLength } from "@actspace/shared";
import { Button } from "../ui/Button";

const EDITOR_CLASS =
  "block min-h-14 w-full resize-none rounded-act-sm border border-line bg-surface px-2 py-1.5 text-act-sm leading-5 text-text-main placeholder:text-text-faint focus:border-line-strong focus:outline-none aria-invalid:border-danger";

/** 引用卡片里的评论输入：纯文本，不接 `@` 和 Slash 菜单。 */
export function ResponseAnnotationCommentEditor({
  label,
  initialValue,
  onSubmit,
  onCancel,
}: {
  label: string;
  initialValue: string;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const tooLong = codePointLength(value) > COMPOSER_REFERENCE_LIMITS.maxCommentCodePoints;
  const submit = () => {
    if (!tooLong) onSubmit(value.trim());
  };

  return (
    <div className="mt-2">
      <textarea
        className={EDITOR_CLASS}
        aria-label={label}
        aria-invalid={tooLong}
        placeholder="添加可选评论…"
        rows={2}
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // 只退出评论编辑，不再往上关闭 Composer 的其他浮层。
            event.preventDefault();
            event.stopPropagation();
            onCancel();
            return;
          }
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          submit();
        }}
      />
      {tooLong ? (
        <p className="mt-1 text-act-xs leading-4 text-danger" role="alert">
          评论超过 {COMPOSER_REFERENCE_LIMITS.maxCommentCodePoints.toLocaleString("en-US")} 个字符，请缩短后再提交。
        </p>
      ) : null}
      <div className="mt-1.5 flex justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={onCancel}>取消</Button>
        <Button variant="secondary" size="xs" disabled={tooLong} onClick={submit}>保存</Button>
      </div>
    </div>
  );
}
