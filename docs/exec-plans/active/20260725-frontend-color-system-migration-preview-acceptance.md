# Ink & Emerald visual preview acceptance record

## Status

- Artifact: `docs/design-docs/public/front/ink-emerald-color-preview.html`
- Review state: approved by user on 2026-07-25
- Renderer code changed: yes, in the subsequent production migration
- Production tokens changed: yes

## Scope shown

### Sidebar

- normal
- hover
- selected
- selected + running
- running
- waiting approval
- failed
- keyboard focus

### Composer

- focused shell
- attachment
- selected mode
- Toggle on
- context warning
- running feedback
- ink send action
- disabled send

### Settings

- neutral nav selected
- neutral group surface
- Toggle on / off
- neutral input focus
- connected / waiting / failed status
- action / secondary / danger buttons

## Candidate accessibility calibration

The preview intentionally differs from the starting values in `DESIGN.md`. The user approved the preview and these calibrated values are now production tokens:

| Token | Starting value | Preview candidate | Reason |
|---|---|---|---|
| Light text-faint | `#92928C` | `#72726B` | 4.52:1 against app background |
| Dark text-faint | `#85857E` | `#96968F` | 5.93:1 against app background |
| Light warning | `#A87218` | `#91600E` | 5.41:1 against surface |
| Light line-strong | `#C9C9C3` | `#8C8C85` | 3.38:1 control boundary against surface |
| Dark line-strong | `#484943` | `#787870` | 3.46:1 control boundary against surface |

The selected surface remains intentionally subtle: 1.11:1 in Light and 1.26:1 in Dark. The preview therefore adds text weight and a monochrome current glyph. A production selected state must not rely on fill difference alone.

## Browser verification

Verified in the Codex in-app browser through a temporary `127.0.0.1` static server.

| Check | Result |
|---|---|
| 1440 × 900 Light | passed |
| 1440 × 900 Dark | passed |
| System-Light resolves to Light palette | passed |
| System-Dark resolves to Dark palette | passed |
| 1100 × 720 compact layout | passed |
| Horizontal overflow at 1100 px | none |
| Runtime console errors | none |
| Contrast matrix refreshes after mode switch | passed |
| Reduced-motion fallback declared | passed by source inspection |

All measured text, semantic foreground, strong control boundary, and focus-ring pairs meet the thresholds displayed in the preview. The selected fill is the only deliberate caveat and is paired with redundant visual cues.

## Approval result

The user reported that the preview looked correct and approved proceeding through the remaining milestones in one worktree delivery.

## Questions used for approval

1. Is the Light background warm enough without looking yellow?
2. Is the Sidebar / workspace surface difference visible on the actual Retina screen?
3. Is selected clear enough without blue or green?
4. Does the ink action feel primary without becoming a large black block?
5. Is emerald limited to running, enabled, connected, and success signals?
6. Does Dark remain warm charcoal rather than black-green neon?
7. Are the darker candidate text-faint and line-strong values still visually restrained enough?

## Gate

Gate passed. The implementation uses the current worktree's 36-file / 147-line renderer snapshot as the delivery baseline. The four extra Settings files in the canonical dirty working tree belong to an uncommitted multi-provider feature and were intentionally not copied across feature boundaries; the new guard will reject legacy color consumers when those files are later integrated.
