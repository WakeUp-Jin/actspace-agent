import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

type ToastItem = { readonly id: number; readonly message: string; readonly tone: "info" | "danger"; readonly action?: { readonly label: string; readonly run: () => void }; readonly sticky: boolean };
type ToastApi = { show(message: string, options?: { tone?: "info" | "danger"; action?: ToastItem["action"]; sticky?: boolean }): number; dismiss(id: number): void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("ToastProvider is missing");
  return api;
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems(list => list.filter(item => item.id !== id)), []);
  const show = useCallback<ToastApi["show"]>((message, options = {}) => {
    const id = next.current++;
    const item: ToastItem = { id, message, tone: options.tone ?? "info", ...(options.action ? { action: options.action } : {}), sticky: options.sticky ?? false };
    setItems(list => [...list.slice(-2), item]);
    if (!item.sticky) setTimeout(() => dismiss(id), 4_000);
    return id;
  }, [dismiss]);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-(--act-z-popover) flex flex-col items-center gap-2 px-4">
        {items.map(item => (
          <div key={item.id} className={cx("glass glass-strong anim-fade pointer-events-auto flex max-w-[480px] items-center gap-3 rounded-act-pill py-2 pl-4 pr-2 text-act-md", item.tone === "danger" ? "text-danger" : "text-text-main")}>
            <span className="min-w-0 flex-1">{item.message}</span>
            {item.action ? (
              <button type="button" className="min-h-9 rounded-act-pill bg-action px-3 text-act-sm font-semibold text-on-action" onClick={() => { item.action!.run(); dismiss(item.id); }}>
                {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
