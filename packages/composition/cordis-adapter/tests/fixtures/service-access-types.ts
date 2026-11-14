/**
 * 只给类型检查看的样例，不执行。`service-access.spec.ts` 用 TypeScript 编译它两遍：
 * 原样编译必须没有任何报错（每个 `@ts-expect-error` 都压住了一个真实的错误）；
 * 去掉 `@ts-expect-error` 再编译，报错必须正好落在这些行上、错误码和 spec 里写的一致。
 */
import { bindServiceType, getLeasedService, getService, provideService, requireService, serviceKey, serviceView, type ServiceOf } from "../../src/service-access.js";
import { ACTSPACE_SERVICE_DEFINITIONS } from "../../src/service-contract.js";

type Clock = { now(): number };
type Covers<Provider extends View, View> = Provider;

const CLOCK = bindServiceType<Clock>(ACTSPACE_SERVICE_DEFINITIONS.sessionJournal);
const PORT = serviceKey<{ readonly root: string }>("fixture.host.port");
const CLOCK_VIEW = serviceView<{ now(): unknown }>("session.journal");

declare const ctx: { readonly get?: (name: string) => unknown; readonly provide?: (name: string, value?: unknown) => unknown };
declare const lease: { getService<TService>(name: string): TService | undefined };

// 正例：类型从定义里带出来，调用处不用再写类型。
export const stamp: number | undefined = getService(ctx, CLOCK)?.now();
export const required: number = requireService(ctx, CLOCK, "Fixture").now();
export const root: string | undefined = getService(ctx, PORT)?.root;
export const leased: number | undefined = getLeasedService(lease, CLOCK)?.now();
export const viewed: unknown = getService(ctx, CLOCK_VIEW)?.now();
provideService(ctx, CLOCK, { now: () => 1 });
provideService(ctx, PORT, { root: "/" });
export type Covered = Covers<ServiceOf<typeof CLOCK>, ServiceOf<typeof CLOCK_VIEW>>;

// 反例：下面每一处都必须编译不过。
// @ts-expect-error [unknown-member] 取出来的服务没有这个方法
getService(ctx, CLOCK)?.tick();
// @ts-expect-error [maybe-missing] 服务可能没注册，不能不判断就用
getService(ctx, CLOCK).now();
// @ts-expect-error [wrong-shape] 注册的值没有定义要求的方法
provideService(ctx, CLOCK, { tick: () => 1 });
// @ts-expect-error [wrong-return] 注册的值方法返回类型不对
provideService(ctx, CLOCK, { now: () => "now" });
// @ts-expect-error [provide-view] 视图不能用来注册
provideService(ctx, CLOCK_VIEW, { now: () => 1 });
// @ts-expect-error [unknown-entry] 总表里没有这个条目
bindServiceType<Clock>(ACTSPACE_SERVICE_DEFINITIONS.sessionJurnal);
// @ts-expect-error [untyped-entry] 没补类型的总表条目取出来是 unknown
getService(ctx, ACTSPACE_SERVICE_DEFINITIONS.sessionJournal)?.registry;
// @ts-expect-error [uncovered-view] 视图要的成员真实服务没有
export type Uncovered = Covers<ServiceOf<typeof CLOCK>, { now(): number; reset(): void }>;
