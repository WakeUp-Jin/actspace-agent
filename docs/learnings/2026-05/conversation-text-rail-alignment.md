# Conversation Text Rail Alignment

Related history: `docs/histories/2026-05/20260524-1827-align-conversation-text-rail.md`

## Core Idea

When aligning chat UI text vertically, compare the actual text start position, not just the container left edge.

For bordered cards and inputs, the visible text starts at:

```text
element.x + border-left-width + padding-left
```

For unbordered assistant prose, the visible text starts at:

```text
element.x + padding-left
```

If these formulas do not resolve to the same value, the UI will feel misaligned even when the outer containers appear to share a width.

## Why This Matters

Chat surfaces often mix:

- user message cards with borders and padding
- assistant prose without a card frame
- tool logs and thinking summaries as unframed status text
- tool result cards such as Bash approvals and diff previews
- a fixed Composer footer outside the scrollable message container

Those three areas can each look locally correct while still missing a shared reading rail. The result is subtle: nothing is obviously broken, but the eye keeps jumping left and right between turns.

## The Scrollbar Gutter Trap

If the message list uses:

```css
scrollbar-gutter: stable both-edges;
```

the scroll container reserves horizontal gutter space. A Composer outside that scroll container does not automatically reserve the same space, so it can drift wider than the message rail at responsive widths.

The fix is to make the footer participate in the same gutter model, or otherwise explicitly account for the same reserved space. Prefer matching the layout mechanism over hard-coding scrollbar widths, because scrollbar size varies by platform and browser settings.

## Practical Check

Use the browser to measure representative elements:

```js
const textStart = rect.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
```

Check desktop and at least one narrow breakpoint. A layout can be aligned at max width but drift once `calc(100% - padding * 2)` and scrollbar gutters start interacting.

## Takeaways

- Align reading rails by computed text start, not visual guesswork.
- Border width counts when matching bordered cards to unbordered prose.
- Treat tool/status output as part of the same reading flow as user and assistant text.
- Fixed footers and scrollable message bodies need the same width and gutter rules.
- Responsive verification should include numerical geometry checks, not only screenshots.
