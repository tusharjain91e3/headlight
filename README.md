# Headlight

Shine a light on the news behind your stocks. Headlight reads the last 7 days of Google News for any NSE-listed company, has an LLM classify each headline, and tells you at a glance whether the coverage is **Positive**, **Neutral**, **Negative**, or **Cannot determine**.

- Build a watchlist (stored in your browser only; no sign-in) and see it grouped by sentiment.
- Search any of the 2,592 NSE stocks for a one-off read, then add it with one tap.
- Open any stock to see the articles behind its label, with a per-article verdict.

> Sentiment is generated automatically from headlines and snippets. It is not investment advice.

## Run it

```bash
npm install
# fill in .env.local (see below)
npm run dev        # http://localhost:3000
```

No keys yet? Set `DEMO_MODE=1` in `.env.local` to serve canned sample results.

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

- Zero recent articles skips the LLM entirely ("No recent news.").
- Invalid LLM JSON gets one repair retry, then falls back to Cannot determine.
- API keys are only read in route handlers and never reach the browser.
- Manual refresh is limited to once per stock every 5 minutes.

## Develop

```bash
npm test         # unit tests (filter, dedupe, aggregation, schema, search, hooks, pipeline)
npm run lint
npm run build
```
Specs and plan live in `docs/`.
