# Settings page scroll boundary

Source task: `docs/histories/2026-05/20260531-0109-settings-scroll-pane.md`

## What

An app page that bypasses the normal split-view shell must define its own viewport-height boundary. Otherwise `overflow-y-auto` on an inner pane may not create a real scroll container, and the browser falls back to scrolling the document body.

## Why It Matters

Two-column desktop settings pages usually want a fixed navigation column and a scrollable detail column. If the outer page is only `height: 100%` while the root ancestors are merely `min-height`, content can expand the whole document. The left nav then moves with body scroll even though the right pane appears to have `overflow-y-auto`.

## Pattern

Lock the page shell first, then assign scrolling to the detail pane.

```tsx
<div className="flex h-screen min-h-0 flex-col overflow-hidden">
  <div className="flex min-h-0 flex-1 overflow-hidden">
    <nav className="h-full shrink-0">...</nav>
    <main className="min-h-0 flex-1 overflow-y-auto">...</main>
  </div>
</div>
```

Key points:

- `h-screen overflow-hidden` gives the page a fixed viewport boundary.
- `min-h-0` lets flex children shrink instead of forcing ancestors to grow.
- `overflow-hidden` on the row prevents accidental row-level scroll.
- `overflow-y-auto` belongs to the right pane, not the shared parent or document.

## Common Trap

`h-full` only works if every ancestor has a definite height. If the ancestor chain uses `min-height: 100%`, `h-full` can still let content define page height, so scroll ownership leaks upward to `body`.

## Self Check

- Does the outer page shell have a definite viewport height?
- Is the left nav outside the scrollable pane?
- Does the intended right pane have `scrollHeight > clientHeight` while the document body stays fixed?
