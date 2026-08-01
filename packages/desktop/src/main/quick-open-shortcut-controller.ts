import type {
  AppSettings,
  QuickOpenShortcutSettings,
  QuickOpenShortcutStatus,
} from "@actspace/shared";

export interface GlobalShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export class QuickOpenShortcutController {
  private activeAccelerator: string | null = null;
  private status: QuickOpenShortcutStatus;

  constructor(
    private readonly registrar: GlobalShortcutRegistrar,
    private readonly onTrigger: () => void,
    initialAccelerator: string,
  ) {
    this.status = { registered: false, accelerator: initialAccelerator };
  }

  activate(settings: QuickOpenShortcutSettings): QuickOpenShortcutStatus {
    if (!settings.enabled) {
      this.unregisterActive();
      return this.setStatus(false, settings.accelerator);
    }
    if (this.activeAccelerator === settings.accelerator) {
      return this.setStatus(true, settings.accelerator);
    }
    if (!this.tryRegister(settings.accelerator)) {
      return this.setStatus(false, settings.accelerator, "快捷键已被系统或其他应用占用。");
    }
    this.unregisterActive();
    this.activeAccelerator = settings.accelerator;
    return this.setStatus(true, settings.accelerator);
  }

  async update(
    current: QuickOpenShortcutSettings,
    next: QuickOpenShortcutSettings,
    persist: () => Promise<AppSettings>,
  ): Promise<{ ok: true; settings: AppSettings; status: QuickOpenShortcutStatus } | { ok: false; error: string; status: QuickOpenShortcutStatus }> {
    const needsNewRegistration = next.enabled && this.activeAccelerator !== next.accelerator;
    if (needsNewRegistration && !this.tryRegister(next.accelerator)) {
      const error = "快捷键已被系统或其他应用占用。";
      return { ok: false, error, status: this.setStatus(Boolean(this.activeAccelerator), current.accelerator, error) };
    }

    try {
      const settings = await persist();
      if (!next.enabled) {
        this.unregisterActive();
        return { ok: true, settings, status: this.setStatus(false, next.accelerator) };
      }
      if (needsNewRegistration) {
        const previousAccelerator = this.activeAccelerator;
        this.activeAccelerator = next.accelerator;
        if (previousAccelerator) this.registrar.unregister(previousAccelerator);
      }
      return { ok: true, settings, status: this.setStatus(true, next.accelerator) };
    } catch (cause) {
      if (needsNewRegistration) this.registrar.unregister(next.accelerator);
      const error = cause instanceof Error ? cause.message : "快捷键设置保存失败。";
      return { ok: false, error, status: this.status };
    }
  }

  getStatus(): QuickOpenShortcutStatus {
    return { ...this.status };
  }

  dispose(): void {
    this.unregisterActive();
  }

  private tryRegister(accelerator: string): boolean {
    try {
      return this.registrar.register(accelerator, this.onTrigger);
    } catch {
      return false;
    }
  }

  private unregisterActive(): void {
    if (!this.activeAccelerator) return;
    this.registrar.unregister(this.activeAccelerator);
    this.activeAccelerator = null;
  }

  private setStatus(registered: boolean, accelerator: string, error?: string): QuickOpenShortcutStatus {
    this.status = { registered, accelerator, ...(error ? { error } : {}) };
    return this.getStatus();
  }
}
