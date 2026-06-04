# Cache ratio needs cause classification

Related history: `docs/histories/2026-06/20260604-1936-cache-audit-diagnosis-script.md`

## Core Idea

A low prompt-cache hit ratio is a symptom, not a diagnosis. In an agent loop, the same 60% cache hit can mean very different things:

- the stable prefix changed, which is a bug or configuration drift;
- the message chain stopped being append-only, which can indicate replay, compaction, or recovery problems;
- the prefix and history are stable, but the newly appended tool results are large, which is often expected behavior;
- the client-side request shape looks fine, leaving cache warmup, expiry, or provider policy as likely causes.

## Why It Matters

If all low-cache calls are treated the same, teams tend to tune the wrong thing. Lowering tool output thresholds may help when the new suffix is huge, but it will not fix prefix drift. Conversely, debugging provider behavior will not fix a history rewrite that breaks append-only cache reuse.

## Practical Pattern

When analyzing cache loss, classify before optimizing:

1. Compare stable prefix hashes.
2. Compare per-message hashes to confirm append-only shape.
3. Measure the changed or appended suffix.
4. Count which roles and tools contributed to the suffix.
5. Only then decide whether to fix context stability, tool output size, or provider/cache warmup.

The key is to keep true usage facts separate from triage hints. Provider token/cache usage answers "how much cache was hit"; local context diffing answers "what probably caused it."

## Common Trap

Do not assume `cacheHit / (cacheHit + cacheMiss)` should always approach 100%. In a tool-heavy turn, every new tool result is fresh prompt content. A stable, append-only request can still show a modest cache ratio if the newly appended suffix dominates the request.
