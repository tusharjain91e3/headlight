# Headlight — Design Spec

Hackathon project. Source of truth for behavior: `docs/PRD.md` (v1.1). This spec records only the decisions on top of it.

## Intent
Win the hackathon with a polished, reliable demo of the PRD pipeline: watchlist/search → SerpApi Google News → 7-day filter → OpenRouter LLM → Positive / Neutral / Negative / Cannot determine.

## Decisions
- **Name:** Headlight.
- **Location:** `~/Desktop/headlight`. Next.js (App Router, TypeScript), no DB, no sign-in.
- **Env:** I create `.env.example` and an empty `.env.local`; the user fills in keys. Keys are server-only.
- **Backend:** exactly as PRD §4–§8 (routes `/api/stocks`, `/api/sentiment/[symbol]`, in-memory TTL cache, 60% rule, confidence<0.4 downgrade, repair-prompt retry).
- **DEMO_MODE=1** (optional env): `/api/sentiment/[symbol]` returns canned results for a few stocks and a deterministic fallback otherwise, so a rate-limited model or bad network cannot break the live demo. Off by default.
- **Tests:** unit tests for date filter, dedupe, relevance, aggregation, schema validation, search ranking, useWatchlist.

## UI
- Minimal and clean: off-white / near-black dark mode, Inter, generous whitespace, thin borders, soft radius.
- Color is reserved for sentiment: **green** positive, **red** negative, **yellow** neutral, **grey** cannot determine. Used for pills, card left-border, section dots, confidence meter. Defined once as CSS tokens (light + dark).
- **Header:** logo + "Headlight", tabs Watchlist | Search (count badge), refresh button, last-updated.
- **Watchlist tab:** summary bar (counts per sentiment), four sections in order Positive / Neutral / Negative / Cannot determine; cards (symbol, name, pill, one-line rationale) fill as results arrive; skeleton + "Analyzing…" states; per-card error + retry; empty state.
- **Detail:** slide-over panel — large label, confidence meter, rationale, article list (title, source, time ago, per-article colored dot, link out), add/remove button.
- **Search tab:** debounced autocomplete, "+ Add to watchlist" / "✓ In watchlist" on rows, result card + detail.
- Toasts with undo on remove; disclaimer footer.

## Out of scope
Anything in PRD §1 non-goals; auth; DB; streaming news.
