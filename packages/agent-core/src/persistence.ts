/**
 * Persistence 兼容层
 *
 * 保留旧版接口供 desktop/main/index.ts 等现有消费者使用。
 * 新代码应直接使用 persistence/ 目录下的模块。
 * 此文件将在所有消费者迁移后移除。
 */

// Re-export 新 persistence 系统的所有导出
export * from "./persistence/index";

// ─── 旧版接口（向后兼容） ───

export { readSessionJsonl } from "./persistence/compat";
