#!/usr/bin/env node

/*
 * 用 OpenAI SDK 探测 Kimi / Moonshot 连通性（与 packages/agent-core 的 KimiService 同一套 SDK）。
 *
 * 它会对 .cn 和 .ai 两个 Moonshot 域名分别做：
 *   1. GET /models  —— 验证鉴权 + 拿到该域名下真实可用的模型名
 *   2. 一次最小 chat.completions —— 验证配置的模型名是否真的能用
 * 据此区分 401 到底是「Key 与域名不匹配」还是「模型名无效」。
 *
 * 用法（Key 运行时自己加，脚本不会打印明文）：
 *   KIMI_API_KEY=sk-... node scripts/probe-kimi-connection.mjs
 *
 * 可选：
 *   KIMI_MODEL=kimi-k2-0711-preview \
 *   KIMI_BASE_URL=https://api.moonshot.cn/v1 \
 *   node scripts/probe-kimi-connection.mjs
 */

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const apiKey = process.env.KIMI_API_KEY||"sk-4EH4jmYzZ6nBhwnEKXnAC1BisEkTLrJw7yz9exNUYE5PyASb";
const model = process.env.KIMI_MODEL || "kimi-k2.6";
const explicitBaseUrl = process.env.KIMI_BASE_URL;

if (!apiKey) {
  console.error("缺少 KIMI_API_KEY。示例：");
  console.error("  KIMI_API_KEY=sk-... node scripts/probe-kimi-connection.mjs");
  process.exit(1);
}

// openai 只装在 packages/agent-core 下（pnpm 隔离），从那里解析其入口再动态 import。
let OpenAI;
try {
  const requireFromAgentCore = createRequire(resolve(repoRoot, "packages/agent-core/package.json"));
  const entry = requireFromAgentCore.resolve("openai");
  const mod = await import(pathToFileURL(entry).href);
  OpenAI = mod.default ?? mod.OpenAI ?? mod;
} catch (error) {
  console.error("无法从 packages/agent-core 解析 openai SDK，请先在仓库根目录执行 `pnpm install`。");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function maskKey(key) {
  return key.length <= 10 ? "****" : `${key.slice(0, 5)}…${key.slice(-4)}`;
}

function describeError(error) {
  const status = error?.status ?? error?.response?.status;
  const code = error?.code ?? error?.error?.code ?? error?.type;
  const message = error?.message ?? String(error);
  return { status, code, message };
}

const baseUrls = [
  ...new Set(
    [explicitBaseUrl, "https://api.moonshot.cn/v1", "https://api.moonshot.ai/v1"].filter(Boolean),
  ),
];

async function probeBaseUrl(baseURL) {
  console.log(`\n=== baseURL: ${baseURL} ===`);
  const client = new OpenAI({ apiKey, baseURL });

  let authedOk = false;
  let modelIds = [];

  // 1) 鉴权 + 模型列表
  try {
    const list = await client.models.list();
    modelIds = (list?.data ?? []).map((m) => m.id);
    authedOk = true;
    console.log(`[models.list] 200 OK，可用模型 ${modelIds.length} 个`);
    console.log("  " + (modelIds.slice(0, 30).join(", ") || "(空)"));
    if (modelIds.length > 30) console.log(`  …其余 ${modelIds.length - 30} 个略`);
    console.log(`  配置模型 "${model}" 在列表中：${modelIds.includes(model) ? "✅ 是" : "❌ 否"}`);
  } catch (error) {
    const { status, code, message } = describeError(error);
    console.log(`[models.list] 失败 status=${status ?? "?"} code=${code ?? "?"}`);
    console.log(`  ${message}`);
    if (status === 401 || status === 403) {
      console.log("  → 鉴权失败：这把 Key 在该域名下无效（很可能属于另一个平台/域名）。");
    }
  }

  // 2) 最小 chat completion，验证模型名是否有效
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "只回复两个字：你好" }],
      max_tokens: 16,
      temperature: 0,
    });
    const text = completion?.choices?.[0]?.message?.content ?? "";
    console.log(`[chat.completions] 200 OK，模型 "${model}" 可用，回复：${JSON.stringify(text).slice(0, 120)}`);
  } catch (error) {
    const { status, code, message } = describeError(error);
    console.log(`[chat.completions] 失败 status=${status ?? "?"} code=${code ?? "?"}`);
    console.log(`  ${message}`);
    if (status === 404 || /model/i.test(message)) {
      console.log(`  → 模型名 "${model}" 可能不是该平台的有效模型（参考上面 models.list 的真实名）。`);
    }
  }

  return { baseURL, authedOk, modelIds };
}

console.log("Kimi / Moonshot 连接探测（OpenAI SDK，与 KimiService 一致）");
console.log(`Key: ${maskKey(apiKey)}`);
console.log(`配置模型: ${model}`);
console.log(`待测 baseURL: ${baseUrls.join("  |  ")}`);

const results = [];
for (const baseURL of baseUrls) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await probeBaseUrl(baseURL));
}

console.log("\n=== 结论 ===");
const authed = results.filter((r) => r.authedOk);
if (authed.length === 0) {
  console.log("- 所有域名鉴权都失败：请确认 Key 是否正确、是否过期、账户是否有额度。");
} else {
  for (const r of authed) console.log(`- ✅ 鉴权通过：${r.baseURL}`);
  const aiOk = authed.some((r) => r.baseURL.includes("moonshot.ai"));
  const cnOk = authed.some((r) => r.baseURL.includes("moonshot.cn"));
  if (cnOk && !aiOk) {
    console.log("- 你的 Key 属于国内平台（api.moonshot.cn），而 app 默认用 api.moonshot.ai → 这正是 401 的原因。");
    console.log("  解决：把 KIMI_BASE_URL 设为 https://api.moonshot.cn/v1。");
  } else if (aiOk && !cnOk) {
    console.log("- 你的 Key 属于海外平台（api.moonshot.ai），保持默认 baseURL 即可。");
  }
  const anyModelValid = authed.some((r) => r.modelIds.includes(model));
  if (!anyModelValid) {
    console.log(`- ⚠️ 模型名 "${model}" 不在任何已鉴权域名的模型列表里：chat 会失败，请改用 models.list 里的真实模型名。`);
  }
}
