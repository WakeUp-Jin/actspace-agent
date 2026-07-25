/**
 * Sheet —— 自研轻量级右侧滑入抽屉。
 *
 * 设计依据：`docs/design-docs/kairos/front-Kairos监控页规范.md` 第 2 节。
 * 行为目标对齐 shadcn `Sheet` (`side="right"`)：
 *   - Portal 到 document.body，避开布局副作用；
 *   - Overlay + Panel；
 *   - Esc / 点 Overlay / 点关闭按钮均可关闭；
 *   - 滑入 / 滑出动效，受 prefers-reduced-motion 控制；
 *   - 焦点 trap，关闭时焦点归还；
 *   - 打开时 body 滚动锁定（多 Sheet 嵌套时使用引用计数）。
 *
 * 显式不引入：Radix / react-focus-lock / portal 包。
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface SheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** 标题。Sheet 头部 `<h2>`；同时绑定 `aria-labelledby`。 */
  title: ReactNode;
  /** 副标题/描述。可选。 */
  description?: ReactNode;
  /** 头部右侧可放置自定义动作（如刷新按钮）；关闭按钮始终在最右侧由组件自管。 */
  headerActions?: ReactNode;
  /**
   * 面板宽度。默认 `min(520px, 92vw)`，符合 Kairos 上下文 Sheet 规范。
   * 调用方传字符串以便覆盖（如 `"min(640px, 96vw)"`）。
   */
  panelWidth?: string;
  /** 透传到 panel 节点的 data-testid，方便测试定位。 */
  testId?: string;
}

const focusableSelector =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), button:not([disabled]), iframe, object, embed, ' +
  '[tabindex]:not([tabindex="-1"]), [contenteditable=true]';

/**
 * 全局 body 滚动锁引用计数。
 * 多个 Sheet 同时打开时，只有第一个写入 overflow，最后一个关闭后恢复。
 */
let scrollLockCount = 0;
let originalBodyOverflow: string | null = null;

function acquireScrollLock(): void {
  if (typeof document === "undefined") return;
  if (scrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function releaseScrollLock(): void {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow ?? "";
    originalBodyOverflow = null;
  }
}

export function Sheet(props: PropsWithChildren<SheetProps>) {
  const { open, onOpenChange, title, description, headerActions, children, panelWidth, testId } = props;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
    acquireScrollLock();
    return () => {
      releaseScrollLock();
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === "function") {
        previouslyFocused.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        close();
        return;
      }
      if (ev.key !== "Tab" || !panelRef.current) return;
      // 不用 `offsetParent !== null` 过滤——jsdom 不计算布局会全部过滤掉；
      // 真正 hidden 的元素无法被 focus()，浏览器会自然跳过。
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((el) => !el.hasAttribute("data-focus-skip"));
      if (focusables.length === 0) {
        ev.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (ev.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          ev.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        ev.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open) return;
    // 用一个微任务把焦点交给关闭按钮；某些浏览器在 transition 开始时会吞掉同步 focus。
    // 若用户或调用方已先把焦点放进面板，不再抢回关闭按钮，避免首个 Tab 被意外跳过。
    const handle = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const active = document.activeElement;
      if (!panel || !panel.contains(active)) closeButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [open]);

  const portalTarget = useMemo<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  if (!open || !portalTarget) return null;

  const state = open ? "open" : "closed";
  const widthStyle = panelWidth ?? "min(520px, 92vw)";

  return createPortal(
    <div
      className="fixed inset-0 z-[1000]"
      data-state={state}
      data-testid={testId ? `${testId}-root` : undefined}
    >
      <div
        aria-hidden="true"
        data-state={state}
        onClick={close}
        className={
          "absolute inset-0 bg-overlay backdrop-blur-[1px] " +
          "transition-opacity duration-150 motion-reduce:transition-none " +
          "data-[state=open]:opacity-100 data-[state=closed]:opacity-0"
        }
        data-testid={testId ? `${testId}-overlay` : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-state={state}
        style={{ width: widthStyle }}
        className={
          "absolute top-0 right-0 flex h-screen max-w-full flex-col " +
          "border-l border-line bg-surface " +
          "shadow-act-soft " +
          "transition-transform duration-200 ease-out motion-reduce:transition-none " +
          "data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full"
        }
        data-testid={testId}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[17px] font-semibold text-text-main">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[13px] leading-[1.55] text-text-muted">{description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="关闭"
              onClick={close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-act-md border border-line bg-surface text-text-muted transition hover:border-line-strong hover:bg-surface-subtle"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    portalTarget,
  );
}
