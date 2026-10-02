# College Bulk Planner

A local vegetarian dining planner for UCSC College Nine / John R. Lewis, with a reusable planning API for ALVIS. Node 22+; no dependencies or API keys required for the base planner.

## Run

```sh
node server.mjs
```

Open http://127.0.0.1:3210. Run tests with `node --test`.

## What works

- Live all-hall menu viewer with vegetarian filter, food search, and protein/calorie sorting.

- Plans C9 main meals around busy blocks, serving windows, and a travel buffer.
- Filters verified date-specific vegetarian foods, egg/dairy preferences, and named allergens.
- Searches combinations of one or two entrée servings and up to two distinct sides, reporting unmet targets rather than inventing foods.
- Eco-Box constraints: weekday service, confirmed eligibility/payment, one meal per period, one entrée with up to two sides, 10-minute pickup, 7am–10pm boundary.
- Tracks planned versus eaten portions within the current plan. Eaten checkboxes reset when the plan is rebuilt or the page reloads; they are not a long-term food diary.
- Read-only Google Calendar integration and local snapshots from a connected assistant.
- Shows optional Baskin café context after a calendar event at Baskin, without treating unverified café offerings as available or counting them in nutrition totals.
- Exports the plan as JSON for ALVIS.

## Honest limits

Live menu reading is implemented for all five dining halls. The viewer defaults to today in Pacific time, displays the meal periods published by UCSC (including brunch or late night where available), and reads per-serving calories/protein from the linked nutrition labels. Vegetarian filtering uses UCSC's vegan/vegetarian markers, never food-name guesses. Missing nutrition remains null and appears as a dash.

The importer establishes a FoodPro session before requests and supplies the missing InCommon ECC OV SSL CA 3 intermediate. The bundled public certificate was obtained from its issuer URL (`http://crt.sectigo.com/InCommonECCOVSSLCA3.crt`) and its signature is verified against Node's trusted roots at startup. TLS/hostname verification is never disabled. Menu and label responses are cached in memory for 10 minutes. No stale data is substituted when a date fails. Individual label failures produce partial menus. Select a hall, date and meal to browse; the daily planner remains C9-only and currently uses explicitly saved foods.

This version is a deterministic planner, not an LLM chat agent. It does not yet discover the nearest hall, maintain a durable intake diary, schedule background daily runs, or automatically deduct meal points. Café hours, inventory, walking distances and prices must be verified. It gives calendar context, not navigation. All main meals remain C9.

Calories and protein targets are deliberately user-entered. Optional adult resistance-training protein helper: 1.6 g/kg/day. A personalized calorie target requires body size, activity and weight trend. The algorithm approximates meal selection with a bounded beam search; it does not guarantee a global optimum or that every target can be met.

## Google Calendar

The connected Codex/ChatGPT Calendar tool belongs to the chat, not this standalone application. A local `data/calendar.json` snapshot can be populated by an authorized assistant; it is ignored by Git. UI imports these busy intervals and preserves manual blocks.

For independent live reads:

1. Enable Calendar API in your Google Cloud project and create a **Desktop app OAuth client**.
2. Set `GOOGLE_CLIENT_ID` and, if supplied, `GOOGLE_CLIENT_SECRET` in your local environment. Never commit credentials.
3. Optionally set `GOOGLE_CALENDAR_IDS` to a comma-separated list of calendar IDs; default is only `primary`.
4. Start the server and click Connect Google. Use an ordinary system browser if Google rejects embedded sign-in. The loopback callback is `http://127.0.0.1:3210/auth/google/callback` (or the configured PORT).
5. Click Import availability for the selected date. Access tokens live in memory only and expire; reconnect as needed. No event writes, persistent refresh token, or background sync.

Snapshots: `{ "syncedAt": "ISO timestamp", "days": { "2026-10-06": { "busy": [{ "start":"13:30", "end":"15:05", "location":"Baskin Engineering" }] } } }`.

## ALVIS integration

Import `planDay(input)` from `planner.mjs`, or POST JSON to `/api/plan` while running locally. Input fields are documented by `validate` and tests: date, calories, protein, eggs, dairy, allergens, travelMinutes, busy, meals, items, ecoAvailable, ecoPaid. Foods require date, period, name, serving, calories, protein, kind, diet, eggs, dairy, allergens and verified.

For future “I just left the gym” requests: ALVIS should collect current location/time and actual consumed portions, get verified menus/hours for candidate halls, subtract consumed nutrients from targets, and pass only feasible remaining options to the planner. Keep diet, verified-source and serving constraints outside the language model. The current planner deliberately supports only C9; other halls require a location-aware adapter and tests.

Security: localhost-only binding; host and mutation-origin checks; no third-party browser scripts; UI renders menu names as text; OAuth PKCE/state and an HttpOnly state cookie; calendar tokens stay server-side. Do not expose this development server on a public interface. Personal preferences live in browser local storage. Calendar snapshots in `data/` are private local files.

## Sources (checked October 2, 2026)

- [UCSC menu](https://nutrition.sa.ucsc.edu/shortmenu.aspx?locationNum=40)
- [C9 hours](https://dining.ucsc.edu/locations-hours/nine-jrl/): regular times can change; confirm for each date.
- [Eco-Box policy](https://dining.ucsc.edu/programs-policies/eco-box/)
- [Baskin Perk](https://dining.ucsc.edu/locations-hours/perk-baskin/)
- [Protein meta-analysis](https://pubmed.ncbi.nlm.nih.gov/28698222/)
- [USDA food handling](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/steps-keep-food-safe)
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth) and [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
