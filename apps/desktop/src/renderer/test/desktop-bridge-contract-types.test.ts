import { describe, expectTypeOf, it } from "vitest";
import type { DesktopBridge } from "@actspace/shared/desktop-bridge";

/**
 * 类型层校验：`window.actspace` 的声明直接取自契约（13 T6 起）。
 * shared 的测试不参与 tsc，所以这组断言放在 desktop（renderer tsconfig 会检查它）。
 */
describe("desktop bridge contract types", () => {
  it("declares window.actspace from the contract", () => {
    expectTypeOf<Window["actspace"]>().toEqualTypeOf<DesktopBridge>();
    expectTypeOf<DesktopBridge["hosts"]["call"]>().parameter(0).toEqualTypeOf<import("@actspace/shared/desktop-bridge").HostCallInput>();
  });

  it("derives call signatures from the spec kind", () => {
    expectTypeOf<DesktopBridge["app"]["getBootstrapState"]>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<DesktopBridge["sessions"]["listPage"]>().parameter(0).toEqualTypeOf<import("@actspace/shared").SessionListPageInput | undefined>();
    expectTypeOf<DesktopBridge["dialogs"]["selectFiles"]>().parameters.toEqualTypeOf<[input?: { remote?: boolean } | undefined]>();
    expectTypeOf<DesktopBridge["tasks"]["abort"]>().returns.toEqualTypeOf<Promise<boolean>>();
    expectTypeOf<DesktopBridge["events"]["terminal"]>().returns.toEqualTypeOf<() => void>();
    expectTypeOf<DesktopBridge["appearance"]["setNativeTheme"]>().returns.toEqualTypeOf<void>();
  });
});
