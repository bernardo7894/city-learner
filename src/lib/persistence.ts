import { QUEUE_CONFIG, SCHEMA_VERSION, STORAGE_KEY } from '../config'
import type { City, ProgressData } from '../types'

export function createEmptyProgress(cities: City[], now = new Date()): ProgressData {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    memories: {},
    confusions: [],
    anchors: [],
    suspendedCityIds: [],
    settings: {
      sessionLength: 15,
      newCitiesPerSession: QUEUE_CONFIG.defaultNewPerSession,
      showMasteredLabels: true,
      showExploreCityLabels: false,
      showCountryNames: false,
      showCountryBoundaries: true,
      showAnchors: true,
      showWeakHeat: false,
    },
  }
}

export function migrateProgress(value: unknown, cities: City[]): ProgressData {
  if (!value || typeof value !== 'object') return createEmptyProgress(cities)
  const candidate = value as Partial<ProgressData>
  if (candidate.schemaVersion !== SCHEMA_VERSION) return createEmptyProgress(cities)
  const base = createEmptyProgress(cities)
  return {
    ...base,
    ...candidate,
    memories: candidate.memories ?? {},
    confusions: candidate.confusions ?? [],
    anchors: candidate.anchors ?? base.anchors,
    suspendedCityIds: candidate.suspendedCityIds ?? [],
    settings: {
      ...base.settings,
      ...(candidate.settings ?? {}),
      newCitiesPerSession: Math.max(1, Math.min(QUEUE_CONFIG.maxNewPerSession, Number(candidate.settings?.newCitiesPerSession) || base.settings.newCitiesPerSession)),
    },
  }
}

export function loadProgress(cities: City[]): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? migrateProgress(JSON.parse(raw), cities) : createEmptyProgress(cities)
  } catch {
    return createEmptyProgress(cities)
  }
}

export function saveProgress(progress: ProgressData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }))
}

export function exportProgress(progress: ProgressData): string {
  return JSON.stringify(progress, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function importProgress(serialized: string, cities: City[]): ProgressData {
  const parsed = JSON.parse(serialized)
  if (
    !isRecord(parsed)
    || parsed.schemaVersion !== SCHEMA_VERSION
    || !isRecord(parsed.memories)
    || !Array.isArray(parsed.confusions)
    || !Array.isArray(parsed.anchors)
    || !Array.isArray(parsed.suspendedCityIds)
    || !isRecord(parsed.settings)
  ) {
    throw new Error('This is not a compatible Atlas Recall progress file.')
  }
  return migrateProgress(parsed, cities)
}

export function exportProgressCode(progress: ProgressData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(progress))
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function importProgressCode(encoded: string, cities: City[]): ProgressData {
  try {
    const compact = encoded.replace(/\s/g, '')
    if (!compact) throw new Error('Empty transfer code')
    const binary = atob(compact)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return importProgress(new TextDecoder().decode(bytes), cities)
  } catch (error) {
    if (error instanceof Error && error.message === 'This is not a compatible Atlas Recall progress file.') throw error
    throw new Error('This is not a valid Atlas Recall Base64 transfer code.')
  }
}
