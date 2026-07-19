# Data attribution

## GeoNames

City coordinates, stable GeoNames identifiers, country codes, administrative regions, population metadata, canonical/ASCII names, and selected alternate names are derived from the official [GeoNames export dump](https://download.geonames.org/export/dump/), specifically:

- `cities500.zip`
- `countryInfo.txt`
- `admin1CodesASCII.txt`

GeoNames data is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/). Attribution: GeoNames — [geonames.org](https://www.geonames.org/).

The user-provided curriculum remains authoritative. GeoNames enriches that curriculum and does not generate or remove its entries. Manual resolutions are recorded in `data/overrides.json`; candidate evidence is recorded in `data/enrichment-report.json`.

## Natural Earth / world-atlas

The local country boundary topology is the deliberately simplified 1:110m `countries-110m.json` artifact from the [`world-atlas`](https://github.com/topojson/world-atlas) package. `world-atlas` converts [Natural Earth](https://www.naturalearthdata.com/) Admin 0 country geometry to presimplified TopoJSON.

Natural Earth data is in the public domain. The `world-atlas` package and conversion code are distributed under the ISC license; its license is included with the installed package.

No external map tiles, commercial map APIs, or public tile servers are used at runtime.

## Application-curated content

Display-name choices, country qualification for duplicate names, and aliases such as Bengaluru/Bangalore, Kyiv/Kiev, Yangon/Rangoon, and Prayagraj/Allahabad are maintained in `data/overrides.json` and the enrichment script. These entries exist to make answer checking useful rather than to assert a single universal naming convention.
