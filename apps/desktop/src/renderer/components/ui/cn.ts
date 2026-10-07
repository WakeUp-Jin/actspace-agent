// 拼接 className 的唯一实现：丢掉 false / null / undefined / 空串。原语和业务组件共用这一份。
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
