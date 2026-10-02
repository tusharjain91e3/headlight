# Headlight v2 — Design Spec

Extends `2026-10-02-headlight-design.md` and `docs/PRD.md`. Only deltas are listed.

## Intent
More demo impact while keeping the minimal, clean UI. Sentiment colors unchanged (green/red/yellow/grey). No sign-in, `localStorage` only.

## Decisions (user-approved)
- Pulse covers the **Nifty 50 only** (all 50 verified present in `equity_symbols.json`).
- **No model fallback chain** (user declined). Known risk: scanning 50 stocks on a free model can hit 429s. Mitigation inside scope: scan concurrency 2, partial results kept, failed tiles retryable, stale cache served.
- Adding from Search goes to the **active** watchlist; no list picker.

## 1. Multiple watchlists
- Storage key `stockfeed:watchlists:v2`: `{ activeId: string, lists: [{ id, name, createdAt, items: [{symbol, addedAt}] }] }`.
- Migration: if v2 is absent and `stockfeed:watchlist:v1` exists, create one list "My watchlist" from it. v1 key is left untouched (safe rollback).
- Limits: 8 lists, 25 stocks per list (existing cap). A fresh install gets one list named "My watchlist".
- UI: chip row under the header on the Watchlist tab: `[name count] … [+ New]`. Active chip shows **Rename** and **Delete**.
- Rename is inline: Enter saves, Esc cancels. Trimmed name must be 1–24 chars and unique (case-insensitive); otherwise inline error, no save.
- Cannot delete the last list. Delete is undoable via toast. New list is named "Watchlist N" and becomes active.
- Search button text: "+ Add to {active list}" / "✓ In {active list}"; at 25 stocks "List full".
- Sentiment data stays keyed by symbol (shared across lists; no extra pipeline runs). Cross-tab `storage` sync retained. Corrupt/blocked storage behaves as in v1 (in-memory fallback + notice).

## 2. "What changed" badges
- Sentiment cache entries gain `prev?: { label, at }`. When a newly stored result's label differs from the existing cached label, `prev` = old label with the old entry's timestamp (the time the change was detected = now, stored as `changedAt`).
- Cards show `Neutral → Negative · 2h ago` while `changedAt` is within 7 days. Persisted only for non-transient results.
- `DEMO_MODE`: a manual refresh (`?refresh=1`) deterministically rotates the label of a few seeded stocks (TCS, RELIANCE, ADANIENT, IDEA) so the badge can be shown live.

## 3. Market Pulse (tab)
- Constant `NIFTY_50` (50 symbols) in `lib/indices.ts`.
- Tile grid, one tile per stock: symbol + label color fill; unscanned tiles are outlined (visually distinct from grey "Cannot determine"); failed tiles show a retry affordance. Click opens the detail panel.
- Summary bar reuses the spectrum bar + counts, plus "N / 50 analyzed". "Scan Nifty 50" button; auto-starts on first open. Uses the existing client sentiment cache (second visit instant), concurrency 2.
- Responsive grid: 3 cols on phone, up to 10 on desktop. Tiles are buttons with accessible names ("TCS, Positive").

## 4. Compare (tab)
- Two slots (A, B) using the same debounced autocomplete as Search; each selection runs the pipeline once and shares the results cache.
- Side by side (stacked on mobile): label pill, confidence meter, rationale, article-sentiment mini bar (counts by label), article list.
- Detail panel gets "Compare with…" which opens the Compare tab with slot A filled.

## Navigation
Watchlist · Pulse · Search · Compare. On narrow screens the wordmark collapses to the icon so four tabs fit without horizontal scroll (verify at 360px).

## Testing
Unit tests for: v1→v2 migration, list create/rename/delete/undo/limits/uniqueness, name validation, change-detection (`prev`/`changedAt`), badge window, Nifty-50 list integrity (50 unique, all in universe), pulse tally logic, compare tally logic. Visual checks via headless Chrome at 360/390/1100px, light and dark.

## Out of scope
Fallback chain, sector views, list picker on add, drag-reorder, sharing lists, price data.
