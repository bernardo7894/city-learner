import { QUEUE_CONFIG } from '../config'
import type { City, Direction, MemoryState, ProgressData, SessionItem, SessionMode } from '../types'
import { createMemory, memoryKey, retrievability } from './scheduler'

const directions: Direction[] = ['location-to-name', 'name-to-location']

export function priorityScore(memory: MemoryState, city: City, progress: ProgressData, now = new Date()): number {
  const dueMs = new Date(memory.dueAt).getTime()
  const overdueDays = Math.max(0, (now.getTime() - dueMs) / 86_400_000)
  const risk = 1 - retrievability(memory, now)
  const confusion = progress.confusions
    .filter((edge) => edge.sourceCityId === city.id || edge.confusedWithCityId === city.id)
    .reduce((sum, edge) => sum + edge.strength, 0)
  return overdueDays * QUEUE_CONFIG.overdueWeight
    + risk * QUEUE_CONFIG.forgettingRiskWeight
    + memory.lapses * QUEUE_CONFIG.lapseWeight
    + confusion * QUEUE_CONFIG.confusionWeight
    + city.importance * QUEUE_CONFIG.importanceWeight
}

function isCityNew(cityId: string, progress: ProgressData): boolean {
  return directions.every((direction) => !progress.memories[memoryKey(cityId, direction)])
}

function dueMemories(cities: City[], progress: ProgressData, now: Date) {
  const cityMap = new Map(cities.map((city) => [city.id, city]))
  return Object.values(progress.memories)
    .filter((memory) => new Date(memory.dueAt) <= now && !progress.suspendedCityIds.includes(memory.cityId) && !progress.anchors.includes(memory.cityId))
    .filter((memory) => memory.status !== 'new')
    .map((memory) => ({ memory, city: cityMap.get(memory.cityId) }))
    .filter((item): item is { memory: MemoryState; city: City } => Boolean(item.city))
    .sort((a, b) => priorityScore(b.memory, b.city, progress, now) - priorityScore(a.memory, a.city, progress, now))
}

function interleave(items: SessionItem[]): SessionItem[] {
  const result: SessionItem[] = []
  const remaining = [...items]
  while (remaining.length) {
    const last = result.at(-1)
    let index = remaining.findIndex((item) => item.cityId !== last?.cityId && (item.kind !== 'question' || last?.kind !== 'question' || item.direction !== last.direction))
    if (index < 0) index = remaining.findIndex((item) => item.cityId !== last?.cityId)
    if (index < 0) index = 0
    result.push(remaining.splice(index, 1)[0])
  }
  return result
}

function newCityItems(cities: City[], progress: ProgressData, limit: number): SessionItem[] {
  const chosen = cities
    .filter((city) => isCityNew(city.id, progress) && !progress.suspendedCityIds.includes(city.id) && !progress.anchors.includes(city.id))
    .sort((a, b) => b.importance - a.importance || a.displayName.localeCompare(b.displayName))
    .slice(0, limit)
  return [
    ...chosen.map((city) => ({ id: `teach-${city.id}`, kind: 'teach' as const, cityId: city.id })),
    ...chosen.map((city) => ({ id: `locate-${city.id}`, kind: 'question' as const, cityId: city.id, direction: 'name-to-location' as const })),
    ...chosen.map((city) => ({ id: `name-${city.id}`, kind: 'question' as const, cityId: city.id, direction: 'location-to-name' as const })),
  ]
}

export function selectSessionQueue(
  mode: SessionMode,
  cities: City[],
  progress: ProgressData,
  now = new Date(),
): SessionItem[] {
  const limit = progress.settings.sessionLength
  const newCityLimit = Math.min(QUEUE_CONFIG.maxNewPerSession, Math.max(1, progress.settings.newCitiesPerSession))
  if (mode === 'learn') return interleave(newCityItems(cities, progress, newCityLimit))

  if (mode === 'confusion') {
    return progress.confusions
      .filter((edge) => edge.strength >= 2)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit)
      .map((edge, index) => ({
        id: `contrast-${index}-${edge.sourceCityId}-${edge.confusedWithCityId}`,
        kind: 'contrast',
        cityId: index % 2 ? edge.confusedWithCityId : edge.sourceCityId,
        otherCityId: index % 2 ? edge.sourceCityId : edge.confusedWithCityId,
      }))
  }

  if (mode === 'placement') {
    const sample = cities
      .filter((city) => !progress.suspendedCityIds.includes(city.id))
      .sort((a, b) => b.importance - a.importance || a.countryCode.localeCompare(b.countryCode))
      .filter((city, index, all) => all.findIndex((other) => other.countryCode === city.countryCode) === index || index % 7 === 0)
      .slice(0, Math.max(3, Math.floor(limit / 2)))
    return interleave(sample.flatMap((city) => directions.map((direction) => ({
      id: `placement-${direction}-${city.id}`,
      kind: 'question' as const,
      cityId: city.id,
      direction,
      placement: true,
    })))).slice(0, limit)
  }

  const due = dueMemories(cities, progress, now)
  let selected = due
  if (mode === 'weak') {
    const cityMap = new Map(cities.map((city) => [city.id, city]))
    selected = Object.values(progress.memories)
      .filter((memory) => memory.status !== 'mastered' && !progress.suspendedCityIds.includes(memory.cityId) && !progress.anchors.includes(memory.cityId))
      .map((memory) => ({ memory, city: cityMap.get(memory.cityId) }))
      .filter((item): item is { memory: MemoryState; city: City } => Boolean(item.city))
      .sort((a, b) => {
        const weakness = (memory: MemoryState) => memory.lapses * 3 + memory.difficulty + (memory.averageClickErrorKm ?? 0) / 300 + (memory.averageResponseMs ?? 0) / 10_000 - memory.stabilityDays / 10
        return weakness(b.memory) - weakness(a.memory)
      })
  }

  const reviewItems: SessionItem[] = selected.map(({ memory }) => ({
    id: `review-${memory.direction}-${memory.cityId}`,
    kind: 'question',
    cityId: memory.cityId,
    direction: memory.direction,
  }))

  if (mode === 'review' && due.length < QUEUE_CONFIG.backlogBeforeNewIsReduced) {
    const newLimit = due.length === 0 ? newCityLimit : 1
    reviewItems.push(...newCityItems(cities, progress, newLimit))
  }
  return interleave(reviewItems).slice(0, limit)
}

export function countDue(progress: ProgressData, now = new Date()): number {
  return Object.values(progress.memories).filter((memory) => memory.status !== 'new' && new Date(memory.dueAt) <= now).length
}

export function getOrCreateMemory(progress: ProgressData, cityId: string, direction: Direction, now = new Date()): MemoryState {
  return progress.memories[memoryKey(cityId, direction)] ?? createMemory(cityId, direction, now)
}
