import type { ModelCatalogPriceOverride } from "./model-catalog";

/**
 * 改价清单：需要改已有模型的价格时只改这里，然后运行 `pnpm models:generate --offline`。
 * 单价为 USD / 百万 token，缺失写 null（null 不等于免费）。每行必须写价格来源链接和核对日期。
 * 例：{ source: "models.dev", sourceProviderId: "openai", apiModel: "gpt-5", rates: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: null }, sourceUrl: "https://openai.com/api/pricing/", checkedAt: "2026-11-08" }
 * 本文件只允许 type import：生成脚本单独转译并加载它。
 */
export const MODEL_CATALOG_PRICE_OVERRIDES: readonly ModelCatalogPriceOverride[] = [];
