import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** 玻璃胶囊：顶栏标题、按钮组、底部输入坞共用的材质。 */
export function GlassPill({ className, strong = false, ...rest }: HTMLAttributes<HTMLDivElement> & { readonly strong?: boolean }) {
  return <div className={cx("glass", strong && "glass-strong", className)} {...rest} />;
}
