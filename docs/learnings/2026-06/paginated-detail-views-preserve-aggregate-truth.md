# Paginated Detail Views Preserve Aggregate Truth

Related history: `docs/histories/2026-06/20260604-1954-usage-request-details.md`

## Core Idea

When a page has both aggregate cards and a paginated detail table, pagination should apply only to the detail view model, not to the fact set used by the aggregates.

The query should still scan the full time window, compute totals and distributions from all matching facts, then slice only the rows meant for the table.

## Why It Matters

Usage pages usually mix two jobs:

- Answer "how much did I spend in this range?"
- Let the user inspect individual rows without loading an overwhelming table.

If `page=2` is applied before aggregation, the headline totals, model distribution, cache ratio, and daily rows silently become "page 2 totals" instead of "range totals." That looks plausible but corrupts the mental model of the page.

## Practical Pattern

Build full aggregates first:

```ts
const rows = buildRequestRows(requestRows).sort(newestFirst);
const summary = buildSummary(allEvents);
const dailyRows = buildDailyRows(allEvents);
```

Then paginate only the table rows:

```ts
const pageInfo = normalizePage(input.page, rows.length);
return {
  summary,
  dailyRows,
  requestRows: rows.slice(start, start + pageInfo.pageSize),
  requestRowsPage: pageInfo,
};
```

The UI can now request page 2 while every non-table widget stays anchored to the same full range.

## Common Traps

- Do not filter the event stream by page before reducing summary totals.
- Do not let the UI infer total pages from `requestRows.length`; that is only the current page length.
- Keep page size fixed unless the product explicitly needs a user-controlled page-size selector.
- Clamp invalid pages after total row count is known, so empty datasets still return a stable `page=1,totalPages=1`.

## Self Check

1. If the user clicks "next page," should the main token total change?
2. Does the response include both current rows and total row count?
3. Is page clamping done before or after knowing the total detail row count?
