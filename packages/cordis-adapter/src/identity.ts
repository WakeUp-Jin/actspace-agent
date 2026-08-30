export type PluginId = string & { readonly __pluginId: unique symbol };
export type EntryId = string & { readonly __entryId: unique symbol };
export type ServiceId = string & { readonly __serviceId: unique symbol };
export type EventTypeId = string & { readonly __eventTypeId: unique symbol };
export type ContributionId = string & { readonly __contributionId: unique symbol };
const ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
export function pluginId(value: string): PluginId { return validate(value, "plugin") as PluginId; }
export function entryId(value: string): EntryId { return validate(value, "entry") as EntryId; }
export function serviceId(value: string): ServiceId { return validate(value, "service") as ServiceId; }
export function eventTypeId(value: string): EventTypeId { return validate(value, "event") as EventTypeId; }
export function contributionId(value: string): ContributionId { return validate(value, "contribution") as ContributionId; }
function validate(value: string, kind: string): string { if (!ID.test(value)) throw new Error(`Invalid ${kind} id: ${value}`); return value; }

