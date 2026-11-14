import type { SerialHook, WaterfallHook } from "../../src/event-contract.js";

export type FixtureRequestPlan = { readonly model?: string; readonly trace?: readonly string[] };

// 这个包只有干预点的名字，没有任何一个契约：契约在拥有干预点的包里。
// 测试给八个名字里的三个声明自己的契约；其余五个留着不声明，用来确认没有契约的名字编译不过。
declare module "../../src/event-contract.js" {
  interface DomainEvents {
    "agent/request": WaterfallHook<{ readonly model: string }, FixtureRequestPlan>;
    "tools/pre-execute": WaterfallHook<
      { readonly name: string; readonly args: Readonly<Record<string, unknown>> },
      { readonly args?: Readonly<Record<string, unknown>> }
    >;
    "agent/turn-stopping": SerialHook<{ readonly reason: "completed" | "step-limit" }>;
  }
}
