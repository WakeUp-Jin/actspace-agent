# browser-bridge

`browser-bridge` is the Browser Use / Agent Browser Bridge plugin for actspace external capabilities. It exposes a self-describing `abb` CLI, a Chrome Native Messaging host, a local RPC broker, a Chrome extension backend, and a shared protocol package.

This plugin is a **host-bridge plugin**: unlike `fs-watch`, it does not communicate with the host only through JSONL files. Browser control requires Chrome Native Messaging, a local socket, and extension permissions.

## Layout

```text
plugins/browser-bridge/
├── apps/
│   ├── cli/                 # abb CLI, native host, local RPC broker
│   └── chrome-extension/    # Chrome extension backend
├── packages/
│   └── protocol/            # Go protocol contracts and frame helpers
├── docs/
│   ├── design-docs/         # design and implementation alignment notes
│   └── releases/            # readiness notes
├── skill/                   # distributable Agent skill wrapper
└── build.sh                 # builds skill/scripts/abb
```

## Build

```sh
./plugins/browser-bridge/build.sh
```

From the repository root, this also works:

```sh
./scripts/build.sh browser-bridge
```

The build writes the `abb` binary to `plugins/browser-bridge/skill/scripts/abb`.

## Local Checks

```sh
cd plugins/browser-bridge
GOCACHE=/private/tmp/abb-go-cache go test ./packages/protocol/... ./apps/cli/...
node --check apps/chrome-extension/src/background.js
```

## Manual Chrome Validation

After loading the unpacked Chrome extension and installing the Native Messaging host, run the readiness checklist in:

- `docs/releases/browser-bridge-phase1-to-phase6-readiness.md`

The current code has the extension backend command surface implemented, but final readiness still depends on real Chrome profile validation.

## Source Migration

This plugin was migrated from the standalone `agent-browser-bridge` repository. Keep that repository as historical source context until this plugin path has been fully validated and adopted by actspace-agent.
