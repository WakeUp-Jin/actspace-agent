import type { ProfileServices } from "@actspace/runtime";

type ProfileLike = { readonly context: { readonly get?: (id: string) => unknown } };

/**
 * 从启动好的 Profile 里按 id 取服务，没注册时是 `undefined`。
 * 主进程只能动态加载 Runtime，拿不到服务定义这个值，所以按 id 取；类型查 Runtime 导出的 `ProfileServices`，
 * 那张表由服务定义推出来。主进程里「按 id 取出后断言类型」只在这里做一次。
 */
export function profileService<K extends keyof ProfileServices>(
  profile: ProfileLike,
  id: K,
): ProfileServices[K] | undefined {
  return profile.context.get?.(id) as ProfileServices[K] | undefined;
}

/**
 * `ProfileServices` 里有一项的类型丢了，下面这一行就编译不过（报「用不到的 @ts-expect-error」）。
 * Runtime 的声明文件里只要有一处引用在主进程这边解析不到，那一项就没有类型了，而且不报错：照样能编译，只是不再检查。
 */
// @ts-expect-error 真实的服务类型上没有这个成员，所以这里应当报错。
export type ProfileServicesStayTyped = ProfileServices[keyof ProfileServices]["__absent__"];
