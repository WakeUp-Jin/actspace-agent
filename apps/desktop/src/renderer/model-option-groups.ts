import {
  PROVIDER_IDS,
  PROVIDER_REGISTRY,
  type LlmProviderId,
} from "@actspace/shared";

export type ProviderModelOptionLike = {
  provider: LlmProviderId;
  label: string;
  apiModel: string;
};

export type ProviderModelGroup<T extends ProviderModelOptionLike> = {
  provider: LlmProviderId;
  label: string;
  models: T[];
};

function normalizeModelLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

export function groupModelsByProvider<T extends ProviderModelOptionLike>(models: T[]): ProviderModelGroup<T>[] {
  return PROVIDER_IDS.map((provider) => ({
    provider,
    label: PROVIDER_REGISTRY[provider].label,
    models: models.filter((model) => model.provider === provider),
  })).filter((group) => group.models.length > 0);
}

export function hasDuplicateModelLabel<T extends ProviderModelOptionLike>(model: T, models: T[]): boolean {
  const normalizedLabel = normalizeModelLabel(model.label);
  return models.filter((candidate) => normalizeModelLabel(candidate.label) === normalizedLabel).length > 1;
}

export function hasDuplicateModelLabelWithinProvider<T extends ProviderModelOptionLike>(
  model: T,
  models: T[],
): boolean {
  const normalizedLabel = normalizeModelLabel(model.label);
  return models.filter((candidate) =>
    candidate.provider === model.provider && normalizeModelLabel(candidate.label) === normalizedLabel).length > 1;
}

export function formatSelectedModelLabel<T extends ProviderModelOptionLike>(model: T, models: T[]): string {
  if (!hasDuplicateModelLabel(model, models)) return model.label;

  const providerLabel = PROVIDER_REGISTRY[model.provider].label;
  return hasDuplicateModelLabelWithinProvider(model, models)
    ? `${model.label} · ${providerLabel} · ${model.apiModel}`
    : `${model.label} · ${providerLabel}`;
}
