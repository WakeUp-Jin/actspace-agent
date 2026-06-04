# Self-Replacing Updaters Need a Two-Phase Boundary

Related history: `docs/histories/2026-06/20260605-0016-local-update-progress-and-delayed-exit.md`

## Core Idea

An app that replaces its own `.app` bundle should split update work into two phases:

1. **Build while the app is still alive.**
2. **Quit only when replacement is ready.**

The replacement phase needs the old app to exit, but the build phase usually does not. Collapsing both into "start helper, then quit immediately" makes failures feel like the app disappeared.

## Why It Matters

Self-replacing desktop apps have an awkward ownership boundary:

- The renderer needs progress feedback.
- The main process owns IPC and app lifecycle.
- The external helper keeps running after the app exits.

If progress only lives in renderer state, it vanishes exactly when replacement starts. If progress only lives in helper logs, the UI cannot show it before exit. The better shared fact source is a tiny status file next to the helper log.

## Pattern

Use a sidecar status file:

```txt
<userData>/tmp/local-update/
  run-local-update.sh
  update.log
  status.json
```

The helper writes coarse phases:

```json
{
  "phase": "building",
  "message": "正在从源码构建 Actspace.app…",
  "startedAt": "2026-06-04T15:00:00.000Z",
  "updatedAt": "2026-06-04T15:00:01.000Z"
}
```

Then:

- Renderer polls `getState()` and displays the phase.
- Main polls the same status and only calls `app.quit()` after `ready_to_replace`.
- Helper validates the newly built app before asking the current app to quit.
- Helper waits for the app PID to exit, replaces the bundle, reopens the app, and rolls back if reopening fails.

The validation step should check the things macOS will need at launch time, not just whether a directory exists:

```sh
/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "Actspace.app/Contents/Info.plist"
test -x "Actspace.app/Contents/MacOS/Actspace"
codesign --verify --no-strict --verbose=2 "Actspace.app"
```

For local self-updates, the helper can default to ad-hoc signing when no Developer ID identity or explicit signing mode is set. That keeps local source builds launchable without pretending to be a real notarized distribution.

## Common Traps

- **GUI apps often do not inherit shell PATH.** On macOS, Homebrew `pnpm` may be invisible unless the helper adds `/opt/homebrew/bin` or resolves an absolute command path.
- **`running` cannot be only in memory.** Once the helper writes `failed`, main must treat the update as retryable, even if an earlier in-memory flag said it had started.
- **Logs are not UI state.** Logs are for diagnosis; a small structured status file is easier to render and test.
- **Do not quit at helper spawn time.** Helper spawn only proves the update process started, not that the new app is ready.
- **A copied bundle is not necessarily launchable.** `ditto` can succeed while macOS later rejects the app because the signature or executable metadata is wrong.
- **Backup cleanup must wait until launch succeeds.** If `open "$TARGET_APP"` fails, `.previous-local-update` is not stale clutter; it is the rollback source.

## Self-Check

- Which phase actually requires the current app to exit?
- What status source survives after the app exits?
- If `pnpm` is missing in a GUI-launched helper, how will the user see that failure?
- What should the helper verify before it renames the old app out of the way?
- When is it safe to delete the `.previous-local-update` backup?
