# NLP Pipeline

This document explains how a raw user message becomes a ranked, structured set of place recommendations, and then a natural-language reply. It covers `nlp/api.py`, `nlp/final.py`, `nlp/Phase_2.py`, and `nlp/nlp_layer.py`.

## Design principle: rule-based search, LLM only at the end

The NLP service does **not** call any LLM. Every step — dish parsing, geo-search, scoring, card formatting, and the follow-up/context heuristics — is deterministic Python (regex, keyword matching, weighted scoring formulas, simple text similarity). The only generative model in the whole system is **Ollama**, invoked from the Next.js `/api/chat` route *after* the NLP service has already produced its structured JSON. This keeps search behavior debuggable and reproducible, and means the NLP service can be tested and iterated on without needing a model running at all.

## Entry points (`nlp/api.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Health check |
| `/query` | POST | Stateless-per-call HTTP endpoint used by the Next.js `/api/chat` route. Accepts `{ query, lat?, lon?, top_k?, session_id? }`, returns structured JSON (`intent`, `cards`, etc.) |
| `/ws/chat` | WebSocket | Standalone conversational endpoint (used for CLI/manual testing or a future direct WS client), returns plain-text replies per message |

Both endpoints delegate to a `GeoFoodSession` object. `/query` keys sessions by `session_id` (the conversation's `convoId`) in an **in-memory dict** (`_sessions`), so conversational context (last results, focused place) survives across separate HTTP requests within the same conversation — but not across a server restart, and not across multiple worker processes. For anything beyond local/single-instance deployment, swap this for a real store (Redis, a DB-backed session row, etc).

Both blocking pipeline calls (`session.handle_message` / `session.handle_message_structured`) run via `asyncio.to_thread(...)`, because the underlying pipeline does synchronous HTTP requests and HTML scraping and would otherwise block the FastAPI event loop.

## Session & context management (`nlp/final.py`)

`GeoFoodSession` holds per-conversation state:

- `last_geo_data` — the raw result of the last `find_places` call
- `last_raw_top_places` / `last_places_for_layer` — the ranked places from that call
- `last_nlp_answer` — the last formatted card set
- `focus_index` — which place in the last result list is currently "in focus" for pronoun-like follow-ups ("is it open now?", "what's the address?")

### New search vs. follow-up

`_is_new_search_intent(user_text)` decides how to treat each incoming message:

- **No prior context** → always a new search.
- **Explicit follow-up markers** (`"top 3"`, `"second place"`, `"from these"`, `"best from the three"`, etc.) → treated as a follow-up against the existing result set, not a new search.
- **A message that looks like a fresh dish/budget request** → new search, which resets context via `reset()` and calls into `Phase_2.find_places_extended`.
- Otherwise → follow-up, handled by `_handle_follow_up`, which supports things like:
  - Selecting a place by ordinal ("the second one") — `_parse_place_index_from_text` / `_get_card_and_place_by_index`
  - Selecting a place by name — `_set_focus_by_name`
  - Asking about opening hours — `_format_opening_hours`
  - Asking for a phone number — `_extract_phone_from_place`
  - Asking for a map link — `_build_maps_link` (constructs a Google Maps search/place URL)

`handle_message_structured` is the method actually used by the `/query` HTTP endpoint; it returns a dict rather than a formatted string, so the caller (Next.js) can pass it straight through to Ollama as JSON.

## Geo-search pipeline (`nlp/Phase_2.py`)

### 1. Query parsing

- `parse_dish_from_query(query)` — extracts the food/dish term from free text.
- `get_filters_and_keywords_for_dish(dish)` + `get_synonyms(term)` — expands the dish into related OSM tag filters and keyword synonyms (so "biryani" also matches listings mentioning "rice dish", etc., depending on the synonym table).
- `parse_budget_from_query(query)` — extracts a numeric budget (e.g. "under 300") if present.

### 2. Candidate discovery

- **Primary**: `overpass_query_places(lat, lon, radius_m, ...)` — queries the Overpass API for OSM nodes/ways tagged as relevant food venues within a radius (default 3 km), retrying across three public Overpass mirrors with backoff (`MAX_OVERPASS_RETRIES`). Warnings here (up to ~9 per query across all retries/mirrors) reflect the reality of shared, rate-limited public OSM infrastructure — they don't indicate a missing key.
- **Fallback / enrichment**: if Overpass returns too little, `search_google_places(...)` and/or `search_foursquare(...)` are used, gated on `GOOGLE_PLACES_API_KEY` / `FOURSQUARE_API_KEY` being set as environment variables. `get_google_place_details` / `get_foursquare_place_details` / `get_foursquare_place_tips` pull richer per-place data (hours, reviews) when available.
- If the initial radius comes back thin, the pipeline widens the search radius and filter set and queries again (`expanded_radius`, `extra_filters`).

### 3. Enrichment via scraping

- `fetch_page_html(url)` fetches a place's website or aggregator page.
- `extract_aggregator_links(soup)` looks for links to food-delivery aggregators (Zomato/Swiggy-style patterns).
- `extract_menu_and_reviews_from_html(html)` pulls menu items and review-like text out of the page.
- `fetch_aggregator_data(...)` follows aggregator links to pull additional menu/review text.
- `clean_menu_items(...)` normalizes/dedupes extracted menu text.
- `fetch_page_html_with_browser(...)` is available as a headless-browser fallback for pages that need JS rendering (used sparingly — this is slower).
- `summarize_text(text)` produces a short summary of the scraped content for use in scoring and card display.

This step is best-effort: places without a discoverable website/aggregator page simply skip straight to scoring with whatever structured data (name, rating, tags, location) was available from Overpass/Google/Foursquare.

### 4. Deduplication

`dedupe_and_merge_results(osm_results, google_results, dedupe_radius_m=60)` merges OSM and Google/Foursquare entries that are almost certainly the same physical place — matching on proximity (within `dedupe_radius_m`) and normalized name similarity (`_normalize_name`) — so a place doesn't show up twice with two different score profiles.

### 5. Scoring

`compute_final_score_for_entry(...)` computes a single 0–1 score per candidate as a weighted blend of five components:

```
score = 0.30 · preference_score      # dish/text relevance
      + 0.25 · rating_score          # normalized rating
      + 0.20 · price_score           # fit to stated budget
      + 0.15 · distance_score        # closer = higher, decays past ~8km
      + 0.10 · time_score            # 1.0 open, 0.0 closed, 0.5 unknown
```

- **`preference_score`** blends simple keyword/text matching (`score_text_simple`, `detect_dish_presence_keyword`) with an optional semantic similarity step using sentence embeddings (`HAS_ST` / `ST_MODEL`, if the `sentence-transformers`-based summarizer is available in the environment) and a `dish_match_metrics.total_score` computed by `compute_dish_match_metrics` from menu/review evidence.
- **`rating_score`** is `normalize_rating_0_1(rating)`, scaling a 0–5 rating to 0–1.
- **`distance_score`** linearly decays to 0 at 8 km using the Haversine distance (`haversine_km`).
- **`time_score`** is a simple three-way value based on `is_open_now`.
- **`price_score`** rewards estimated prices at or under the user's stated budget, and decays proportionally to how far over budget a place's estimated price is; if no budget was given, this component defaults to a neutral 0.5.

Each entry's `score_components` dict (including the weights used) is attached to the result, so the reasoning behind a ranking can be inspected or surfaced to the user later if desired. `normalize_scores(...)` then rescales the raw scores across the full result set to a consistent 0–1 range before the top-K are returned by `find_places(...)` / `find_places_extended(...)`.

## Card formatting (`nlp/nlp_layer.py`)

Given the ranked results from `final.py`, `nlp_layer.py` builds the "cards" array that ends up in the structured JSON response:

- `pick_top_results(data, top_k)` — re-sorts and slices to the top K by score, defensively (in case they weren't already sorted).
- `choose_primary_link(place)` — prefers an official website, then a source URL, then any evidence URL.
- Per-place cards include: name, address/location, score breakdown, evidence snippets (from scraped menu/review text), a primary link, and — if `GOOGLE_SEARCH_API_KEY` / `GOOGLE_CSE_ID` are configured — an image fetched via Google Custom Search Image search.

None of this formatting involves an LLM call; it's templated string/dict construction, which is also why the response is fast enough to run synchronously inside the `/query` request rather than needing to be streamed.

## Handoff to Ollama

The structured JSON returned by `/query` (intent + cards, or an `nlp_unavailable` fallback if the service errored) is passed by the Next.js `/api/chat` route as the content of a system prompt, instructing Ollama to answer naturally without referencing JSON, fields, or "structured data" explicitly. Ollama has no tools, no retrieval, and no knowledge of Overpass/Google/Foursquare — its only job is to turn already-ranked, already-fetched data into a friendly sentence or two.

## Local CLI usage

`final.py` can be run standalone for testing the pipeline without the API layer:

```bash
python final.py --lat 17.3850 --lon 78.4867
```

Then interact conversationally in the terminal — the same intent/follow-up heuristics described above apply, e.g.:

```
You: Nearest biryani under 300
You: Top 5 places
You: Best one
You: Show me details of second place
You: Is it open now?
You: What are the opening timings?
You: Now where can I get desserts near me
```