# Text deletion APIs need line-boundary semantics

Related history: `docs/histories/2026-06/20260602-1407-edit-file-delete-semantics.md`

## What happened

`edit_file` supports deletion by passing `new_string: ""`. The obvious implementation is `content.replace(oldString, "")`, but that leaves a blank line when deleting a whole line. A tempting fix is to delete `oldString + "\n"` whenever possible.

That fix is too broad. If `oldString` is line-tail text, deleting `oldString + "\n"` silently merges the next line into the current line.

## Better rule

Treat newline deletion as a line-boundary operation:

- If the match starts at file start or immediately after `\n`, and the match ends immediately before `\n`, it is a whole-line deletion.
- Only in that whole-line case should the following newline be removed.
- Inline deletion should remove exactly the matched text and preserve surrounding line structure.

This keeps both common intents stable:

```txt
before
remove me
after
```

Deleting `remove me` should become:

```txt
before
after
```

But:

```txt
const label = prefix + suffix
next line
```

Deleting ` suffix` should become:

```txt
const label = prefix +
next line
```

not `const label = prefix +next line`.

## Diff stats trap

Unified diff file headers also start with `---` and `+++`, while real content lines can start with the same characters:

```diff
--- a/file
+++ b/file
@@ -1 +1 @@
---flag
+++flag
```

Counting lines by "starts with `+` or `-`, except `+++` / `---`" can either count headers or miss real content. A safer local rule is: only count changed lines after a hunk header (`@@ ... @@`). File headers live before hunks; changed content lives inside hunks.

## Takeaways

- Empty replacement is not just replacement; it often encodes deletion intent.
- Whole-line deletion and inline deletion need separate tests.
- Diff parsers do not need to be fancy, but stats should be hunk-aware.
- Include marker-looking content such as `---flag` / `+++flag` in tests when validating unified diff counters.
