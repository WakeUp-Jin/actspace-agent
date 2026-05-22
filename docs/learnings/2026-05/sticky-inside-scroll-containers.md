# Sticky inside scroll containers

Source task: `docs/histories/2026-05/20260522-1547-sticky-message-turns.md`

## What

`position: sticky` sticks inside the nearest scrolling ancestor. If the page itself scrolls instead of the intended panel, the sticky element may look correct in markup but behave incorrectly in the product.

## Why It Matters

Agent workspaces often have a fixed app shell, a fixed composer, and a middle scrollable transcript. A sticky turn prompt should belong to the transcript scroll area, not to the document body. Otherwise the prompt can drift with the full page or fail to hand off cleanly to the next prompt.

## Pattern

Make the app shell own the viewport height, then let the center region be the only vertical scroll container.

```css
.app-shell {
  height: 100vh;
  overflow: hidden;
}

.content-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100vh;
  min-height: 0;
}

.scroll-region {
  min-height: 0;
  overflow: auto;
}

.sticky-header {
  position: sticky;
  top: 0;
}
```

## Common Trap

Using `min-height: 100vh` on the outer shell lets content expand the document. The browser then scrolls the page body, while the intended panel has no real internal scroll range. The sticky element is still `position: sticky`, but it is sticky in the wrong scrolling context.

## Self Check

- Does the intended scroll panel have `scrollHeight > clientHeight`?
- Does `document.documentElement.scrollHeight` stay close to the viewport height?
- Does the next sticky item push the previous one away at the panel top?
