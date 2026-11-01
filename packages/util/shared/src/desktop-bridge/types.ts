/**
 * Desktop bridge 契约的描述原语。
 *
 * 契约只描述「哪个成员走哪个 channel、入参出参是什么」，不含 guard、不含实现：
 * - main 用它注册 handler（`apps/desktop/src/main/ipc/registry.ts`）；
 * - preload 用它生成 `window.actspace`；
 * - renderer 用 `BridgeOf` 推导出的 `DesktopBridge` 做类型。
 */

/** 只在类型层携带入参 / 出参，运行时不存在。 */
export declare const PHANTOM: unique symbol;

export interface InvokeSpec<I, O> {
  readonly kind: "invoke";
  readonly channel: string;
  /** 调用方不传入参时，preload 用这个值补上；有它时入参在 `DesktopBridge` 上是可选的。 */
  readonly defaultInput?: I;
  readonly [PHANTOM]?: { readonly input: I; readonly output: O };
}

export interface EventSpec<P> {
  readonly kind: "event";
  readonly channel: string;
  /** main 发送时不带 payload，preload 用这个值补上。 */
  readonly defaultPayload?: P;
  readonly [PHANTOM]?: { readonly payload: P };
}

/** fire-and-forget，走 `ipcRenderer.send`。 */
export interface SendSpec<I> {
  readonly kind: "send";
  readonly channel: string;
  readonly [PHANTOM]?: { readonly input: I };
}

/** 不走 IPC，由 preload 直接实现（webUtils、webFrame 等）。 */
export interface LocalSpec<F extends (...args: never[]) => unknown> {
  readonly kind: "local";
  readonly [PHANTOM]?: { readonly fn: F };
}

/** 带默认入参的 invoke，入参在 bridge 上可选。 */
export interface DefaultedInvokeSpec<I, O> extends InvokeSpec<I, O> {
  readonly defaultInput: I;
}

export type BridgeSpec =
  | InvokeSpec<any, any>
  | EventSpec<any>
  | SendSpec<any>
  | LocalSpec<(...args: never[]) => unknown>;

export type BridgeContract = Readonly<Record<string, Readonly<Record<string, BridgeSpec>>>>;

export function invoke<I = void, O = void>(channel: string): InvokeSpec<I, O> {
  return Object.freeze({ kind: "invoke", channel });
}

export function invokeWithDefault<I, O>(channel: string, defaultInput: I): DefaultedInvokeSpec<I, O> {
  return Object.freeze({ kind: "invoke", channel, defaultInput });
}

export function event<P = void>(channel: string, defaultPayload?: P): EventSpec<P> {
  return Object.freeze(defaultPayload === undefined ? { kind: "event", channel } : { kind: "event", channel, defaultPayload });
}

export function send<I>(channel: string): SendSpec<I> {
  return Object.freeze({ kind: "send", channel });
}

export function local<F extends (...args: never[]) => unknown>(): LocalSpec<F> {
  return Object.freeze({ kind: "local" });
}

type InvokeArgs<I> = [I] extends [void] ? [] : undefined extends I ? [input?: I] : [input: I];

export type BridgeMethod<S> =
  S extends DefaultedInvokeSpec<infer I, infer O> ? (input?: I) => Promise<O>
  : S extends InvokeSpec<infer I, infer O> ? (...args: InvokeArgs<I>) => Promise<O>
  : S extends EventSpec<infer P> ? (listener: (payload: P) => void) => () => void
  : S extends SendSpec<infer I> ? (input: I) => void
  : S extends LocalSpec<infer F> ? F
  : never;

export type BridgeOf<C extends BridgeContract> = {
  readonly [D in keyof C]: { readonly [M in keyof C[D]]: BridgeMethod<C[D][M]> };
};

/** 契约成员的入参 / 出参，供 main handler 和测试使用。 */
export type SpecInput<S> = S extends InvokeSpec<infer I, any> ? I : S extends SendSpec<infer I> ? I : never;
export type SpecOutput<S> = S extends InvokeSpec<any, infer O> ? O : never;
export type SpecPayload<S> = S extends EventSpec<infer P> ? P : never;
