# Headlight

Shine a light on the news behind your stocks. Headlight reads the last 7 days of Google News for any NSE-listed company, has an LLM classify each headline, and tells you at a glance whether the coverage is **Positive**, **Neutral**, **Negative**, or **Cannot determine**.

- **Multiple watchlists** (stored in your browser only; no sign-in): create, rename and delete lists, each grouped by sentiment.
- **What changed:** a badge such as `Positive → Neutral · 2h ago` appears when a stock's label flips.
- **Market Pulse:** a heatmap of the Nifty 50 colored by sentiment, scanned progressively.
- **Compare:** two stocks side by side with a one-line contrast.
- **Search** any of the 2,592 NSE stocks for a one-off read, then add it to the active list with one tap.
- Open any stock to see the articles behind its label, with a per-article verdict.

> Sentiment is generated automatically from headlines and snippets. It is not investment advice.

## How it works

```
Browser (localStorage: watchlist + last results)
   └─ GET /api/sentiment/[symbol]   (concurrency 3, one stock per call)
        ├─ cache (in-memory TTL)  ── hit → return
        ├─ SerpApi google_news     "<company>" NSE stock when:7d
        ├─ filter: 7-day window, dedupe, relevance, cap 10
        ├─ OpenRouter: ONE call per stock → per-article labels + overall
        └─ aggregate: ≥60% rule, 48h recency 1.5×, confidence < 0.4 → Cannot determine
```
![Headlight app screenshot](/data/image.png)
- Zero recent articles skips the LLM entirely ("No recent news.").
- Invalid LLM JSON gets one repair retry, then falls back to Cannot determine.
- API keys are only read in route handlers and never reach the browser.
- Manual refresh is limited to once per stock every 5 minutes.

## Run it

```bash
npm install
# fill in .env.local (see below)
npm run dev        # http://localhost:3000
```

No keys yet? Set `DEMO_MODE=1` in `.env.local` to serve canned sample results. In demo mode, pressing **Refresh** flips the label of a few stocks (TCS, RELIANCE, ADANIENT, IDEA) so you can show the "what changed" badge live.

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter key (server-side only) |
| `OPENROUTER_MODEL` | Model ID from openrouter.ai/models (a free model works) |
| `OPENROUTER_BASE_URL` | Defaults to `https://openrouter.ai/api/v1` |
| `SERPAPI_API_KEY` | SerpApi key for Google News |
| `CACHE_TTL_MINUTES` | Server cache per stock (default 60) |
| `MAX_ARTICLES_PER_STOCK` | Default 10 |
| `NEWS_WINDOW_DAYS` | Default 7 |
| `NEXT_PUBLIC_MAX_WATCHLIST_SIZE` | Default 25 |
| `DEMO_MODE` | `1` = canned results, no keys needed |


## Notes

- **Lists:** up to 8 lists with 25 stocks each. Names are 1 to 24 characters and unique. Sentiment is cached per stock, so a stock in two lists is analyzed once. Lists from an earlier version are migrated automatically into "My watchlist".
- **Market Pulse** analyzes 50 stocks (2 at a time). On a free model you may hit rate limits; failed tiles can be retried and finished tiles are kept.
- Errors are logged with their reason in the server terminal and the browser console.

## Develop

```bash
npm test         # unit tests (filter, dedupe, aggregation, schema, search, hooks, pipeline)
npm run lint
npm run build
```
Specs and plan live in `docs/`.
