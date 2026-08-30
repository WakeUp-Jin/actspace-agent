export const CORDIS_PACKAGES = Object.freeze({
  "@deepseek-ai/cordis": "4.0.1",
  "@deepseek-ai/cordis-plugin-loader": "1.0.2",
  "@deepseek-ai/cordis-plugin-include": "1.0.6",
  "@deepseek-ai/cordis-plugin-group": "1.0.1",
  "@deepseek-ai/cordis-plugin-timer": "1.1.3",
} as const);
export type CordisPackageName = keyof typeof CORDIS_PACKAGES;
export type CordisPackageFingerprint = { readonly name: CordisPackageName; readonly expectedVersion: string; readonly actualVersion: string | null; readonly entry: string | null; readonly packageJson: string | null; readonly esm: boolean; readonly exportsPublic: boolean; readonly typesPublic: boolean; readonly peerDependencies: readonly string[]; readonly familyRoot: string | null };
export type CordisAdmissionStatus = "passed" | "failed";
export type CordisAdmissionReport = { readonly status: CordisAdmissionStatus; readonly packages: readonly CordisPackageFingerprint[]; readonly hmrAbsent: boolean; readonly singleFamily: boolean; readonly forbiddenPackages: readonly string[]; readonly failures: readonly string[] };
export type CordisLifecycleProbe = { readonly settled: boolean; readonly disposed: boolean; readonly pendingServices: readonly string[] };
export type CordisEntryFact = { readonly entryId: string; readonly hasFiber: boolean; readonly state: "ACTIVE" | "PENDING" | "FAILED" | "DISPOSED"; readonly unresolvedServices: readonly string[]; readonly providedServices: readonly string[]; readonly error?: string };
export type CordisMountOptions = {
  readonly inject?: readonly string[];
  readonly provides?: readonly string[];
  readonly services?: Readonly<Record<string, unknown>>;
};
export type CordisEventService = {
  readonly dispatch?: (mode: string, args: unknown[]) => readonly ((...args: unknown[]) => unknown)[];
};
export type CordisContext = {
  readonly root?: CordisContext;
  readonly baseUrl?: string;
  readonly get?: (name: string) => unknown;
  readonly provide?: (name: string, value?: unknown) => unknown;
  readonly plugin?: (plugin: unknown, config?: unknown) => CordisFiberLike;
  readonly extend?: (meta?: Record<PropertyKey, unknown>) => CordisContext;
  readonly on?: (...args: readonly unknown[]) => unknown;
  readonly once?: (...args: readonly unknown[]) => unknown;
  readonly emit?: (...args: readonly unknown[]) => unknown;
  readonly parallel?: (...args: readonly unknown[]) => Promise<void>;
  readonly serial?: (...args: readonly unknown[]) => Promise<unknown>;
  readonly waterfall?: (...args: readonly unknown[]) => unknown;
  readonly events?: CordisEventService;
  readonly effect?: (...args: readonly unknown[]) => unknown;
  readonly fiber?: { readonly dispose: () => Promise<void> | void };
  readonly dispose?: () => Promise<void> | void;
  readonly reflect?: { readonly registry?: { readonly values?: () => Iterable<{ readonly state?: string | number; readonly inject?: readonly string[] }> } };
};
type CordisFiberLike = PromiseLike<unknown> & { readonly state?: number; readonly inject?: Record<string, unknown> };
export type CordisActivationScope = { readonly provide: (serviceId: string, value: unknown) => void; readonly context?: CordisContext };
export type CordisRootHandle = {
  readonly context: CordisContext;
  mount(entryId: string, activate: (scope: CordisActivationScope) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>, options?: CordisMountOptions): Promise<void>;
  getService<T = unknown>(serviceId: string): T | undefined;
  facts(): readonly CordisEntryFact[];
  awaitSettlement(): Promise<CordisLifecycleProbe>;
  dispose(): Promise<CordisLifecycleProbe>;
};
