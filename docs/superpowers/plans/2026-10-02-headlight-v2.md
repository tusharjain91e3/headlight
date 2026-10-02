# Headlight v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multiple renameable watchlists, "what changed" badges, a Nifty 50 Market Pulse heatmap tab, and a Compare tab to Headlight.

**Architecture:** Pure, unit-tested modules (`lib/lists.ts`, `lib/changes.ts`, `lib/tally.ts`, `lib/indices.ts`) hold all new logic. Hooks wrap them with `localStorage` (`useWatchlists` replaces `useWatchlist`; `useSentiment` gains change tracking, `concurrency`, `auto`, `scan`). Shared UI pieces (`useAnalyze`, `StockPicker`, `SpectrumBar`) are extracted first so Search, Pulse and Compare reuse them.

**Tech Stack:** Existing: Next.js 15 App Router, TypeScript, Tailwind v4, zod, Vitest + Testing Library (Node 18; do not upgrade).

**Spec:** `docs/superpowers/specs/2026-10-02-headlight-v2-design.md` (builds on `2026-10-02-headlight-design.md` and `docs/PRD.md`).

## Global Constraints

- Project root `/Users/tusharsjain/Desktop/headlight`. Never read, print or quote `.env.local` (real secrets). Never call live SerpApi/OpenRouter in tests; use `DEMO_MODE=1` for manual checks.
- Storage: `stockfeed:watchlists:v2` = `{activeId, lists:[{id,name,createdAt,items:[{symbol,addedAt}]}]}`. v1 key `stockfeed:watchlist:v1` is migrated once into list "My watchlist" and **never modified or deleted**. Sentiment cache key `stockfeed:sentiment:v1` keeps its shape plus optional `prev`.
- Limits: 8 lists, 25 stocks per list, list name 1–24 chars after trim, unique case-insensitively. Cannot delete the last list.
- Sentiment colors only: positive=green (`--pos`), neutral=yellow (`--neu`), negative=red (`--neg`), cannot_determine=grey (`--unk`). Unscanned Pulse tiles are **outlined, not filled** (distinct from grey).
- Pulse = **Nifty 50 only**, scan concurrency 2. No model fallback chain (declined). No list picker on add (adds to active list).
- Badge shows `From → To · time ago` for 7 days after a label change; first-ever result and `transient` results never create a badge.
- Tabs: Watchlist · Pulse · Search · Compare. No horizontal scroll at 360px (wordmark collapses to icon on narrow screens).
- Test-first for every logic change; all tests, `npx tsc --noEmit`, `npx eslint .`, `npm run build` must pass at the end. Visual check via headless Chrome (puppeteer-core in the scratchpad) in light/dark at 360/390/1100px.

## Review Focus

- Corrupt/partial v2 JSON, or v2 absent with garbage v1 → default single list, no crash; v2 present AND v1 present → v2 wins and v1 stays untouched.
- Rename edge cases: whitespace-only, 25+ chars, case-variant duplicate, renaming to its own current name (allowed), rename while another tab changed the lists.
- Deleting the active list activates a neighbor; undo restores the list at its old index AND re-activates it; deleting the last list is blocked.
- An unknown symbol (404) is dropped from **every** list, not only the active one.
- Pulse partial failure (some 429/errors): counts stay correct (`analyzed` ≠ `total`), failed tiles show retry, other tiles unaffected; leaving and re-entering the tab never double-fetches in-flight symbols.

## File Structure

```
lib/lists.ts          pure list-state logic            tests/lists.test.ts
lib/changes.ts        pure change detection            tests/changes.test.ts
lib/tally.ts          pure label counting              tests/tally.test.ts
lib/indices.ts        NIFTY_50 constant                tests/indices.test.ts
lib/demo.ts           (modify) refresh label flip      tests/demo.test.ts
lib/analyze.ts        (modify) pass refresh to demo
hooks/useWatchlists.ts (replaces useWatchlist.ts)      tests/useWatchlists.test.tsx
hooks/useSentiment.ts (modify) prev/changes, options, scan
hooks/useAnalyze.ts   shared "pick a stock → run pipeline" state
components/StockPicker.tsx, SpectrumBar.tsx, ListBar.tsx, ChangeBadge.tsx,
           PulseView.tsx, CompareView.tsx
components/Header.tsx, StockCard.tsx, WatchlistButton.tsx, WatchlistView.tsx,
           SearchView.tsx, StockDetail.tsx (modify)
app/page.tsx          (modify) wiring
```

---

### Task 1: List state logic (TDD, pure)

**Files:** Create `lib/lists.ts`, `tests/lists.test.ts`.

**Interfaces — Produces:**
```ts
export interface WatchItem { symbol: string; addedAt: string }
export interface WatchList { id: string; name: string; createdAt: string; items: WatchItem[] }
export interface ListsState { activeId: string; lists: WatchList[] }
export const MAX_LISTS = 8, NAME_MAX = 24, MAX_PER_LIST = 25, DEFAULT_NAME = 'My watchlist';
export function newId(): string
export function defaultState(now?: Date): ListsState
export function parseState(raw: unknown): ListsState | null          // validate shape; drop bad lists/items; dedupe symbols per list; cap lists/items; fix activeId; null if no valid list
export function migrateV1(rawV1: unknown, now?: Date): ListsState | null   // array of {symbol,addedAt} → one "My watchlist"
export function validateName(s: ListsState, name: string, exceptId?: string): { ok: true; name: string } | { ok: false; error: string }
export function createList(s: ListsState, now?: Date): ListsState     // "Watchlist N" (first unused N≥2), becomes active; unchanged at MAX_LISTS
export function renameList(s: ListsState, id: string, name: string): { ok: true; state: ListsState } | { ok: false; error: string }
export function deleteList(s: ListsState, id: string): { state: ListsState; removed: { list: WatchList; index: number } } | null  // null if last list or unknown id; neighbor becomes active if active deleted
export function restoreList(s: ListsState, r: { list: WatchList; index: number }): ListsState  // reinserts at index and re-activates it
export function addSymbol(s: ListsState, id: string, symbol: string, max?: number): { ok: boolean; state: ListsState }  // idempotent; ok=false only when full
export function removeSymbol(s: ListsState, id: string, symbol: string): { state: ListsState; removed?: { item: WatchItem; index: number } }
export function dropSymbolEverywhere(s: ListsState, symbol: string): ListsState
```
All comparisons of symbols are case-insensitive (`toUpperCase()`); functions are immutable (return new objects; return the same object only for no-ops).

- [ ] **Step 1: Write failing tests** (`tests/lists.test.ts`) — one test per bullet:
  - `defaultState` → one list named "My watchlist", `activeId` equals its id, no items.
  - `parseState`: valid round-trip; garbage (`null`, `{}`, `{lists:[]}`) → `null`; list with bad items drops only the bad items; duplicate symbols (`tcs`,`TCS`) in one list keep first; invalid `activeId` falls back to first list; >8 lists truncated to 8; >25 items truncated to 25.
  - `migrateV1`: `[{symbol:'TCS',addedAt:'2026-10-01T00:00:00Z'}]` → one list "My watchlist" containing it with original `addedAt`; non-array → `null`; entries missing `symbol` dropped.
  - `validateName`: `'  '` → error; 25 chars → error; `'Banks'` when "banks" exists (different id) → error; same name with `exceptId` of its own list → ok; trims (`'  Banks '` → `'Banks'`).
  - `createList`: names "Watchlist 2", then "Watchlist 3"; new list becomes active; at 8 lists returns the same state object.
  - `renameList`: success updates name only; invalid → `{ok:false}` and state untouched.
  - `deleteList`: deleting the last list → `null`; deleting active list (index 1 of 3) activates a neighbor (the list that now sits at index 1, or the previous one if it was last); returns `removed.index`.
  - `restoreList` after delete restores order and active id.
  - `addSymbol`: idempotent (second add `ok:true`, no duplicate, original `addedAt` kept); full list → `{ok:false}`; case-insensitive.
  - `removeSymbol` returns `removed.index`; unknown symbol → no `removed`.
  - `dropSymbolEverywhere` removes `tcs` from all lists.
- [ ] **Step 2:** `npx vitest run tests/lists.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `lib/lists.ts` to the interfaces. `newId`: `globalThis.crypto?.randomUUID?.() ?? 'l' + Math.random().toString(36).slice(2) + Date.now().toString(36)`. Validation error strings: `'Name is required'`, `'Use 24 characters or fewer'`, `'You already have a list with that name'`.
- [ ] **Step 4:** Tests PASS. Commit `feat: watchlist state logic`.

---

### Task 2: `useWatchlists` hook (replaces `useWatchlist`)

**Files:** Create `hooks/useWatchlists.ts`, `tests/useWatchlists.test.tsx`; delete `hooks/useWatchlist.ts` and `tests/useWatchlist.test.tsx` after porting (Step 5).

**Interfaces — Consumes:** everything from Task 1. **Produces:**
```ts
export const MAX_WATCHLIST: number   // per-list cap (env NEXT_PUBLIC_MAX_WATCHLIST_SIZE || 25)
export function useWatchlists(): {
  ready: boolean; storageOk: boolean;
  lists: WatchList[]; activeId: string; active: WatchList;
  items: WatchItem[];                       // active list's items
  allSymbols: string[];                     // de-duplicated union across all lists (for sentiment fetching)
  full: boolean;                            // active list at cap
  has(symbol: string): boolean;             // in ACTIVE list
  add(symbol: string): boolean;             // to active list; false if full
  remove(symbol: string): void;             // from active list, remembers for undoRemove
  undoRemove(): void;
  drop(symbol: string): void;               // removes from ALL lists, no undo (unknown symbols)
  setActive(id: string): void;
  createList(): void;
  renameList(id: string, name: string): { ok: true } | { ok: false; error: string };
  deleteList(id: string): boolean;          // false if blocked (last list); remembers for undoDelete
  undoDelete(): void;
}
```

- [ ] **Step 1: Write failing tests** (`tests/useWatchlists.test.tsx`, `renderHook` + jsdom localStorage; `beforeEach(localStorage.clear)`):
  - Port all ten v1 hook tests, adapted: storage key `stockfeed:watchlists:v2` (assert via `JSON.parse(...).lists[0].items`), cap 25, idempotent add keeping `addedAt`, remove + `undoRemove` restores position, corrupt JSON → default list & no throw, non-object JSON → default list, `setItem` throwing → `storageOk=false` but in-memory add works, `storage` event from another tab updates lists.
  - **Migration:** only v1 present (`[{symbol:'TCS',addedAt:…}]`) → one list "My watchlist" containing TCS; v2 is written; the v1 key value is unchanged afterwards.
  - **v2 wins:** both present → v2 content used.
  - `createList` makes "Watchlist 2" active; `add` then goes to it.
  - `renameList` valid persists; invalid (`''`, duplicate) returns `{ok:false,error}` and nothing changes.
  - `deleteList` of the last list returns false; deleting a non-last list + `undoDelete` restores it (index + active).
  - `drop('TCS')` removes TCS from every list.
  - `allSymbols` is de-duplicated across lists.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Keep the `ref` + `commit` pattern from the old hook (ref is source of truth so several `add` calls inside one `act` work). Read: `parseState(v2)` → else `migrateV1(v1)` → else `defaultState()`; wrap every storage access in try/catch (a read throwing sets `storageOk=false`; a successful later write does not flip it back). After a v1 migration or default, write v2 once (try/catch). Reuse the `storage` event handler (`e.key === null || e.key === V2_KEY`). Never write to the v1 key.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** `git rm hooks/useWatchlist.ts tests/useWatchlist.test.tsx`. (`app/page.tsx` and `useSentiment` consumers are updated in Task 6; until then `npx tsc` may fail only on `app/page.tsx` — that file is switched to `useWatchlists` here with the minimal change `const wl = useWatchlists(); const symbols = wl.allSymbols;` and `wl.items.length` for the count so the app keeps compiling and the UI is unchanged.) Run full suite + `npx tsc --noEmit`. Commit `feat: multiple watchlists state`.

---

### Task 3: Change detection + demo label flip (TDD)

**Files:** Create `lib/changes.ts`, `tests/changes.test.ts`, `tests/demo.test.ts`; modify `lib/demo.ts`, `lib/analyze.ts`, `hooks/useSentiment.ts`, `tests/useSentiment.test.tsx`.

**Interfaces — Produces:**
```ts
// lib/changes.ts
export const CHANGE_WINDOW_MS = 7 * 86_400_000;
export interface Prev { label: Label; changedAt: number }
export function nextPrev(old: { result: { label: Label }; prev?: Prev } | undefined, newLabel: Label, now: number): Prev | undefined
//   no old entry → undefined; old label ≠ newLabel → { label: old label, changedAt: now }; same label → old.prev (unchanged)
export function activeChange(prev: Prev | undefined, current: Label, now: number): Prev | undefined
//   undefined when prev missing, prev.label === current, or now - changedAt > CHANGE_WINDOW_MS
// lib/demo.ts
export function demoResult(stock: Stock, opts?: { refresh?: boolean }): SentimentResult
export function resetDemoFlips(): void
// hooks/useSentiment.ts — returned object gains:
changes: Record<string, Prev>   // keyed by UPPERCASE symbol, already filtered through activeChange
```

- [ ] **Step 1: Failing tests.**
  - `tests/changes.test.ts`: `nextPrev` — no old → undefined; same label keeps existing `prev`; different label → `{label: old, changedAt: now}`; `activeChange` — prev equal to current → undefined; within 7d → returned; older than 7d → undefined; undefined prev → undefined.
  - `tests/demo.test.ts` (use `beforeEach(resetDemoFlips)`): `demoResult(TCS)` without refresh keeps the seeded label (`positive`); one `refresh:true` call flips TCS to a different label from its seed; a later non-refresh call returns the flipped label (state persists); non-flip stock (INFY) never changes on refresh; flipped result is still a valid `SentimentResult` (label in the 4-label set, articles array).
  - `tests/useSentiment.test.tsx` (append): (a) first-ever result → `changes.TCS` undefined; (b) second fetch with a different label → `changes.TCS.label` is the OLD label; (c) second fetch with the same label → no change entry; (d) a `transient` result never creates or updates `prev`; (e) `prev` persists in localStorage and is restored on remount; (f) `prev` older than 7 days in storage is ignored.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
  - `lib/changes.ts` per interface.
  - `lib/demo.ts`: `const FLIP = new Set(['TCS','RELIANCE','ADANIENT','IDEA']); const ROT: Label[] = ['positive','neutral','negative']; const flips = new Map<string, number>()`. In `demoResult`: if `opts.refresh && FLIP.has(sym)` increment the counter; `n = flips.get(sym) ?? 0`; when `n > 0` label = `ROT[(Math.max(0, ROT.indexOf(seed.label)) + n) % 3]`, `confidence = 0.7`, `rationale = 'Coverage has shifted since the last check.'`. `resetDemoFlips` clears the map.
  - `lib/analyze.ts`: `if (env.demo) return demoResult(stock, { refresh: opts.refresh })`.
  - `hooks/useSentiment.ts`: cache entry type becomes `{ result; at; prev?: Prev }`; `isResult` unchanged; `readCache` keeps a valid `prev` (`label` in `LABEL_ORDER`, numeric `changedAt`) and drops invalid ones. In `store`: for non-transient results `const prev = nextPrev(cacheRef.current[k], result.label, Date.now())`, write entry with `prev`; update a `prevs` state map; `changes` = `useMemo` mapping `prevs` through `activeChange(prev, results[k].label, Date.now())`. Transient results must not touch `prev`.
- [ ] **Step 4:** Tests PASS; run full suite. Commit `feat: change detection and demo flip`.

---

### Task 4: Hook options, indices, tally (TDD)

**Files:** Create `lib/indices.ts`, `lib/tally.ts`, `tests/indices.test.ts`, `tests/tally.test.ts`; modify `hooks/useSentiment.ts`, `tests/useSentiment.test.tsx`.

**Interfaces — Produces:**
```ts
// lib/indices.ts
export const NIFTY_50: readonly string[]   // 50 symbols (list below)
// lib/tally.ts
export function tally(symbols: string[], results: Record<string, SentimentResult>, status?: Record<string, Status>):
  { counts: Record<Label, number>; analyzed: number; total: number; failed: string[]; pending: string[] }
//   analyzed = symbols with a result; failed = no result AND status 'error'; pending = no result and not failed
// hooks/useSentiment.ts
useSentiment(symbols, opts?: { onUnknown?; concurrency?: number /*default 3*/; auto?: boolean /*default true*/ })
//   returned object gains: scan(): void   // enqueue every symbol lacking a FRESH cached result (non-forced); used when auto=false
```
NIFTY_50 (all verified present in `data/equity_symbols.json`): `ADANIENT ADANIPORTS APOLLOHOSP ASIANPAINT AXISBANK BAJAJ-AUTO BAJFINANCE BAJAJFINSV BEL BHARTIARTL CIPLA COALINDIA DRREDDY EICHERMOT ETERNAL GRASIM HCLTECH HDFCBANK HDFCLIFE HEROMOTOCO HINDALCO HINDUNILVR ICICIBANK INDUSINDBK INFY ITC JIOFIN JSWSTEEL KOTAKBANK LT M&M MARUTI NESTLEIND NTPC ONGC POWERGRID RELIANCE SBILIFE SHRIRAMFIN SBIN SUNPHARMA TCS TATACONSUM TMPV TATASTEEL TECHM TITAN TRENT ULTRACEMCO WIPRO`.

- [ ] **Step 1: Failing tests.**
  - `indices.test.ts`: length 50; all unique; every symbol resolves via `getStock` from `@/lib/stocks`.
  - `tally.test.ts`: counts per label; `analyzed`/`total`; a symbol with `status.error` and no result lands in `failed`; no result and loading → `pending`; a symbol with a result AND an error status counts as analyzed (not failed); empty input → zeros; result keys are matched case-insensitively (`results` keyed UPPERCASE).
  - `useSentiment.test.tsx` (append): `concurrency: 2` never exceeds 2 in flight with 6 symbols; `auto:false` fetches nothing until `scan()`; after `scan()` all symbols load; `scan()` skips symbols that already have a fresh cached result; calling `scan()` twice while in flight does not double-fetch.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** `CONCURRENCY` constant becomes `opts.concurrency ?? 3` read inside `pump` via a ref. In the symbols effect, when `auto === false` only mark fresh-cached symbols `ok` and skip enqueueing. `scan = useCallback(() => symbols.forEach(sym => { fresh cached → set ok; else enqueue(sym,false) }), …)` (the existing `pending` set prevents double-fetch).
- [ ] **Step 4:** Tests PASS; full suite. Commit `feat: nifty 50 list, tally, scan option`.

---

### Task 5: Shared UI extraction (no behavior change)

**Files:** Create `hooks/useAnalyze.ts`, `components/StockPicker.tsx`, `components/SpectrumBar.tsx`; modify `components/SearchView.tsx`, `components/WatchlistView.tsx`.

**Interfaces — Produces:**
```ts
// hooks/useAnalyze.ts
export interface Option { symbol: string; name: string }
export function useAnalyze(onResult: (r: SentimentResult) => void): {
  picked: Option | null; state: 'idle' | 'loading' | 'ok' | 'error'; err: string;
  run(s: Option, force?: boolean): Promise<void>; clear(): void;
}
// components/StockPicker.tsx
export function StockPicker(props: {
  onPick: (o: Option) => void; placeholder?: string; autoFocus?: boolean; inputId: string;
  renderAction?: (o: Option) => React.ReactNode;   // right-side control inside each option row (Search uses the watchlist button)
}): JSX.Element   // owns query, 300ms debounce → /api/stocks?q=, options, keyboard nav, "Stock not available in this app." message
// components/SpectrumBar.tsx
export function SpectrumBar(props: { counts: Record<Label, number>; label?: string }): JSX.Element  // the rounded proportional bar + legend chips with counts
```

- [ ] **Step 1:** Move the picked/state/err/`run` logic from `SearchView` into `useAnalyze` unchanged (it still calls `logApiError` and `onResult`). Move the input, debounce, options dropdown, keyboard handling and "not available" message into `StockPicker`; `onPick` fires on click/Enter. Move the bar + legend markup from `WatchlistView` into `SpectrumBar` (identical visuals, `role="img"` aria-label preserved).
- [ ] **Step 2:** Rewire `SearchView` and `WatchlistView` to use them. No visible change.
- [ ] **Step 3:** `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` all green. Start `DEMO_MODE=1 npm run dev -p 3111`, load headless screenshot of Watchlist + Search (reuse `shot.js` in the scratchpad) and confirm they look identical to before. Commit `refactor: extract picker, analyze hook, spectrum bar`.

---

### Task 6: Lists UI, badge, header, page wiring

**Files:** Create `components/ListBar.tsx`, `components/ChangeBadge.tsx`; modify `components/Header.tsx`, `components/StockCard.tsx`, `components/WatchlistButton.tsx`, `components/WatchlistView.tsx`, `components/SearchView.tsx`, `app/page.tsx`.

**Behavior and props:**
- `ListBar({ lists, activeId, onSelect, onCreate, onRename: (id,name)=>{ok}|{ok:false,error}, onDelete })`: horizontally scrollable chip row (`overflow-x-auto`, no page scroll), each chip `name` + count; active chip filled (`bg-[var(--text)]`). "+ New list" chip (disabled at 8: title "Up to 8 lists"). For the active list show **Rename** and **Delete** text buttons to the right. Rename: chip becomes an `<input>` (autofocus, `maxLength={24}`), **Enter** saves, **Esc/blur-empty** cancels, inline error text under the row from the validator; Rename pressed again on the same name is allowed. Delete disabled when only one list.
- `ChangeBadge({ from, to, at })`: small pill `{From} → {To} · {timeAgo}` using the two sentiment colors as text colors on `--surface`, `title` explains "Label changed since your last check".
- `StockCard` gets optional `change?: Prev`; renders the badge under the rationale when `activeChange` says so (pass `changes[UPPER]` from `useSentiment`).
- `WatchlistButton` gets `listName?: string` and shows `+ Add to {listName}` / `✓ In {listName}` / `List full`.
- `Header`: tabs `Watchlist · Pulse · Search · Compare`; `type Tab = 'watchlist'|'pulse'|'search'|'compare'`; wordmark text `hidden sm:inline` (icon always visible); Refresh button only on the Watchlist tab (as now). The Watchlist count badge shows the **active list** count.
- `page.tsx`: `wl = useWatchlists()`; `sent = useSentiment(wl.allSymbols, { onUnknown: wl.drop })`; Watchlist tab renders `ListBar` above `WatchlistView` (passing `symbols = wl.items.map(i=>i.symbol)` of the ACTIVE list; sentiment comes from the shared `sent`); toasts: `Deleted "{name}"` with Undo (`wl.undoDelete`), `Renamed to "{name}"`, `Created "{name}"`; the empty state text applies per list ("Search for a stock to add it here.").
- `Search` passes `listName={wl.active.name}` to every `WatchlistButton`; `toggle` message becomes `Added {SYM} to {list}` / `Removed {SYM} from {list}`.

- [ ] **Step 1:** Implement the components and page wiring per above.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` green.
- [ ] **Step 3:** Manual (headless Chrome, `DEMO_MODE=1`): create a second list, rename it (also try empty and duplicate names → inline error), switch lists, add different stocks to each, delete + undo, reload (state persists), hit **Refresh** twice and confirm a badge such as `Positive → Neutral · just now` appears on TCS/RELIANCE/ADANIENT/IDEA. Check 360px: no horizontal page scroll, chip row scrolls inside itself. Screenshot light + dark.
- [ ] **Step 4:** Commit `feat: multiple watchlists ui and change badges`.

---

### Task 7: Market Pulse tab

**Files:** Create `components/PulseView.tsx`; modify `app/page.tsx`.

**Behavior:**
- `PulseView({ onToggleList, has, full, listName })`: `const s = useSentiment(NIFTY_50 as string[], { concurrency: 2, auto: false })`; `useEffect(() => { s.scan(); }, [])` on mount (guarded so StrictMode double-mount does not double-fetch — the hook's pending set already dedupes). Own `selected` state; `StockDetailPanel` for the selected stock using `s.results`, `has/full/onToggleList` for the add/remove button, `onRefresh={() => s.refresh(sym)}`.
- Header strip: `SpectrumBar` with `tally(NIFTY_50, s.results, s.status).counts` and text `"{analyzed} / 50 analyzed"`; buttons **Scan again** (calls `s.scan()`) and, when `failed.length > 0`, **Retry {n} failed** (calls `s.refresh(sym)` for each failed). While `pending.length > 0` show "Scanning…".
- Grid: `grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10`; each tile is a `<button>` showing the symbol (small, truncated), filled with `var(--{pos|neu|neg|unk}-bg)` and a 2px border of the sentiment color when it has a result; unscanned = 1px dashed `--border` with a `skeleton` shimmer; failed = dashed `--unk` border with a "↻" glyph, click retries. `aria-label` = `"{SYMBOL}, {Label}"` / `"{SYMBOL}, not analyzed yet"` / `"{SYMBOL}, failed — retry"`. Clicking a scanned tile opens the detail panel.
- Disclaimer text under the grid.
- Rate-limit honesty: if more than 10 tiles failed show a one-line note "Free model is rate limited. Retry in a minute."

- [ ] **Step 1:** Implement `PulseView`; add the `pulse` branch to `page.tsx`.
- [ ] **Step 2:** `tsc`, `eslint`, full tests green.
- [ ] **Step 3:** Manual (`DEMO_MODE=1`): open Pulse → 50 tiles fill progressively, summary counts add to 50, click a tile → panel, add to list from the panel, switch tab and back (instant, no refetch of cached tiles), simulate failure by running once without `DEMO_MODE` and keys invalid is NOT required — instead unit-cover failure in Task 4's tally test. Check 360px grid and dark mode screenshots. Commit `feat: market pulse`.

---

### Task 8: Compare tab

**Files:** Create `components/CompareView.tsx`; modify `components/StockDetail.tsx`, `app/page.tsx`.

**Behavior:**
- `CompareView({ seed?: string; onResult })`: two slots A and B; each = `StockPicker` + `useAnalyze(onResult)`. When a slot has a result it shows a `CompareColumn` and a small "Change" button that clears it. If `seed` is provided on mount, run slot A with that symbol (look up its name through `GET /api/stocks?symbols=SEED`). Layout: `grid gap-6 md:grid-cols-2` (stacked on mobile).
- `CompareColumn({ result })`: symbol + name, `SentimentPill size="lg"`, confidence meter (reuse the same markup as `StockDetailBody`; extract a small `ConfidenceMeter` there if needed), rationale, a mini bar of article labels from `articleCounts(result)` (new tiny pure helper in `lib/tally.ts`: `articleCounts(r): Record<Label, number>`, tested in `tests/tally.test.ts`), then the article list (title link, source · time, per-article dot).
- Between/above columns, when both exist: one line summarizing the contrast, derived without the LLM, e.g. `"TCS reads more positive than INFY (3 of 4 vs 1 of 4 positive articles)."` — computed from `articleCounts` (helper `compareSummary(a, b): string`, pure, tested: identical label+counts → "Both read {label} with similar coverage."; otherwise the side with the higher positive share is "more positive"; if both have zero determinable articles → "Not enough news to compare.").
- Loading/error states per slot (same wording as Search). Empty state: "Pick two stocks to compare their news sentiment side by side."
- `StockDetailBody` gets optional `onCompare?: () => void`; when provided a **Compare with…** button appears next to Refresh. `page.tsx` keeps `compareSeed` state; detail panel (watchlist tab) passes `onCompare={() => { setCompareSeed(selected); setSelected(null); setTab('compare'); }}`.

- [ ] **Step 1: Failing tests** in `tests/tally.test.ts`: `articleCounts` counts per label; `compareSummary` three cases above (identical; more-positive side named correctly; both empty).
- [ ] **Step 2:** Run → FAIL; implement `articleCounts` and `compareSummary` in `lib/tally.ts`; tests PASS.
- [ ] **Step 3:** Implement `CompareView`, `onCompare`, page wiring.
- [ ] **Step 4:** `tsc`, `eslint`, full suite green. Manual (`DEMO_MODE=1`): compare TCS vs ETERNAL, change a slot, open the watchlist detail → "Compare with…" prefills A, check 360px (stacked) and dark mode. Commit `feat: compare tab`.

---

### Task 9: Hardening, docs, final verification

**Files:** Modify `README.md`; fix whatever verification surfaces.

- [ ] **Step 1:** README: add sections for multiple watchlists, what-changed badges (with the demo-mode refresh trick), Market Pulse (Nifty 50, scanning behavior, rate-limit note), Compare.
- [ ] **Step 2:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `rm -rf .next && npm run build` — all green.
- [ ] **Step 3:** Headless Chrome pass in `DEMO_MODE=1` at 360/390/1100px, light and dark: watchlist with 2 lists, badge visible, Pulse full grid, Compare with two results, detail panel. Confirm `document.documentElement.scrollWidth === innerWidth` at 360 and 390 on every tab. Check browser console for errors (`pageerror`/console error listener) — none except intentional API error logs.
- [ ] **Step 4:** Existing-user check: seed `stockfeed:watchlist:v1` with 3 symbols and no v2 → app loads with "My watchlist" containing them; v1 key still present.
- [ ] **Step 5:** Commit `docs: v2 readme and verification`.

---

## Self-Review

- **Spec coverage:** multiple lists + rename/validation/limits/migration/undo (T1, T2, T6); badges + demo flip (T3, T6); Pulse Nifty 50, concurrency 2, partial results, retry, outlined unscanned tiles (T4, T7); Compare incl. "Compare with…" (T5, T8); nav + 360px (T6, T9); tests listed in the spec's Testing section map to T1–T4 and T8; out-of-scope items untouched.
- **Placeholders:** none; every pure module has its interface and test cases, UI tasks specify exact props, classes and wording.
- **Type consistency:** `WatchItem`/`WatchList`/`ListsState` defined once (T1) and consumed by T2; `Prev` defined in T3 and used by T6 (`StockCard.change`); `Option` defined in `useAnalyze` (T5) and used by `StockPicker`/Compare; `tally`/`articleCounts`/`compareSummary` live in `lib/tally.ts` (T4/T8); `useSentiment` option names (`concurrency`, `auto`, `scan`) match between T4 and T7.
