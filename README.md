# College Bulk Planner

A dark mode UCSC dining website with live campus menus plus an optional vegetarian meal planner for College Nine / John R. Lewis. Node 22+; no npm dependencies or API keys are required for the dining dashboard.

## Run

```sh
node server.mjs
```

Open http://127.0.0.1:3210. Run tests with `node --test`.

## Dining dashboard

The first screen is designed to require almost no input.

* Uses America/Los_Angeles time automatically.
* Defaults to today and discovers the future dates UCSC has actually posted.
* Discovers UCSC FoodPro dining locations from the live location page instead of limiting the website to a hardcoded five hall list.
* Reads every location's posted meal periods and short menu for the selected date.
* Prioritizes locations that are currently serving food.
* Automatically selects the meal that matches the current regular serving period when that period has a full menu.
* Treats Continuous Dining as limited service and does not claim the complete Lunch or Dinner menu is available during that window.
* Shows every published meal period as tabs, including Breakfast, Brunch, Lunch, Dinner, Late Night, or other names UCSC publishes.
* Groups full menus by UCSC station/category and reads nutrition labels on demand for the selected location and meal.
* Keeps food search, vegetarian filtering, nutrition sorting, manual location selection, and manual date selection available as optional controls.
* Uses a dark interface by default and adapts to desktop and mobile screens.

### Regular serving schedules built in

Regular schedules are encoded for the five dining halls from the schedules supplied for this project:

* College Nine / John R. Lewis
* Cowell / Stevenson
* Crown / Merrill
* Porter / Kresge
* Rachel Carson / Oakes

Cafes, markets, and other discovered FoodPro locations still show their live menus. Their open/closed status is not guessed until verified serving hours are added.

Regular schedule data is only a convenience. Special closures, holiday hours, substitutions, and real time changes can differ from the normal schedule.

## Menu integrity

The importer establishes a FoodPro session before requests and supplies the missing InCommon ECC OV SSL CA 3 intermediate. The bundled public certificate was obtained from its issuer URL (`http://crt.sectigo.com/InCommonECCOVSSLCA3.crt`) and its signature is verified against Node's trusted roots at startup. TLS and hostname verification stay enabled.

Menu responses and nutrition labels are cached in memory for 10 minutes. A requested date must match the date UCSC returns. No stale menu is substituted when a date fails. Individual nutrition label failures produce partial menus with unavailable values instead of invented nutrition.

## Personal planner

The lower section of the website keeps the deterministic C9 vegetarian planner. It can:

* Plan C9 main meals around busy blocks, serving windows, and a travel buffer.
* Filter verified date specific vegetarian foods, egg/dairy preferences, and named allergens.
* Search combinations of one or two entrée servings and up to two distinct sides.
* Track planned versus eaten portions during the current browser session.
* Import read only Google Calendar availability.
* Export the plan as JSON for ALVIS.

The personal planner is still C9 focused. The campus wide live dining dashboard is separate and works across the FoodPro locations UCSC publishes.

## Google Calendar

The connected ChatGPT Calendar tool belongs to the chat, not this standalone website. A local `data/calendar.json` snapshot can be populated by an authorized assistant and is ignored by Git.

For independent live reads:

1. Enable Calendar API in your Google Cloud project and create a Desktop app OAuth client.
2. Set `GOOGLE_CLIENT_ID` and, if supplied, `GOOGLE_CLIENT_SECRET` in your local environment.
3. Optionally set `GOOGLE_CALENDAR_IDS` to a comma separated list of calendar IDs. The default is `primary`.
4. Start the server and click Connect Google. The loopback callback is `http://127.0.0.1:3210/auth/google/callback` unless PORT is changed.
5. Import availability for the selected date.

Access tokens live in memory only and expire. No event writes, persistent refresh token, or background sync are used.

## Security

The development server binds to localhost only. Host and mutation origin checks remain enabled. No third party browser scripts are loaded. Menu names are rendered as text. Calendar tokens stay server side. Personal preferences stay in browser local storage.
