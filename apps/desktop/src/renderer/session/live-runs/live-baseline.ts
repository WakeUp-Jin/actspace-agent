import type { LiveOutputBaseline } from "@actspace/shared/runtime-v2";
import type { LiveRunStore } from "@actspace/client/live";
import { sessionsApi } from "../../api/sessions";

export type ReadLiveOutput = (sessionId: string) => Promise<LiveOutputBaseline | null>;
const readFromHost: ReadLiveOutput = (sessionId) => sessionsApi.liveOutput({ sessionId });

/**
 * 恢复运行（渲染进程重载后重新挂上的 run）的起点：主进程实时底稿里还没定稿的正文与思考。
 * 在拿到之前，这个 run 的正文增量先缓存（live-run.ts）；拿到后从底稿接着显示，丢掉底稿已包含的帧。
 * 远程会话返回 null：远程适配器会在 `agent_run_started(recoveredReset)` 之后自己推底稿。
 * 读取失败时给一个空底稿，缓存的增量照常显示，不让 run 一直等。
 */
export async function attachLiveBaseline(
  runs: LiveRunStore,
  sessionId: string,
  agentRunId: string,
  read: ReadLiveOutput = readFromHost,
): Promise<void> {
  let baseline: LiveOutputBaseline | null;
  try {
    baseline = await read(sessionId);
  } catch (error) {
    console.error("Failed to read the live output baseline", error);
    baseline = { runId: null, revision: 0, segments: [] };
  }
  if (baseline === null) return;
  runs.applyStreamEvent(
    {
      type: "live_output_baseline",
      sessionId,
      agentRunId,
      revision: baseline.revision,
      segments: baseline.runId === agentRunId ? baseline.segments : [],
    },
    () => undefined,
  );
}
