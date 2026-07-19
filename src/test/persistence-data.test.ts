import { describe, expect, it } from 'vitest'
import citiesData from '../data/cities.json'
import type { City } from '../types'
import { createEmptyProgress, exportProgress, importProgress } from '../lib/persistence'
import { createMemory, memoryKey } from '../lib/scheduler'

const cities = citiesData as City[]

describe('persistence and curriculum integrity', () => {
  it('round-trips exported progress', () => {
    const city = cities[0]
    const progress = createEmptyProgress(cities, new Date('2026-01-01T00:00:00Z'))
    progress.memories[memoryKey(city.id, 'location-to-name')] = createMemory(city.id, 'location-to-name', new Date('2026-01-01T00:00:00Z'))
    progress.confusions = [{ sourceCityId: cities[0].id, confusedWithCityId: cities[1].id, strength: 2, lastOccurredAt: '2026-01-01T00:00:00Z', successfulDiscriminations: 0 }]
    expect(importProgress(exportProgress(progress), cities)).toEqual(progress)
  })

  it('contains all seed entries and gives duplicate labels distinct identities', () => {
    expect(cities).toHaveLength(324)
    expect(new Set(cities.map((city) => city.id)).size).toBe(324)
    for (const label of ['hyderabad', 'san jose']) {
      const duplicates = cities.filter((city) => city.seedName === label)
      expect(duplicates).toHaveLength(2)
      expect(new Set(duplicates.map((city) => city.id)).size).toBe(2)
      expect(new Set(duplicates.map((city) => city.countryCode)).size).toBe(2)
    }
  })
})
