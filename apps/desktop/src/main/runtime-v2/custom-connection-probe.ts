import { normalizeCustomConnectionAddress, type CustomConnectionProbeInput, type CustomConnectionProbeResult } from "@actspace/shared";
import type { SettingsService } from "../settings-service";
import type { ProviderNetworkService } from "./provider-network-service";

/**
 * fixed-renderer 与 projection 两套 IPC 共用的探测入口。
 * draft：用还没保存的地址和 Key，什么都不落盘；saved：用已保存的连接刷新模型列表。
 */
export async function probeCustomConnection(
  settings: SettingsService,
  network: ProviderNetworkService,
  input: CustomConnectionProbeInput,
): Promise<CustomConnectionProbeResult> {
  const checkedAt = new Date().toISOString();
  const invalid = (message: string): CustomConnectionProbeResult => ({ ok: false, message, checkedAt, errorKind: "invalid_request", models: null });
  if (input?.kind === "saved") {
    const runtime = settings.getCustomConnectionRuntimeConfig(input.connectionId, { requireModel: false });
    if ("code" in runtime) return invalid(runtime.message);
    const result = await network.probeCustomConnection(runtime);
    if (result.ok && result.resolvedAuth) await settings.markCustomConnectionResult(input.connectionId, result);
    return result;
  }
  if (input?.kind !== "draft") return invalid("探测参数无效。");
  if (!input.apiKey?.trim()) return invalid("请输入 API Key。");
  const address = normalizeCustomConnectionAddress(input.baseUrl ?? "", input.protocol);
  if ("reason" in address) return invalid("服务地址无效。");
  let proxyUrl: string | undefined;
  if (input.proxy?.enabled) {
    try {
      const url = new URL(input.proxy.url?.trim() ?? "");
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) throw new Error("invalid proxy");
      proxyUrl = url.toString().replace(/\/$/, "");
    } catch {
      return invalid("代理地址无效。");
    }
  }
  return network.probeCustomConnection({
    protocol: address.inferredProtocol ?? input.protocol,
    apiKey: input.apiKey.trim(),
    baseUrl: address.baseUrl,
    model: "",
    authMode: input.authMode,
    ...(proxyUrl ? { transport: { proxyUrl } } : {}),
  });
}
