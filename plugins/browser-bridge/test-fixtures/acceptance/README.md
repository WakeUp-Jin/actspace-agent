# Browser Bridge Acceptance Fixture

This fixture is a deterministic local target for Plan 5 real-Chrome acceptance. It has no external dependencies and does not submit data to a remote service.

## Start

From the repository root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory plugins/browser-bridge/test-fixtures/acceptance
```

Open `http://127.0.0.1:4173/index.html`.

With the Extension and Native Host connected, run the deterministic smoke test:

```bash
node plugins/browser-bridge/test-fixtures/acceptance/smoke.cjs
```

The I/O smoke downloads `browser-bridge-sample.txt`, performs a fixed clipboard text roundtrip, and restores the previous clipboard text without printing it:

```bash
node plugins/browser-bridge/test-fixtures/acceptance/io-smoke.cjs
```

Use `--download-only` or `--clipboard-only` to isolate one I/O path.

To verify user-tab claim and handoff, first open `page-two.html` manually in Chrome, then run:

```bash
node plugins/browser-bridge/test-fixtures/acceptance/claim-smoke.cjs
```

To verify the real Agent Core approval and denial path against Chrome:

```bash
node plugins/browser-bridge/test-fixtures/acceptance/agent-approval-smoke.cjs
```

To verify deliverable finalization and ownership release:

```bash
node plugins/browser-bridge/test-fixtures/acceptance/deliverable-smoke.cjs
```

To verify that one Agent browser session cannot finalize another session's handoff tabs:

```bash
node plugins/browser-bridge/test-fixtures/acceptance/session-isolation-smoke.cjs
```

## Stable selectors

- `#fixture-title`, `#fixture-status`
- `#name-input`, `#notes-input`, `#color-select`, `#agree-checkbox`
- `#apply-button`, `#click-counter`, `#result-output`
- `#file-input`, `#file-output`, `#download-link`
- `#console-button`, `#console-output`, `#page-two-link`
- `#drag-source`, `#drop-target`
- `#scroll-stage`, `#scroll-target`

## Expected form state

After filling name `ActSpace`, notes `Plan 5`, selecting `green`, checking the checkbox and clicking Apply, `#result-output` contains:

```json
{
  "name": "ActSpace",
  "color": "green",
  "notes": "Plan 5",
  "agreed": true,
  "applied": 1
}
```

The object also contains counters and file/drag state used by the remaining acceptance cases.
