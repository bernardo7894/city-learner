# Curriculum data workflow

- `raw/city-seed.txt`: exact, authoritative, 324-item pipe-separated input.
- `overrides.json`: manually reviewed matching constraints, display names, and accepted aliases. Duplicate keys use `#1` / `#2` occurrence suffixes.
- `enrichment-report.json`: generated audit record with unmatched entries, ambiguous entries, duplicate labels, selected match, candidate set, confidence, and overridden fields.
- `../src/data/cities.json`: generated compact data bundled into the app.

Run `npm run enrich-cities` from the repository root. The command fails when any city is unresolved or when generated IDs are not unique. Inspect the report whenever upstream GeoNames data or manual overrides change.
