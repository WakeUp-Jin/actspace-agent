import type { ServiceDefinition } from "./service-contract.js";

/**
 * 取用一个服务需要的两样东西：它的 id，和按这个 id 取出来的值是什么类型。
 * `ServiceDefinition<T>`、`serviceKey<T>()` 和 `serviceView<T>()` 的结果都满足这个形状。
 * `service` 只存在于类型里，运行时没有这个字段。
 */
export type ServiceKey<TService = unknown> = { readonly id: string; readonly service?: TService };

/** 取用方对别的包拥有的服务的局部声明，见 `serviceView`。 */
export type ServiceView<TView> = ServiceKey<TView> & { readonly view: true };

/** 从定义或视图里取出服务类型。 */
export type ServiceOf<TKey> = TKey extends ServiceKey<infer TService> ? TService : never;

type ServiceReader = { readonly get?: (name: string) => unknown };
type ServiceWriter = { readonly provide?: (name: string, value?: unknown) => unknown };
type ServiceLease = { getService<TService>(name: string): TService | undefined };

/** 按定义取服务，没注册时是 `undefined`。「按 id 取出后断言类型」只在这里做一次。 */
export function getService<TService>(ctx: ServiceReader | undefined, key: ServiceKey<TService>): TService | undefined {
  return ctx?.get?.(key.id) as TService | undefined;
}

/** 取必须存在的服务。没注册时报 `<consumer> requires <id>.`，`consumer` 写取用方自己的名字。 */
export function requireService<TService>(
  ctx: ServiceReader | undefined,
  key: ServiceKey<TService>,
  consumer: string,
): TService {
  const service = getService(ctx, key);
  if (service === undefined) throw new Error(`${consumer} requires ${key.id}.`);
  return service;
}

/**
 * 按定义注册服务。值的类型不满足定义时编译不过，提供方和取用方因此不会各说各话。
 * 视图只描述取用方用到的一部分，不能拿来注册：传视图进来编译不过。
 */
export function provideService<TService>(
  ctx: ServiceWriter,
  key: ServiceKey<TService> & { readonly view?: never },
  value: NoInfer<TService>,
): void {
  ctx.provide?.(key.id, value);
}

/** 从 Harness 租约上按定义取服务。租约接口本身仍按字符串 id 取，测试里的假租约不用跟着改。 */
export function getLeasedService<TService>(lease: ServiceLease, key: ServiceKey<TService>): TService | undefined {
  return lease.getService<TService>(key.id);
}

/**
 * 给总表（`ACTSPACE_SERVICE_DEFINITIONS`）里的条目补上服务类型。总表在这个包里，写不了各个包的类型，
 * 所以由类型所属的包调用一次、导出结果。返回的还是总表里那个对象。
 */
export function bindServiceType<TService>(definition: ServiceDefinition): ServiceDefinition<TService> {
  return definition as ServiceDefinition<TService>;
}

/**
 * 声明一个不在总表里的 id 对应什么类型：Host 交给 Harness 的端口，或者没进总表的服务。
 * 由类型所属的包声明一次并导出，提供方和取用方都用它。
 */
export function serviceKey<TService>(id: string): ServiceKey<TService> {
  return Object.freeze({ id });
}

/**
 * 取用方对「别的包拥有的服务」的局部声明，只写自己用到的那几个成员。
 * 只在取用方不能依赖服务所属的包时用（下层包取上层包注册的服务）。
 * 真实服务是否满足视图，由能同时看到两边的包做类型检查：见 `@actspace/runtime` 的 `service-views.ts`。
 * 视图要声明成导出的常量，并在那个文件里补一行对照，`pnpm check:service-access` 会查。
 */
export function serviceView<TView>(id: string): ServiceView<TView> {
  return Object.freeze({ id, view: true as const });
}
