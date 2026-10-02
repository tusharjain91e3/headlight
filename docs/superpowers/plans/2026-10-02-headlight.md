# Headlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Headlight, a Next.js stock-news sentiment feed (watchlist + search) with a minimal UI colored by sentiment.

**Architecture:** Stateless Next.js route handlers run one pipeline per stock (SerpApi Google News → filter → OpenRouter LLM → aggregate) behind an in-memory TTL cache. The browser holds the watchlist and last results in `localStorage` and fetches stocks one at a time with concurrency 3. Pure logic lives in small `lib/` modules with unit tests.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, zod, Vitest + Testing Library, Inter font.

**Spec:** `docs/superpowers/specs/2026-10-02-headlight-design.md` (behavior source of truth: `docs/PRD.md`; prompts in PRD §8 are copied verbatim into `lib/prompts.ts`).

## Global Constraints

- Project root: `/Users/tusharsjain/Desktop/headlight`. Name shown in UI: "Headlight".
- Watchlist key `stockfeed:watchlist:v1` → `[{symbol, addedAt}]`; results key `stockfeed:sentiment:v1`. Cap 25.
- Labels (exact strings): `positive`, `neutral`, `negative`, `cannot_determine`.
- Colors: positive=green, negative=red, neutral=yellow, cannot_determine=grey. Color is used ONLY for sentiment. Defined once as CSS variables (light + dark).
- Keys (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `SERPAPI_API_KEY`) read only server-side, never `NEXT_PUBLIC_`. Agent creates `.env.example` + empty `.env.local`; the user fills them.
- Defaults: `CACHE_TTL_MINUTES=60`, `MAX_ARTICLES_PER_STOCK=10`, `NEWS_WINDOW_DAYS=7`; LLM temperature 0.1; manual refresh ≤ once / 5 min / stock; client concurrency 3.
- Stock-level rule: ≥60% of determinable articles positive/negative wins, else neutral; none determinable → cannot_determine; confidence < 0.4 → cannot_determine. Articles from last 48h weigh 1.5×.
- `DEMO_MODE=1` returns canned results (off by default).
- UI must show the "automated, not investment advice" disclaimer on watchlist and detail views.

## Review Focus

- Symbol not in JSON (API / stale localStorage) → 404 / dropped silently.
- Corrupt or blocked `localStorage` → empty in-memory watchlist + notice, never crash.
- LLM returns wrong item count / invalid JSON / code-fenced JSON → repair once, then cannot_determine.
- Articles with unparseable or relative dates ("2 days ago") → relative parsed, garbage dropped.
- Missing API keys → clear 500 "… is not configured", UI shows per-card error with retry.

## File Structure

```
app/layout.tsx, app/page.tsx, app/globals.css
app/api/stocks/route.ts
app/api/sentiment/[symbol]/route.ts
components/Header.tsx, WatchlistView.tsx, SentimentSection.tsx, StockCard.tsx,
  StockDetail.tsx, SearchView.tsx, WatchlistButton.tsx, SentimentPill.tsx, Toast.tsx
hooks/useWatchlist.ts, hooks/useSentiment.ts
lib/types.ts, stocks.ts, filter.ts, aggregate.ts, schema.ts, prompts.ts,
  serpapi.ts, openrouter.ts, cache.ts, env.ts, analyze.ts, demo.ts, sentiment-ui.ts
data/equity_symbols.json (exists)
tests/*.test.ts(x)
```

---

### Task 1: Scaffold, tokens, env

**Files:** Create project files in `/Users/tusharsjain/Desktop/headlight` (existing `data/`, `docs/` kept), `.env.example`, `.env.local`, `vitest.config.ts`, `lib/types.ts`, `lib/sentiment-ui.ts`, `app/globals.css`.

**Interfaces — Produces:**
```ts
// lib/types.ts
export type Label = 'positive'|'neutral'|'negative'|'cannot_determine';
export interface Stock { symbol: string; name: string; coreName: string; searchKey: string }
export interface Article { title: string; snippet: string; source: string; url: string; published_at: string }
export interface LabeledArticle extends Article { label: Label; reason: string }
export interface SentimentResult {
  symbol: string; name: string; label: Label; confidence: number; rationale: string;
  articles: LabeledArticle[]; article_count: number; generated_at: string; cached: boolean; stale?: boolean;
}
// lib/sentiment-ui.ts
export const LABEL_META: Record<Label,{text:string; varName:string}>  // text: Positive/Neutral/Negative/Cannot determine
export const LABEL_ORDER: Label[] // positive, neutral, negative, cannot_determine
```

- [ ] **Step 1:** Scaffold into the existing folder without clobbering it:
```bash
cd ~/Desktop && npx create-next-app@latest headlight-tmp --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
rsync -a --exclude node_modules headlight-tmp/ headlight/ && rm -rf headlight-tmp
cd headlight && npm i zod && npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
git init
```
- [ ] **Step 2:** `vitest.config.ts`: react plugin, `environment: 'jsdom'`, `alias: {'@': resolve(__dirname)}`, `include: ['tests/**/*.test.{ts,tsx}']`. Add `"test": "vitest run"` to package.json scripts.
- [ ] **Step 3:** Write `.env.example` exactly as PRD §5.2 plus `DEMO_MODE=` and `NEXT_PUBLIC_MAX_WATCHLIST_SIZE=25`; copy to `.env.local` with the same blank values. Confirm `.env*.local` is in `.gitignore`.
- [ ] **Step 4:** `app/globals.css` tokens (light + dark via `prefers-color-scheme`, plus `[data-theme]` not needed):
```css
:root{--bg:#fafaf9;--surface:#fff;--border:#e7e5e4;--text:#1c1917;--muted:#78716c;
 --pos:#16a34a;--pos-bg:#dcfce7;--neu:#ca8a04;--neu-bg:#fef9c3;--neg:#dc2626;--neg-bg:#fee2e2;--unk:#6b7280;--unk-bg:#f3f4f6}
@media(prefers-color-scheme:dark){:root{--bg:#0c0a09;--surface:#171412;--border:#292524;--text:#fafaf9;--muted:#a8a29e;
 --pos:#4ade80;--pos-bg:#052e16;--neu:#facc15;--neu-bg:#422006;--neg:#f87171;--neg-bg:#450a0a;--unk:#9ca3af;--unk-bg:#1f2937}}
body{background:var(--bg);color:var(--text);font-family:var(--font-inter),system-ui,sans-serif}
```
  Map tokens in Tailwind via `bg-[var(--bg)]` style classes (no extra config needed).
- [ ] **Step 5:** Create `lib/types.ts` and `lib/sentiment-ui.ts` as specified above (`LABEL_META.positive.varName = '--pos'`, etc.).
- [ ] **Step 6:** `npm run build` passes on the default page; `git add -A && git commit -m "chore: scaffold headlight"`.

---

### Task 2: Stock universe + search (TDD)

**Files:** Create `lib/stocks.ts`, `tests/stocks.test.ts`.

**Interfaces — Produces:**
```ts
export function loadStocks(raw?: unknown): Stock[]            // validates, dedupes by symbol, derives coreName/searchKey
export function getStock(symbol: string): Stock | undefined    // case-insensitive symbol lookup in module-scope map
export function searchStocks(q: string, limit = 8): Stock[]    // exact symbol > symbol prefix > name prefix > name substring
```

- [ ] **Step 1: Failing tests** (`tests/stocks.test.ts`):
```ts
import { loadStocks, searchStocks } from '@/lib/stocks';
const raw = [{symbol:'AARTIIND',name:'Aarti Industries Limited'},{symbol:'AARTIDRUGS',name:'Aarti Drugs Limited'},
  {symbol:'TCS',name:'Tata Consultancy Services Limited'},{symbol:'TCS',name:'dup'},{symbol:'',name:'bad'},{symbol:'X'}];
test('drops invalid and duplicate entries', () => expect(loadStocks(raw).map(s=>s.symbol)).toEqual(['AARTIIND','AARTIDRUGS','TCS']));
test('coreName strips Limited/Ltd', () => expect(loadStocks(raw)[0].coreName).toBe('Aarti Industries'));
test('ranking: exact symbol first', () => expect(searchStocks('tcs',8,loadStocks(raw))[0].symbol).toBe('TCS'));
test('symbol prefix before name substring', () => expect(searchStocks('aarti',8,loadStocks(raw)).map(s=>s.symbol)).toEqual(['AARTIIND','AARTIDRUGS']));
test('no match → []', () => expect(searchStocks('zzzz',8,loadStocks(raw))).toEqual([]));
test('limit respected', () => expect(searchStocks('a',1,loadStocks(raw))).toHaveLength(1));
```
  (Give `searchStocks` an optional third param `universe = ALL` so it is testable.)
- [ ] **Step 2:** `npx vitest run tests/stocks.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** `coreName = name.replace(/\s+(limited|ltd\.?)\s*$/i,'').trim()`; `searchKey = (symbol+' '+name).toLowerCase()`; score: exact symbol 0, symbol prefix 1, name prefix 2 (`coreName.toLowerCase().startsWith(q)`), substring of `searchKey` 3; sort by score then symbol length then symbol; empty/whitespace query → `[]`. Module scope: `import raw from '@/data/equity_symbols.json'` (enable `resolveJsonModule`), `ALL = loadStocks(raw)`, `BY_SYMBOL = new Map`.
- [ ] **Step 4:** Tests PASS. Commit `feat: stock universe and search`.

---

### Task 3: Filter module (TDD)

**Files:** Create `lib/filter.ts`, `tests/filter.test.ts`.

**Interfaces — Consumes:** `Article`, `Stock`. **Produces:**
```ts
export function parseDate(iso?: string, rel?: string, now?: Date): Date | null   // iso first; "2 days ago"/"3 hours ago"/"1 week ago" fallback; else null
export function withinWindow(d: Date, days: number, now?: Date): boolean
export function isRelevant(a: {title:string;snippet:string}, stock: Stock): boolean // coreName (case-insens.) OR symbol as whole word
export function dedupe<T extends {title:string;url:string}>(items: T[]): T[]       // normalized title or URL
export function filterArticles(raw: RawNews[], stock: Stock, opts:{days:number;max:number;now?:Date}): Article[]
export interface RawNews { title?:string; snippet?:string; source?:string; link?:string; iso_date?:string; date?:string }
```

- [ ] **Step 1: Failing tests** covering: ISO date within/outside 7 days; `"2 days ago"` parsed, `"garbage"` → null (dropped); relevance true by coreName, true by whole-word symbol (`"TCS wins deal"`), false when symbol only appears inside another word (`"ATCSX"`); dedupe collapses same URL and same normalized title (case/punctuation-insensitive); `filterArticles` caps at `max`, sorts newest first, drops empty titles.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Relevance uses `new RegExp('\\b'+escape(symbol)+'\\b','i')`; normalized title = lowercase, strip non-alphanumerics, collapse spaces; `source` from `source.name` handled in serpapi.ts (RawNews.source already a string). Truncate snippet to 300 chars in `filterArticles`.
- [ ] **Step 4:** Tests PASS. Commit `feat: news filter`.

---

### Task 4: Aggregation + schema validation (TDD)

**Files:** Create `lib/aggregate.ts`, `lib/schema.ts`, `tests/aggregate.test.ts`, `tests/schema.test.ts`.

**Interfaces — Produces:**
```ts
// schema.ts
export const LlmOutput: z.ZodType<{symbol:string; overall:{label:Label;confidence:number;rationale:string}; items:{index:number;label:Label;reason:string}[]}>
export function parseLlmJson(text: string, expectedCount: number): {ok:true;data:z.infer<typeof LlmOutput>}|{ok:false;error:string}
//   tolerant: strips ``` fences, extracts first {...} block; fails if items.length !== expectedCount or indexes are not 0..n-1
// aggregate.ts
export function aggregate(items:{label:Label; published_at:string}[], llm:{label:Label;confidence:number}, now?:Date): {label:Label; confidence:number}
```

- [ ] **Step 1: Failing tests:** aggregate — all cannot_determine → cannot_determine; 3 pos/1 neu → positive (3/4≥60%); 2 neg/2 pos → neutral; recency 1.5× tips a 50/50 split (e.g. 1 recent pos + 1 old neg + …) — pick numbers so weighted ≥0.6; confidence 0.3 → cannot_determine; empty → cannot_determine. schema — valid JSON ok; fenced JSON ok; wrong item count fails; bad label fails; prose around JSON ok.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** (determinable = label ≠ cannot_determine; weight 1.5 if published within 48h else 1; pos share = posW/totalW, same for neg; ≥0.6 → that label; else neutral; confidence from LLM, `<0.4` → cannot_determine).
- [ ] **Step 4:** PASS. Commit `feat: aggregation and llm schema`.

---

### Task 5: External clients, cache, pipeline, demo mode

**Files:** Create `lib/env.ts`, `lib/cache.ts`, `lib/prompts.ts`, `lib/serpapi.ts`, `lib/openrouter.ts`, `lib/demo.ts`, `lib/analyze.ts`, `tests/analyze.test.ts`.

**Interfaces — Consumes:** filter, aggregate, schema, stocks. **Produces:**
```ts
// env.ts
export class ConfigError extends Error {}
export function serverEnv(): {openrouterKey;openrouterModel;openrouterBase;serpKey;ttlMs;maxArticles;windowDays;demo:boolean} // throws ConfigError('OpenRouter is not configured' | 'SerpApi is not configured'); skipped keys when demo
// cache.ts
export const cache: { get(k):SentimentResult|undefined; set(k,v,ttlMs):void; lastRefresh: Map<string,number> }
// serpapi.ts
export async function fetchNews(stock: Stock): Promise<RawNews[]>   // q = `"${coreName}" NSE stock when:7d`, gl=in, hl=en, engine=google_news; maps news_results (flatten `stories`), source.name; retry 429/5xx ×2 w/ backoff; throws NewsUnavailable
// openrouter.ts
export async function classify(stock: Stock, articles: Article[]): Promise<{overall; items}|null> // system+user prompt from prompts.ts, temp 0.1, response_format json_schema; parseLlmJson; one repair retry; null on final failure; if provider rejects response_format retry once without it
// analyze.ts
export async function analyzeStock(symbol: string, opts?:{refresh?:boolean}): Promise<SentimentResult>
```

- [ ] **Step 1:** `prompts.ts`: copy §8.1 system prompt, §8.2 user template (as a `buildUserPrompt(stock, articles, today)` function), §8.3 schema, §8.4 repair prompt, and the §8.5 few-shot block appended to the system prompt, verbatim from `docs/PRD.md`.
- [ ] **Step 2: Failing test** `tests/analyze.test.ts` with `vi.mock('@/lib/serpapi')` and `vi.mock('@/lib/openrouter')`: (a) no articles → `cannot_determine`, rationale "No recent news.", `classify` not called; (b) articles + positive LLM → label positive, per-article labels merged by index; (c) second call within TTL → `cached:true`, fetchNews called once; (d) `classify` returns null → `cannot_determine`; (e) `fetchNews` throws NewsUnavailable → `cannot_determine` "News unavailable." and serves stale cache (`stale:true`) if one exists; (f) unknown symbol → throws `UnknownSymbol`.
- [ ] **Step 3:** Run → FAIL. Implement `env.ts`, `cache.ts`, `serpapi.ts`, `openrouter.ts`, `analyze.ts` per the interfaces. Flow: stock lookup → demo? `demoResult(stock)` → cache hit (unless refresh and >5 min since last refresh) → fetchNews → filterArticles → zero ⇒ no-news result (no LLM) → classify → merge items → `aggregate` → cache → return. `demo.ts`: hand-written results for ~8 popular symbols (RELIANCE, TCS, INFY, HDFCBANK, TATAMOTORS, ZOMATO, ADANIENT, IDEA — realistic fake headlines clearly marked as sample data in the rationale-free `source: "Sample"`), covering all four labels; any other symbol returns a deterministic pseudo-random label from a hash of the symbol.
- [ ] **Step 4:** Tests PASS. Commit `feat: pipeline`.

---

### Task 6: API routes

**Files:** Create `app/api/stocks/route.ts`, `app/api/sentiment/[symbol]/route.ts`.

- [ ] **Step 1:** `GET /api/stocks?q=` → `{results: {symbol,name}[]}` via `searchStocks`; empty q → `{results: []}`.
- [ ] **Step 2:** `GET /api/sentiment/[symbol]` → `analyzeStock(symbol, {refresh: searchParams.get('refresh')==='1'})`. Map `UnknownSymbol` → 404 `{error:'Stock not available in this app.'}`, `ConfigError` → 500 `{error: message}`, other → 502 `{error:'Analysis failed'}`. Set `export const maxDuration = 60; export const dynamic = 'force-dynamic'`. (Next 15+: `params` is a Promise — `await params`.)
- [ ] **Step 3:** Verify with `DEMO_MODE=1 npm run dev` then:
```bash
curl 'localhost:3000/api/stocks?q=tcs'
curl 'localhost:3000/api/sentiment/TCS'
curl -i 'localhost:3000/api/sentiment/NOPE'   # 404
```
Expected: JSON results, a full `SentimentResult`, and 404. Commit `feat: api routes`.

---

### Task 7: Client hooks (TDD)

**Files:** Create `hooks/useWatchlist.ts`, `hooks/useSentiment.ts`, `tests/useWatchlist.test.tsx`.

**Interfaces — Produces:**
```ts
export function useWatchlist(): { items:{symbol:string;addedAt:string}[]; ready:boolean; storageOk:boolean; full:boolean;
  has(s:string):boolean; add(s:string):boolean; remove(s:string):void; undoRemove():void }
export function useSentiment(symbols: string[]): { results: Record<string,SentimentResult>; status: Record<string,'loading'|'ok'|'error'|'stale'>;
  refresh(symbol?:string):void; refreshAll():void; lastUpdated: Date|null; put(r:SentimentResult):void }
```

- [ ] **Step 1: Failing tests** (`renderHook` + jsdom localStorage): add persists to `stockfeed:watchlist:v1`; add twice → one entry, original `addedAt` kept; remove; cap at 25 (`add` returns false, `full` true); corrupt JSON in storage → `items=[]`, no throw; `localStorage.setItem` throwing → `storageOk=false`, in-memory add still works; `storage` event from another tab updates `items`; `ready` false before mount effect.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `useWatchlist` (read in `useEffect` only; every storage access in try/catch; `max = Number(process.env.NEXT_PUBLIC_MAX_WATCHLIST_SIZE) || 25`; `undoRemove` restores the last removed entry at its old index). Unknown-symbol pruning (F8) happens in `useSentiment` when the API returns 404: call a passed-in `onUnknown(symbol)`; add that optional callback param.
- [ ] **Step 4:** `useSentiment`: hydrate `results` from `stockfeed:sentiment:v1` (`{[symbol]:{result,at}}`); queue symbols without a fresh (<60 min) entry; fetch with concurrency 3 (simple worker pool); entries older than TTL show `stale` while refetching; failures set `error` (keep old result if any); `put` writes a result straight into state + storage (used when adding from Search so no second call happens).
- [ ] **Step 5:** Tests PASS. Commit `feat: watchlist and sentiment hooks`.

---

### Task 8: UI (invoke `frontend-design:frontend-design` first for polish)

**Files:** Create `app/layout.tsx` (Inter via `next/font/google`, `<title>Headlight</title>`), `app/page.tsx`, all `components/*`.

**Design rules (from spec):** off-white/near-black, thin 1px borders, 12px radius, generous spacing, no gradients/shadows beyond a subtle hover lift; color only for sentiment.

- [ ] **Step 1: `SentimentPill`**: `{label}` → rounded pill with `var(--pos-bg)`/`var(--pos)` etc. and a 6px dot; text from `LABEL_META`.
- [ ] **Step 2: `StockCard`**: left 3px border in the sentiment color; symbol (semibold), name (muted, truncated), pill, one-line rationale (2-line clamp); loading state = skeleton shimmer + "Analyzing…"; error state = grey card with Retry button; `stale` shows small "Refreshing…" badge. Click opens detail.
- [ ] **Step 3: `SentimentSection`** (dot + title + count, collapsible, hidden if empty except in summary) and **`WatchlistView`**: summary bar with four colored count chips (proportional segmented bar above it), sections in `LABEL_ORDER`, loading cards in an "Analyzing…" strip, empty state ("Search for a stock to add it here." + helper text that the list lives in this browser), disclaimer footer, "Watchlist can't be saved in this browser" notice when `!storageOk`.
- [ ] **Step 4: `StockDetail`**: slide-over (right on desktop, bottom sheet on mobile, Esc/overlay closes, focus-trapped): big label + confidence meter (bar in sentiment color), rationale, article list (title link out `rel="noopener noreferrer" target="_blank"`, source, "2d ago", small colored dot + reason), refresh button, `WatchlistButton`, disclaimer.
- [ ] **Step 5: `WatchlistButton`** ("+ Add to watchlist" / "✓ In watchlist" toggle / disabled "Watchlist full"), **`Toast`** (add confirmation, remove with Undo, 4s auto-dismiss, `aria-live="polite"`).
- [ ] **Step 6: `SearchView`**: input with 300ms debounce → `/api/stocks?q=`, dropdown of ≤8 rows each with symbol/name + `WatchlistButton`; keyboard ↑/↓/Enter; selecting runs `/api/sentiment/[symbol]` once, shows loading skeleton then result card + detail; no match → "Stock not available in this app."; on add, call `sentiment.put(result)`.
- [ ] **Step 7: `Header` + `app/page.tsx`**: logo mark (small CSS/SVG headlight beam glyph), "Headlight", tabs Watchlist (count badge) | Search, refresh-all button with "Updated 3m ago". Wire `useWatchlist` + `useSentiment` at page level so both tabs share state; render nothing from localStorage until `ready` (skeleton instead) to avoid hydration mismatch.
- [ ] **Step 8:** Run `DEMO_MODE=1 npm run dev`; open `http://localhost:3000`; add stocks via Search, confirm all four colors appear, dark mode (toggle OS appearance), mobile width 390px with no horizontal scroll, remove + undo, reload keeps the watchlist. Screenshot via the `run` skill if available. Commit `feat: ui`.

---

### Task 9: Hardening, README, final verification

**Files:** Create `README.md`; modify as needed.

- [ ] **Step 1:** `README.md`: what it is, 3-step setup (`npm i`, fill `.env.local`, `npm run dev`), env table, `DEMO_MODE`, architecture diagram (ASCII from PRD §5), cost controls, disclaimer.
- [ ] **Step 2:** Run `npm test` (all pass), `npm run lint`, `npm run build` (no type errors). Fix anything that fails.
- [ ] **Step 3:** With empty `.env.local` and `DEMO_MODE` unset: open the app, add a stock → card shows error "OpenRouter is not configured" with Retry and the app does not crash. Report this honestly in the final summary.
- [ ] **Step 4:** Commit `docs: readme and final checks`. Tell the user exactly which env vars to set and that live (non-demo) calls were not tested because no keys exist in this environment.

---

## Self-Review

- **Spec coverage:** name/location (T1), env files (T1), backend per PRD (T2–T6), DEMO_MODE (T5), UI incl. colors/summary/detail/search/toasts/disclaimer (T8), tests list (T2–T7). No gaps.
- **Placeholders:** none; prompt text is copied from PRD §8 at implementation time (explicit source).
- **Type consistency:** `Stock`, `Article`, `LabeledArticle`, `SentimentResult`, `Label` defined in T1 and used unchanged; `searchStocks(q, limit, universe)` signature matches test in T2; `useSentiment.put` used in T8.
