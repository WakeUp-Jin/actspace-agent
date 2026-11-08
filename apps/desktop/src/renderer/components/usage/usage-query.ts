import type { UsageStatisticsRange } from "@actspace/shared";

/** 使用统计页发给上层的一次查询：时间范围、请求明细页码与三个筛选（空 = 全部）。 */
export type UsageQuery = {
  range: UsageStatisticsRange;
  page: number;
  model?: string;
  providerId?: string;
  workspaceRoot?: string;
};

/** 请求明细每页条数（规范 §2.4）。 */
export const USAGE_REQUEST_PAGE_SIZE = 20;
