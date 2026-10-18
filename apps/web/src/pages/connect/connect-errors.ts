import type { ConnectionError } from "../../connection/connection-store";

// 把配对/连接失败映射成规范 §12 的文案；field 指明错误挂在哪个输入框下面。
export type ConnectMessage = { readonly field: "code" | "url" | "form"; readonly message: string };

export const REVOKED_MESSAGE = "这台设备已在服务器上被移除，请重新配对";
export const UNAUTHENTICATED_MESSAGE = "登录已失效，请重新配对";

export function revokedMessage(reason: "revoked" | "unauthenticated" | null): string | null {
  return reason === "revoked" ? REVOKED_MESSAGE : reason === "unauthenticated" ? UNAUTHENTICATED_MESSAGE : null;
}

export function describeConnectError(error: Pick<ConnectionError, "kind" | "closeCode" | "message" | "url"> | unknown, fallbackUrl = ""): ConnectMessage {
  if (error instanceof TypeError) return { field: "url", message: "地址格式不对，例如 https://my-server.example.com" };
  const value = (error && typeof error === "object" ? error : {}) as Partial<ConnectionError>;
  if (value.kind === "REVOKED" || value.closeCode === 4003) return { field: "form", message: REVOKED_MESSAGE };
  switch (value.kind) {
    case "UNAUTHENTICATED": return { field: "code", message: "配对码无效或已过期，请在服务器上重新生成" };
    case "LIMIT_EXCEEDED": return { field: "form", message: "尝试太频繁，请一分钟后再试" };
    case "INCOMPATIBLE_PROTOCOL": return { field: "url", message: "这台服务器的版本和网页不兼容，请升级后再试" };
    case "FORBIDDEN": return { field: "url", message: "服务器身份与之前不一致，请移除后重新配对" };
    case "MAINTENANCE": case "RECOVERY_BLOCKED": return { field: "form", message: "服务器维护中，请稍后再试" };
    case undefined: break;
    default: return { field: "form", message: typeof value.message === "string" && value.message ? value.message : "配对失败" };
  }
  const url = value.url || fallbackUrl || "服务器";
  return { field: "url", message: `连不上 ${url}：请确认 Host 在运行、地址是 HTTPS，且这个页面的地址已写入 allowedOrigins` };
}
