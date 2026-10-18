import { ArrowUp } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type SendTone = "agent" | "plan" | "chat" | "stop";

/** 输入框右下角 34px 圆钮：发送（按模式着色）或停止；不可用时是浅灰底。样式 .send-btn 在 styles/web.css。 */
export function SendButton({ tone, className, type = "button", ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { readonly tone: SendTone }) {
  const stop = tone === "stop";
  return (
    <button type={type} aria-label={stop ? "停止" : "发送"} title={stop ? "停止" : "发送"} data-tone={tone} className={cx("send-btn", className)} {...rest}>
      {stop ? <span aria-hidden className="send-stop" /> : <ArrowUp size={16} strokeWidth={2.4} aria-hidden />}
    </button>
  );
}
