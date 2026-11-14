// 只给类型检查看的样例，不执行。`hook-dispatch.spec.ts` 编译它两遍，做法见 `../support/type-fixture.ts`。
import "./hook-contracts.js";
import { onHook, serialDispatch, waterfallDispatch, type CordisContext, type HookName } from "../../src/index.js";

declare const ctx: CordisContext;

// 正例：监听器不标类型，payload、next() 和返回值都从契约来。
onHook(ctx, "agent/request", async (payload, next) => {
  const plan = await next();
  return { model: plan.model ?? payload.model, trace: [...(plan.trace ?? []), "seen"] };
});
onHook(ctx, "agent/request", (payload) => ({ model: payload.model.toUpperCase() }));
onHook(ctx, "tools/pre-execute", (payload, next) => (payload.name === "noop" ? {} : next()));
onHook(ctx, "agent/turn-stopping", (payload) => (payload.reason === "step-limit" ? "handled" : undefined));
export const stop: () => void = onHook(ctx, "agent/turn-stopping", async () => {});
export const dispatched: Promise<unknown> = waterfallDispatch(ctx, "agent/request", { model: "m" }, () => ({
  model: "m",
}));
export const detached: Promise<unknown> = waterfallDispatch(
  undefined,
  "tools/pre-execute",
  { name: "read", args: {} },
  async () => ({}),
);
export const stopped: Promise<unknown> = serialDispatch(ctx, "agent/turn-stopping", { reason: "completed" });
// 这个程序里有契约的名字正好是声明的三个：多一个少一个，这一行都编译不过。
export const declared: Record<HookName, true> = {
  "agent/request": true,
  "tools/pre-execute": true,
  "agent/turn-stopping": true,
};

// 反例：下面每一处都必须编译不过。
// @ts-expect-error [payload-field] payload 没有这个字段
onHook(ctx, "agent/request", (payload) => ({ model: payload.modle }));
// @ts-expect-error [other-payload] payload 跟着名字走：tools/pre-execute 的 payload 没有 model
onHook(ctx, "tools/pre-execute", (payload) => ({ args: { model: payload.model } }));
// @ts-expect-error [result-type] 返回值的字段类型不对
onHook(ctx, "agent/request", () => ({ model: 1 }));
// @ts-expect-error [forgot-return] 调了 next() 却没把结果返回
onHook(ctx, "agent/request", async (_payload, next) => {
  await next();
});
// @ts-expect-error [serial-next] serial 干预点没有 next
onHook(ctx, "agent/turn-stopping", (_payload: unknown, next: () => unknown) => next());
// @ts-expect-error [no-contract] 名字是干预点，但这个程序里没有它的契约
onHook(ctx, "llm/stream", () => undefined);
// @ts-expect-error [notification] 通知不是干预点
onHook(ctx, "agent/status", () => undefined);
// @ts-expect-error [dispatch-payload] 分发的 payload 字段类型不对
void waterfallDispatch(ctx, "agent/request", { model: 1 }, () => ({}));
// @ts-expect-error [dispatch-missing] 分发的 payload 少了字段
void waterfallDispatch(ctx, "tools/pre-execute", { name: "read" }, () => ({}));
// @ts-expect-error [built-in-result] 内置行为的返回值类型不对
void waterfallDispatch(ctx, "agent/request", { model: "m" }, () => ({ model: 1 }));
// @ts-expect-error [waterfall-serial] serial 干预点不能按 waterfall 分发
void waterfallDispatch(ctx, "agent/turn-stopping", { reason: "completed" }, () => undefined);
// @ts-expect-error [serial-waterfall] waterfall 干预点不能按 serial 分发
void serialDispatch(ctx, "agent/request", { model: "m" });
// @ts-expect-error [dispatch-no-contract] 没有契约的名字不能分发
void waterfallDispatch(ctx, "llm/stream", {}, () => ({}));
// @ts-expect-error [unchecked-result] 分发的结果是 unknown，检查之前不能当成契约的结果用
export const plan: { readonly model?: string } = await waterfallDispatch(
  ctx,
  "agent/request",
  { model: "m" },
  () => ({}),
);
