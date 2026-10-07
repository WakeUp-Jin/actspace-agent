import type { SessionRecord } from "@actspace/shared";
import type { RuntimeV2DesktopSessionProjection } from "@actspace/shared/runtime-v2";
import { recordProjectionFixture } from "../projection-fixture";

type RecordReader<A extends unknown[]> = (...args: A) => SessionRecord | null | undefined | Promise<SessionRecord | null | undefined>;

/**
 * 较早的 UI 用例用 SessionRecord 描述会话。bridge 返回的是 projection，这里用和 `sessions.getPage`
 * fixture 相同的转换把 record 投影过去，`api/sessions` 再投影回 UI 使用的结构。
 */
export function projectRecord<A extends unknown[]>(read: RecordReader<A>): (...args: A) => Promise<RuntimeV2DesktopSessionProjection | null> {
  return async (...args) => {
    const record = await read(...args);
    return record ? recordProjectionFixture(record) : null;
  };
}
