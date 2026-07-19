# Atlas Recall

Atlas Recall is an offline-capable browser geography game for building a durable mental map of 324 large world cities. It looks and plays like a map game, while a deterministic spaced-repetition scheduler quietly tracks two separate memories for every city:

- naming a city from a marked location;
- locating a city from its name.

The game automatically infers Again, Hard, Good, or Easy from accuracy, time, hints, typos, and click distance. Players never self-grade during normal play.

## Run it

Requirements: Node.js 20.19+ (Node 22 or 24 recommended) and npm.

```bash
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`.

```bash
npm run test
npm run build
```

The production build is written to `dist/`. There is no backend, map tile server, commercial API, account, or runtime data fetch. Progress is stored in browser `localStorage`. Once dependencies are installed, gameplay and production builds work offline.

## What is implemented

- Map-first acquisition screens with nearby anchors
- Location → name questions with deaccented aliases, punctuation normalization, guarded typo tolerance, hints, and reveal
- Name → location questions with Haversine distance and 100/300/700 km grading bands
- Separate scheduling state for both question directions
- Due-review, weak-city, placement, and configurable new-city queues
- Explicit confusion edges when another curriculum city is entered or clicked
- Contrast drills that gradually weaken—not instantly delete—confusion edges
- Fog-of-war city markers, mastered landmarks, a Europe-dense global reference-anchor layer, weak-city heat, country/anchor/label toggles, pan, and zoom
- Free-recall exam where omitted cities are classified by the player after the exam
- Full progress explorer with source identity, aliases, directional state, response metrics, and review dates
- Pin as anchor, suspend, mark already known, reset city, reset direction, and confirmed full reset
- Versioned JSON file and Base64 transfer-code export/import
- 324 resolved curriculum entries with 324 unique IDs, including the two Hyderabads and two San Joses

All core controls are live. This MVP uses a compact contrast drill (choose between two unlabeled markers) and a resumable short placement session rather than a large one-time exam.

## Architecture

```text
data/raw/city-seed.txt       exact authoritative curriculum
data/overrides.json          explicit identity/display/alias resolutions
data/enrichment-report.json  candidate audit trail and confidence
scripts/enrich-cities.mjs    repeatable GeoNames build-time pipeline
src/data/cities.json         compact runtime curriculum
src/lib/normalization.ts     answer normalization and guarded fuzzy match
src/lib/geography.ts         Haversine, click grading, nearest cities
src/lib/scheduler.ts         isolated deterministic scheduler
src/lib/queue.ts             adaptive session selection
src/lib/confusions.ts        confusion creation and gradual decay
src/lib/persistence.ts       schema, migration boundary, import/export
src/components/WorldMap.tsx  local D3 projection and bundled boundaries
src/test/                    learning-logic and integrity tests
```

React owns screen and session state. `useProgress` is the single persistence seam. The learning functions are framework-independent, deterministic, and covered by Vitest, making it straightforward to replace the scheduler with FSRS later.

## Scheduler decisions

Retrievability uses:

```text
R = exp(-elapsedDays / stabilityDays)
```

Initial intervals are 10 minutes (Again), 12 hours (Hard), 1 day (Good), and 3 days (Easy). For reviewed memories, stability is multiplied by 0.25, 1.3, 2.2, or 3.5 respectively. A lapse always gets a near-term 10-minute due time even when the reduced stability remains longer; this deliberately separates the relearning step from the longer-term strength estimate.

Queue priority combines overdue time, current forgetting risk, lapses, confusion strength, and a small importance term. Due and weak memories outrank secure knowledge. There is no daily introduction cap: dedicated Learn sessions introduce a configurable one to thirty cities (five by default), with a complete teaching and two-direction practice cycle for each. Partially completed introductions resume instead of becoming stranded. New-city batches are randomized within priority and deliberately diversify name prefixes and countries so their order does not leak an answer cue. Review sessions reduce new material to one when reviews exist and introduce none during a large backlog. The queue interleaves cities and question directions when alternatives exist.

Mastery requires both directional memories to have at least 30 days of stability, three consecutive correct answers, and three recent non-failing ratings. A failed maintenance review immediately removes mastered status.

## Rebuild the city dataset

The committed `src/data/cities.json` is ready to use. To reproduce or update it:

```bash
npm install
npm run enrich-cities
```

The command downloads official GeoNames `cities500.zip`, `countryInfo.txt`, and `admin1CodesASCII.txt` into ignored `.cache/geonames/`, then:

1. reads the exact pipe-separated seed;
2. indexes canonical, ASCII, and embedded alternate names only for requested tokens;
3. records every candidate considered;
4. applies explicit country/admin/GeoNames-ID overrides;
5. refuses to complete if any entry is unmatched or IDs collide;
6. writes the runtime JSON and audit report.

It does not silently take the first database row. When the upstream dump changes, review the diff in `data/enrichment-report.json` before committing regenerated data. The pipeline intentionally avoids GeoNames or Wikidata calls during gameplay.

The separate `alternateNamesV2.zip` is not required by this compact MVP because `cities500.txt` already embeds the relevant alternate-name field; high-value English/local/historic names are curated in overrides. It is the natural next source if wider language coverage is needed.

## Identity decisions and known uncertainties

Important explicit decisions include:

- `hyderabad#1` is India; `hyderabad#2` is Pakistan.
- `san jose#1` is California, United States; `san jose#2` is Costa Rica.
- Valencia is Venezuela; Córdoba is Argentina.
- Anyang is Henan, China; Taizhou is Jiangsu; Fuyang is Anhui.
- Vasai–Virar uses GeoNames' Virar populated-place identity and a curated combined-city display.
- Yongin uses the official GeoNames administrative identity because it is not emitted as a populated-place row in `cities500.txt`; its coordinates and identity are explicitly recorded in the override.
- Visakhapatnam is pinned to its city record to prevent a higher-population alternate-name candidate from winning.

Population fields come from GeoNames and can refer to inconsistent geographic definitions. Atlas Recall therefore shows only an importance tier during teaching and never treats population as a review target. Administrative spellings and transliterations continue to evolve; the seed token is always preserved, and curated old/common names remain accepted.

The bundled country geometry is Natural Earth-derived 1:110m topology. This deliberately simplified boundary layer keeps zooming and answer feedback responsive; it is not a source for borders at survey or political-claim precision.

See [ATTRIBUTION.md](./ATTRIBUTION.md) for source and license details.
