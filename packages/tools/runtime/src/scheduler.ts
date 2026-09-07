import type { PreparedDispatch, ToolCallInput, ToolPreparedEnvironment } from "./prepared-execution.js";
import { PreparedToolExecution } from "./prepared-execution.js";
import { OrderedToolCommitQueue } from "./ordered-commit.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolExecutionResult } from "./result.js";

export class ToolExecutionScheduler {
  readonly maxParallel: number;

  constructor(
    private readonly registry: ToolRegistry,
    options: { readonly maxParallel?: number } = {},
  ) {
    const requested = options.maxParallel ?? 4;
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > 4) throw new TypeError("Tool maxParallel must be between 1 and 4.");
    this.maxParallel = requested;
  }

  prepareBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): readonly PreparedToolExecution[] {
    const commits = new OrderedToolCommitQueue();
    const prepared: PreparedToolExecution[] = [];
    try {
      for (const call of calls) {
        const registration = this.registry.capture(call.name);
        prepared.push(new PreparedToolExecution(registration, call, environment, commits.reserve()));
      }
      return Object.freeze(prepared);
    } catch (error) {
      void Promise.allSettled(prepared.map((item) => item.dispose()));
      throw error;
    }
  }

  async executeBatch(calls: readonly ToolCallInput[], environment: ToolPreparedEnvironment): Promise<readonly ToolExecutionResult[]> {
    const prepared = this.prepareBatch(calls, environment);
    const results: ToolExecutionResult[] = [];
    try {
      let cursor = 0;
      while (cursor < prepared.length) {
        const current = prepared[cursor] as PreparedToolExecution;
        if (current.concurrency === "exclusive") {
          results.push(await current.execute());
          cursor += 1;
          continue;
        }
        const group: PreparedToolExecution[] = [];
        while (cursor < prepared.length && prepared[cursor]?.concurrency === "parallel") {
          group.push(prepared[cursor] as PreparedToolExecution);
          cursor += 1;
        }
        const stages: PreparedDispatch[] = [];
        for (const item of group) stages.push(await item.stage());
        const committing: Promise<ToolExecutionResult>[] = [];
        await runBounded(
          group.map((item, index) => async () => {
            if (stages[index]?.kind === "body") await item.runBody();
            // Submit as soon as this body is ready. Ordered slots still control durable order.
            committing[index] = item.execute();
            void committing[index]!.catch(() => {});
          }),
          this.maxParallel,
        );
        results.push(...await Promise.all(committing));
      }
      return Object.freeze(results);
    } finally {
      await Promise.allSettled(prepared.map((item) => item.dispose()));
    }
  }
}

async function runBounded(tasks: readonly (() => Promise<void>)[], limit: number): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      await tasks[index]?.();
    }
  });
  await Promise.all(workers);
}
