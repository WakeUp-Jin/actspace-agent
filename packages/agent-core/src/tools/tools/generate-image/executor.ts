import { lookup } from "node:dns/promises";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ToolArtifact } from "@actspace/shared";
import type { ToolExecutorFn } from "../../types";
import {
  ImageGenerationProviderError,
  requestImageGeneration,
  type GeneratedImagePayload,
} from "./provider";

const SUPPORTED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const MAX_PROMPT_CHARS = 32_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;

export const generateImageExecutor: ToolExecutorFn = async (args, _workspaceRoot, runtime) => {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  const size = typeof args.size === "string" ? args.size : "1024x1024";
  const n = args.n === undefined ? 1 : args.n;

  if (!prompt) return failure("图片生成 prompt 不能为空。");
  if (prompt.length > MAX_PROMPT_CHARS) return failure(`图片生成 prompt 不能超过 ${MAX_PROMPT_CHARS} 个字符。`);
  if (!SUPPORTED_SIZES.has(size)) return failure("size 必须是 1024x1024、1536x1024 或 1024x1536。");
  if (!Number.isInteger(n) || typeof n !== "number" || n < 1 || n > 10) {
    return failure("n 必须是 1 到 10 之间的整数。");
  }
  if (!runtime?.imageGeneration?.apiKey) return failure("尚未在设置中配置图片生成 API Key。");
  if (!runtime.artifactRoot) return failure("当前会话没有可用的图片产物目录。");

  try {
    const payloads = await requestImageGeneration(runtime.imageGeneration, { prompt, size, n }, { signal: runtime.signal });
    const batchDir = join(runtime.artifactRoot, `${Date.now()}-${randomUUID().slice(0, 8)}`);
    await mkdir(batchDir, { recursive: true });

    const artifacts: ToolArtifact[] = [];
    const failures: string[] = [];
    let batchBytes = 0;
    for (let index = 0; index < Math.min(payloads.length, n); index += 1) {
      try {
        const image = await materializeImage(payloads[index]!, runtime.signal);
        if (batchBytes + image.bytes.length > MAX_BATCH_BYTES) {
          throw new Error("本次图片总量超过 100MB 限制。");
        }
        const name = `generated-${String(index + 1).padStart(2, "0")}.${image.extension}`;
        const path = join(batchDir, name);
        const tempPath = `${path}.tmp-${randomUUID()}`;
        await writeFile(tempPath, image.bytes, { flag: "wx" });
        await rename(tempPath, path);
        artifacts.push({ type: "image", name, path, mimeType: image.mimeType });
        batchBytes += image.bytes.length;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "图片保存失败");
      }
    }

    if (artifacts.length === 0) return failure(failures[0] ?? "图片服务返回结果无法保存。");
    const partial = artifacts.length < n;
    const warning = partial ? `请求 ${n} 张，成功保存 ${artifacts.length} 张。` : undefined;
    const data = partial
      ? `已生成并保存 ${artifacts.length}/${n} 张图片。`
      : `已生成并保存 ${artifacts.length} 张图片。`;
    return {
      success: true,
      data,
      preserveModelOutput: true,
      artifacts,
      structured: {
        status: partial ? "partial" : "completed",
        promptPreview: prompt.slice(0, 160),
        requestedCount: n,
        generatedCount: artifacts.length,
        model: runtime.imageGeneration.model,
        size,
        images: artifacts,
        ...(warning && { warning }),
      },
    };
  } catch (error) {
    if (error instanceof ImageGenerationProviderError) return failure(error.message);
    return failure("图片生成失败，请稍后重试。");
  }
};

async function materializeImage(
  payload: GeneratedImagePayload,
  signal?: AbortSignal,
): Promise<{ bytes: Buffer; mimeType: string; extension: string }> {
  const bytes = payload.kind === "base64"
    ? decodeBase64(payload.value)
    : await downloadImage(payload.value, signal);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("单张图片超过 25MB 限制。");
  const type = sniffImageType(bytes);
  if (!type) throw new Error("图片格式不受支持（仅 PNG、JPEG、WebP）。");
  return { bytes, ...type };
}

function decodeBase64(value: string): Buffer {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error("图片 Base64 数据无效或过大。");
  }
  return Buffer.from(compact, "base64");
}

async function downloadImage(urlValue: string, signal?: AbortSignal): Promise<Buffer> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("图片下载地址不安全。");
  await assertPublicHostname(url.hostname);
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）。`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new Error("单张图片超过 25MB 限制。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("单张图片超过 25MB 限制。");
  return bytes;
}

async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("图片下载地址不允许访问本机或局域网。");
  }
  const addresses = isIP(normalized)
    ? [{ address: normalized }]
    : await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("图片下载地址不允许访问私有网络。");
  }
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value === "0.0.0.0" || value === "::") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function sniffImageType(bytes: Buffer): { mimeType: string; extension: string } | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return undefined;
}

function failure(message: string) {
  return { success: false as const, error: message, data: message, preserveModelOutput: true };
}
