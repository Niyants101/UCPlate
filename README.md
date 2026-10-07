# UCPlate

UCPlate is a dark-mode dining and meal-planning website for University of California students. It is designed to combine official campus dining menus, nutrition data, a student's saved goals and dietary preferences, Google Calendar timing, and eventually live location into one answer: when to eat, where to go, and what to get.

UCPlate is an independent student-built service and is not affiliated with or endorsed by the University of California.

## Current rollout

UCPlate now has a campus-aware profile and a shared registry for all ten UC campuses:

* UC Berkeley
* UC Davis
* UC Irvine
* UCLA
* UC Merced
* UC Riverside
* UC San Diego
* UC San Francisco
* UC Santa Barbara
* UC Santa Cruz

UC Santa Cruz is the first live dining adapter. The other campuses are registered in `campuses.mjs` with their own adapter IDs and data roots so their official dining systems can be added without changing the user-facing planner architecture.

A user who selects a campus whose menu adapter is not live is never shown another campus's food by mistake. UCPlate saves the campus selection and routes the user to the campus rollout page until that adapter is available.

## Multi-campus architecture

The browser works against one normalized campus model:

```text
Campus
  -> dining locations
      -> serving schedules
      -> meal periods
          -> stations
              -> foods
                  -> serving size
                  -> calories / protein when published
                  -> dietary labels
                  -> allergens
                  -> exact official nutrition source
```

`campuses.mjs` is the registry for campus IDs, display names, adapter IDs, rollout status, and static data roots. The UCSC adapter currently writes to `./data`; future campuses are reserved under `./data/campuses/<campus-id>`.

The recommendation and calendar layers are intentionally campus-agnostic. New campus importers should normalize official dining data into the same location / meal / food structure rather than adding campus-specific logic to the UI.

## Hosted website

The GitHub Pages version is serverless. `.github/workflows/pages.yml` refreshes dining snapshots from the currently implemented campus importer and commits generated static JSON. The browser then loads the selected campus's data root.

For UCSC, the current importer:

* Uses America/Los_Angeles time.
* Discovers dates UCSC has actually posted.
* Discovers FoodPro locations instead of limiting the site to a hardcoded dining-hall list.
* Reads all published meal periods and station/category names.
* Fetches exact nutrition labels when available.
* Never invents missing calories, protein, allergens, or serving sizes.
* Treats Continuous Dining as limited service instead of assuming the full Lunch or Dinner menu is available.

## Personal profile

The first-time setup stores the following in browser local storage:

* UC campus
* Cut / maintain / gain label
* Daily calorie target
* Daily protein target
* Omnivore / vegetarian / vegan preference
* Published allergens to exclude
* Custom foods to avoid

Existing profiles created before campus selection was added are migrated to UC Santa Cruz because the previous website was UCSC-only.

## Plate recommendations

UCPlate groups foods by dining station and searches coherent combinations rather than treating the menu as a random macro pool. Recommendations only use foods with published numeric nutrition data and apply the user's diet, allergen, and custom avoid-food filters.

Allergy filtering is based only on campus-published information. UCPlate cannot verify cross-contact, substitutions, or special preparation.

## Google Calendar

`My Day` uses Google Identity Services and the Google Calendar API with the read-only scope:

```text
https://www.googleapis.com/auth/calendar.events.readonly
```

The browser receives a short-lived access token and stores it in `sessionStorage`. UCPlate does not request permission to create, edit, or delete events.

Calendar events are normalized into busy periods and combined with the selected campus's serving schedule to find useful meal windows between classes and other events.

## Run locally

Node 22+ is recommended.

```sh
node server.mjs
```

Open `http://127.0.0.1:3210` and run tests with:

```sh
node --test
```

The local Node implementation contains older project functionality in addition to the hosted static website. The root HTML / JavaScript files are the current GitHub Pages user experience.

## Adding another UC campus

A campus rollout should follow this order:

1. Add or confirm the campus entry in `campuses.mjs`.
2. Build an importer for the campus's official dining/menu source.
3. Normalize locations, meals, stations, foods, nutrition, allergens, and source links into the UCPlate model.
4. Write snapshots under that campus's configured `dataRoot`.
5. Add verified serving schedules or mark hours unknown rather than guessing them.
6. Add importer and normalization tests.
7. Change the campus registry `menuStatus` from `planned` to `live` only after its data is validated.

This keeps UCSC-specific parsing out of the recommendation, profile, and calendar interfaces and lets UCPlate scale campus by campus.

## Security and data handling

Personal plan settings stay in browser local storage. Google Calendar access tokens stay in browser session storage and expire. Menu names are rendered as text. Missing dining or nutrition information is not fabricated.
