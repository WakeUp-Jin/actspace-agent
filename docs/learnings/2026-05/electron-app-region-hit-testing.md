# Electron app-region hit testing

Related history: `docs/histories/2026-05/20260528-0334-right-panel-tab-hit-test.md`

## What happened

Electron custom titlebars often use `-webkit-app-region: drag` so a frameless window can still be moved. That region participates in native hit testing before normal DOM click dispatch. If an interactive element visually overlaps a drag region, real mouse clicks can be consumed by the window manager even though React tests, accessibility actions, and DOM handlers all look correct.

## Why it is tricky

This class of bug is easy to misread as broken state, a missing `onClick`, or an IPC failure. In this case, Kairos controls worked through the accessibility tree and lower buttons could be clicked, but the right panel tabs lived inside the top chrome strip. The tab UI was visible and React-rendered correctly, while real mouse clicks were intercepted by Electron's drag hit-test path.

## Pattern

When a clickable control appears inside or above the custom titlebar area:

```css
.clickable-control {
  -webkit-app-region: no-drag;
}
```

Use `pointer-events` to manage web-layer overlays, and use `-webkit-app-region: no-drag` to manage Electron native hit testing. They solve different layers of the same visual overlap problem.

## Checklist

- If testing-library clicks pass but real Electron clicks fail, inspect `-webkit-app-region` first.
- Every button, tab, input, menu trigger, and resize handle inside a drag strip should explicitly opt out with `no-drag`.
- Verify at least once in the real Electron window; browser mock mode cannot prove native hit testing behavior.
