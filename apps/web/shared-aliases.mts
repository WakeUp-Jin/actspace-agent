import { resolve } from "node:path";

// 与桌面端相同：@actspace/shared 直接走源码，改 shared 不用先 build。
const shared = resolve(__dirname, "../../packages/shared/src");
export const sharedAliases = {
  "@actspace/shared/model-catalog-data": `${shared}/generated/model-catalog.generated.ts`,
  "@actspace/shared/host-protocol": `${shared}/host-protocol/index.ts`,
  "@actspace/shared/runtime-v2": `${shared}/runtime-v2/index.ts`,
  "@actspace/shared/composer-reference-validation": `${shared}/composer-reference-validation.ts`,
  "@actspace/shared/session-list-page": `${shared}/session-list-page.ts`,
  "@actspace/shared/session-locator": `${shared}/session-locator.ts`,
  "@actspace/shared/session-selectors": `${shared}/session-selectors.ts`,
  "@actspace/shared": `${shared}/index.ts`,
};
