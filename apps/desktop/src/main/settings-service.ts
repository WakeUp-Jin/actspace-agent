/**
 * SettingsService owns non-sensitive settings.json v4 and main-only 0600 secrets.json v2.
 * Legacy v1/v2/v3 files are accepted only as migration inputs and retain an on-disk backup.
 * Renderer-facing views contain status only; plaintext keys and runtime transports stay in main.
 *
 * 实现在 ./settings/ 下；这个文件只再导出原有的对外 API，调用方的 import 路径不变。
 */
export { SettingsService } from "./settings/service";
export { ProviderSettingsError, SettingsRevisionConflictError } from "./settings/types";
export type {
  CustomConnectionRuntimeConfig,
  ImageGenerationRuntimeConfig,
  ModelStorageMutationInput,
  PersistedSettingsV3,
  ProviderConnectionMutationInput,
  ProviderRuntimeError,
  SecretCrypto,
  SettingsServiceOptions,
  SettingsV4ChangeListener,
} from "./settings/types";
