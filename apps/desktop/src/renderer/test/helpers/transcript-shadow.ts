import { isDeepStrictEqual } from "node:util";
import type * as Transcript from "../../session/transcript";
import { legacyMergeTranscript } from "../../../../test-fixtures/legacy-transcript";

/**
 * 14 T15：App 测试里给 `mergeTranscript` 套一层影子对照，每次调用都与旧实现比较。
 * 渲染中抛错会被 React 吞成别的失败，所以只记录不一致，由用例的 afterEach 断言为空。
 */
export const transcriptShadow = { calls: 0, mismatches: [] as Array<{ next: unknown; legacy: unknown }> };

export function shadowTranscript(actual: typeof Transcript): typeof Transcript {
  return {
    ...actual,
    mergeTranscript: (durable, live, local) => {
      const next = actual.mergeTranscript(durable, live, local);
      const legacy = legacyMergeTranscript(durable, live, local);
      transcriptShadow.calls += 1;
      if (!isDeepStrictEqual(next, legacy)) transcriptShadow.mismatches.push({ next, legacy });
      return next;
    },
  };
}
