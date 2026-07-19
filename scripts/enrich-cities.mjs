import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache', 'geonames')
const sources = {
  cities: 'https://download.geonames.org/export/dump/cities500.zip',
  countries: 'https://download.geonames.org/export/dump/countryInfo.txt',
  admin1: 'https://download.geonames.org/export/dump/admin1CodesASCII.txt',
}

const normalize = (value) => value
  .trim()
  .toLocaleLowerCase('en')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘`´]/g, "'")
  .replace(/[‐‑‒–—−-]/g, ' ')
  .replace(/[^\p{L}\p{N}' ]/gu, ' ')
  .replace(/'/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const commonAliases = {
  bengaluru: ['Bangalore'],
  kolkata: ['Calcutta'],
  chennai: ['Madras'],
  mumbai: ['Bombay'],
  'ho chi minh city': ['Saigon', 'Ho Chi Minh'],
  'new taipei': ['New Taipei City'],
  'quezon city': ['Quezon'],
  'caloocan city': ['Caloocan'],
  'cartagena de indias': ['Cartagena'],
  'ciudad nezahualcoyotl': ['Nezahualcóyotl', 'Ciudad Neza'],
  'navi mumbai': ['New Bombay'],
  'da nang': ['Danang'],
  'thu duc': ['Thủ Đức', 'Thu Duc City'],
  'kuala lumpur': ['KL'],
  'hohhot': ['Hohhot', 'Huhehaote'],
  'fuzhou': ['Foochow'],
  'guangzhou': ['Canton'],
  'harbin': ['Haerbin'],
  'tehran': ['Teheran'],
  'tbilisi': ['Tiflis'],
}

async function download(name, url) {
  const path = join(cacheDir, name)
  if (existsSync(path)) return path
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`)
  await mkdir(cacheDir, { recursive: true })
  await writeFile(path, new Uint8Array(await response.arrayBuffer()))
  return path
}

function parseCountries(text) {
  const result = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const fields = line.split('\t')
    result.set(fields[0], fields[4])
  }
  return result
}

function parseAdmin1(text) {
  const result = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const [code, name] = line.split('\t')
    result.set(code, name)
  }
  return result
}

function cityFromRow(fields) {
  return {
    geonamesId: Number(fields[0]),
    name: fields[1],
    asciiName: fields[2],
    alternateNames: fields[3] ? fields[3].split(',') : [],
    latitude: Number(fields[4]),
    longitude: Number(fields[5]),
    countryCode: fields[8],
    admin1Code: fields[10],
    population: Number(fields[14]) || undefined,
  }
}

const seedText = await readFile(join(root, 'data', 'raw', 'city-seed.txt'), 'utf8')
const seedNames = seedText.trim().split('|').map((name) => name.trim())
const overrides = JSON.parse(await readFile(join(root, 'data', 'overrides.json'), 'utf8'))

const occurrenceTotals = new Map()
for (const name of seedNames) occurrenceTotals.set(name, (occurrenceTotals.get(name) ?? 0) + 1)
const seen = new Map()
const seeds = seedNames.map((seedName) => {
  const occurrence = (seen.get(seedName) ?? 0) + 1
  seen.set(seedName, occurrence)
  const key = occurrenceTotals.get(seedName) > 1 ? `${seedName}#${occurrence}` : seedName
  return { seedName, key, occurrence, override: overrides[key] ?? overrides[seedName] }
})

const targetNames = new Map()
for (const seed of seeds) {
  const names = [seed.seedName, seed.override?.matchName, ...(seed.override?.aliases ?? [])].filter(Boolean)
  for (const name of names) {
    const key = normalize(name)
    const current = targetNames.get(key) ?? new Set()
    current.add(seed.seedName)
    targetNames.set(key, current)
  }
}

console.log('Downloading/reading the official GeoNames city dump…')
const [citiesZipPath, countryPath, adminPath] = await Promise.all([
  download('cities500.zip', sources.cities),
  download('countryInfo.txt', sources.countries),
  download('admin1CodesASCII.txt', sources.admin1),
])
const [countriesText, adminText, zipBytes] = await Promise.all([
  readFile(countryPath, 'utf8'),
  readFile(adminPath, 'utf8'),
  readFile(citiesZipPath),
])
const countries = parseCountries(countriesText)
const admin1 = parseAdmin1(adminText)
const archive = unzipSync(new Uint8Array(zipBytes))
const cityFile = archive['cities500.txt']
if (!cityFile) throw new Error('cities500.txt was missing from the GeoNames archive')
const cityText = new TextDecoder().decode(cityFile)

const candidatesBySeed = new Map(seedNames.map((name) => [name, new Map()]))
for (const line of cityText.split('\n')) {
  if (!line) continue
  const fields = line.split('\t')
  const names = [fields[1], fields[2], ...(fields[3] ? fields[3].split(',') : [])]
  const matchedSeeds = new Set()
  for (const name of names) {
    const targets = targetNames.get(normalize(name))
    if (targets) for (const target of targets) matchedSeeds.add(target)
  }
  if (!matchedSeeds.size) continue
  const candidate = cityFromRow(fields)
  for (const seedName of matchedSeeds) candidatesBySeed.get(seedName).set(candidate.geonamesId, candidate)
}

function selectCandidate(seed, candidates) {
  let pool = candidates
  const override = seed.override
  if (override?.geonamesId) pool = pool.filter((city) => city.geonamesId === override.geonamesId)
  if (override?.countryCode) pool = pool.filter((city) => city.countryCode === override.countryCode)
  if (override?.admin1Code) pool = pool.filter((city) => city.admin1Code === override.admin1Code)
  return [...pool].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]
}

function manualCandidate(seed) {
  const override = seed.override
  if (!override?.geonamesId || override.latitude == null || override.longitude == null) return undefined
  return {
    geonamesId: override.geonamesId,
    name: override.displayName ?? seed.seedName,
    asciiName: seed.seedName,
    alternateNames: override.aliases ?? [],
    latitude: override.latitude,
    longitude: override.longitude,
    countryCode: override.countryCode,
    admin1Code: override.admin1Code ?? '',
    population: override.population,
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  sources,
  seedCount: seeds.length,
  distinctRawLabels: new Set(seedNames).size,
  unmatchedEntries: [],
  ambiguousEntries: [],
  duplicateSeedLabels: [...occurrenceTotals].filter(([, count]) => count > 1).map(([label, count]) => ({ label, count })),
  resolutions: [],
}
const cities = []

for (const seed of seeds) {
  const candidates = [...(candidatesBySeed.get(seed.seedName)?.values() ?? [])]
  const selected = selectCandidate(seed, candidates) ?? manualCandidate(seed)
  const candidateSummary = candidates
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 12)
    .map((city) => ({
      geonamesId: city.geonamesId,
      name: city.name,
      countryCode: city.countryCode,
      admin1Code: city.admin1Code,
      population: city.population,
    }))
  if (!selected) {
    report.unmatchedEntries.push({ key: seed.key, seedName: seed.seedName, candidates: candidateSummary })
    continue
  }
  if (candidates.length > 1) {
    report.ambiguousEntries.push({ key: seed.key, selected: selected.geonamesId, candidateCount: candidates.length })
  }
  const displayName = seed.override?.displayName ?? selected.name
  const curatedAliases = [...(commonAliases[seed.seedName] ?? []), ...(seed.override?.aliases ?? [])]
  const acceptedAnswers = [...new Set([
    seed.seedName,
    displayName,
    displayName.replace(/, .+$/, ''),
    selected.name,
    selected.asciiName,
    ...curatedAliases,
  ].filter(Boolean))]
  const alternateNames = [...new Set([selected.name, selected.asciiName, ...curatedAliases])]
  const idStem = normalize(seed.seedName).replace(/\s+/g, '-')
  const id = `${idStem}-${selected.countryCode.toLowerCase()}-${selected.geonamesId}`
  const population = selected.population
  const importance = population && population >= 8_000_000 ? 4 : population && population >= 3_000_000 ? 3 : population && population >= 1_000_000 ? 2 : 1
  const fieldsOverridden = seed.override ? Object.keys(seed.override).filter((field) => field !== 'aliases') : []
  cities.push({
    id,
    seedName: seed.seedName,
    displayName,
    countryCode: selected.countryCode,
    countryName: countries.get(selected.countryCode) ?? selected.countryCode,
    admin1: admin1.get(`${selected.countryCode}.${selected.admin1Code}`),
    latitude: selected.latitude,
    longitude: selected.longitude,
    population,
    geonamesId: selected.geonamesId,
    acceptedAnswers,
    alternateNames,
    importance,
    dataConfidence: seed.override ? 'verified' : 'probable',
  })
  report.resolutions.push({
    key: seed.key,
    seedName: seed.seedName,
    selected: { geonamesId: selected.geonamesId, name: selected.name, countryCode: selected.countryCode },
    confidence: seed.override ? 'verified' : 'probable',
    fieldsOverridden,
    candidatesConsidered: candidateSummary,
  })
}

const reportPath = join(root, 'data', 'enrichment-report.json')
await mkdir(dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
if (report.unmatchedEntries.length) {
  throw new Error(`${report.unmatchedEntries.length} seed entries were unresolved. See data/enrichment-report.json.`)
}
if (cities.length !== seeds.length) throw new Error(`Expected ${seeds.length} cities, generated ${cities.length}`)
if (new Set(cities.map((city) => city.id)).size !== cities.length) throw new Error('Generated city IDs are not unique')

const outputPath = join(root, 'src', 'data', 'cities.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(cities, null, 2)}\n`)
console.log(`Wrote ${cities.length} resolved cities to src/data/cities.json`)
console.log('Wrote the candidate audit trail to data/enrichment-report.json')
