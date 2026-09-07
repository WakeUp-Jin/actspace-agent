# Agent Runtime audit follow-up

## User request

Review the ActSpace backend design against the DeepSeek Harness reference and apply the approved first adjustments.

## Changes

- Removed the caller supplied `inboxClaimed` flag from `RunTurnInput`.
- AgentLoop now checks the durable Session Journal for an existing `user/message` before materializing a direct message.
- Follow-up execution continues to claim Inbox entries before starting the turn while avoiding duplicate user surface events.
- Retry attempts now re-read the current Session surface and re-run prompt assembly before creating the next request context snapshot.
- SessionHandle now exposes `durabilityState` so Hosts can distinguish a healthy, blocked, or closed writer from an Agent execution error.
- Added `classifySessionRecoveryAccess` and RuntimeSessionController recovery access reporting for read-write, read-only, and forensic-required Journal states.
- Added regression coverage for all recovery access classifications, including torn-tail Journals.
- Updated the trajectory renderer test to assert projection-level stable identity under virtualized rendering; full workspace tests are green.

## Design reason

Recovery semantics should come from the Journal rather than a process-local boolean passed between Host and AgentLoop. This keeps direct input and claimed Inbox input consistent across CLI, Desktop, and follow-up paths. Re-assembling retry context makes each provider request reflect durable Session changes that occurred after the failed attempt.

## Verification

Targeted AgentLoop tests and typecheck pass. The full workspace currently has an unrelated trajectory renderer test failure in the existing dirty worktree.
