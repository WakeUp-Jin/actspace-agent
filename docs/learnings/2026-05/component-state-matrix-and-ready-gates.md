# Component State Matrix and Ready Gates

## What This Means

When a component has several visual forms, model it with a small state matrix before writing layout branches. For Composer, the useful axes were:

- `surface`: where the component lives (`initial` or `followup`).
- `inputLayout`: how the input is arranged (`inline` or `stacked`).

This creates clear combinations instead of naming every screenshot as its own component.

## Why It Matters

Without a matrix, UI code drifts into one-off conditions:

```tsx
if (hasAttachments) ...
if (isNewChat) ...
if (isDarkMock) ...
```

Those branches become hard to test because each one quietly changes several responsibilities at once. A matrix separates the product question from the layout question:

- Is this new chat or existing chat?
- Is the input inline or stacked?

## The Hidden Trap

Initial UI often appears before async data finishes loading. In Electron bridge mode, App first renders before the real session record is restored. If a composer is clickable during that temporary state, the user can type into a node that will soon be replaced.

The fix is a ready gate:

```tsx
const isSessionReady = Boolean(sessionRecord || turnResult || streamingBlocks.length > 0 || !hasActspaceBridge());
```

Then render the initial composer only after the session is real:

```tsx
const isInitialComposer = isSessionReady && messages.length === 0 && !isStreaming;
```

## Takeaways

- Use a state matrix when a component has more than two meaningful visual forms.
- Keep axes independent: product surface is not the same as input layout.
- Add ready gates before rendering interactive empty states backed by async data.
- Test DOM ownership, not CSS classes, when layout structure is the behavior.

## Related Change

- `docs/histories/2026-05/20260529-1414-composer-layout-variants.md`
