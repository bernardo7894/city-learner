import { SCHEMA_VERSION, STORAGE_KEY } from '../config'
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
      showMasteredLabels: true,
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
    settings: { ...base.settings, ...(candidate.settings ?? {}) },
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

export function importProgress(serialized: string, cities: City[]): ProgressData {
  const parsed = JSON.parse(serialized)
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== SCHEMA_VERSION || typeof parsed.memories !== 'object') {
    throw new Error('This is not a compatible Atlas Recall progress file.')
  }
  return migrateProgress(parsed, cities)
}
