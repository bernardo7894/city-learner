import { describe, expect, it } from 'vitest'
import type { City } from '../types'
import { createEmptyProgress } from './persistence'
import { selectSessionQueue } from './queue'
import { createMemory, memoryKey } from './scheduler'

function city(index: number): City {
  return {
    id: `city-${index}`,
    seedName: `City ${index}`,
    displayName: `City ${index}`,
    countryCode: `C${index}`,
    countryName: `Country ${index}`,
    latitude: index,
    longitude: index,
    acceptedAnswers: [`City ${index}`],
    alternateNames: [],
    importance: 3,
    dataConfidence: 'verified',
  }
}

describe('review queue length', () => {
  it('includes every due review regardless of the configured session length', () => {
    const now = new Date('2026-07-28T12:00:00Z')
    const cities = Array.from({ length: 25 }, (_, index) => city(index))
    const progress = createEmptyProgress(cities, now)
    progress.settings.sessionLength = 5

    for (const currentCity of cities) {
      const memory = createMemory(currentCity.id, 'location-to-name', now)
      progress.memories[memoryKey(currentCity.id, memory.direction)] = {
        ...memory,
        status: 'review',
        dueAt: new Date(now.getTime() - 86_400_000).toISOString(),
      }
    }

    const queue = selectSessionQueue('review', cities, progress, now, () => 0.5)

    expect(queue).toHaveLength(25)
    expect(new Set(queue.map((item) => item.cityId)).size).toBe(25)
  })

  it('still applies the configured limit to weak-city sessions', () => {
    const now = new Date('2026-07-28T12:00:00Z')
    const cities = Array.from({ length: 12 }, (_, index) => city(index))
    const progress = createEmptyProgress(cities, now)
    progress.settings.sessionLength = 5

    for (const currentCity of cities) {
      const memory = createMemory(currentCity.id, 'location-to-name', now)
      progress.memories[memoryKey(currentCity.id, memory.direction)] = {
        ...memory,
        status: 'learning',
      }
    }

    expect(selectSessionQueue('weak', cities, progress, now, () => 0.5)).toHaveLength(5)
  })
})
