import { describe, expect, it } from 'vitest'
import type { City, ProgressData } from '../types'
import { createEmptyProgress } from '../lib/persistence'
import { gradeClick, haversineDistanceKm } from '../lib/geography'
import { createMemory, memoryKey, reconcileCityMastery, retrievability, reviewMemory } from '../lib/scheduler'
import { priorityScore, selectSessionQueue } from '../lib/queue'
import { recordConfusion, recordDiscrimination } from '../lib/confusions'

const now = new Date('2026-01-15T12:00:00.000Z')
const makeCity = (id: string, importance = 2): City => ({
  id,
  seedName: id,
  displayName: id,
  countryCode: id.slice(0, 2).toUpperCase(),
  countryName: `${id} country`,
  latitude: 0,
  longitude: 0,
  acceptedAnswers: [id],
  alternateNames: [],
  importance,
  dataConfidence: 'verified',
})

describe('geographic grading', () => {
  it('uses great-circle distance', () => {
    const londonToParis = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522)
    expect(londonToParis).toBeGreaterThan(340)
    expect(londonToParis).toBeLessThan(350)
  })

  it('applies click thresholds at their boundaries', () => {
    expect(gradeClick(100)).toBe('easy')
    expect(gradeClick(100.1)).toBe('good')
    expect(gradeClick(300)).toBe('good')
    expect(gradeClick(700)).toBe('hard')
    expect(gradeClick(700.1)).toBe('again')
  })
})

describe('scheduler', () => {
  it('decays retrievability as time passes', () => {
    const memory = { ...createMemory('x', 'location-to-name', now), stabilityDays: 10, lastReviewedAt: now.toISOString() }
    expect(retrievability(memory, new Date('2026-01-16T12:00:00Z'))).toBeGreaterThan(retrievability(memory, new Date('2026-01-25T12:00:00Z')))
  })

  it('orders easy farther than good and good farther than hard', () => {
    const memory = createMemory('x', 'location-to-name', now)
    const hard = reviewMemory(memory, 'hard', now)
    const good = reviewMemory(memory, 'good', now)
    const easy = reviewMemory(memory, 'easy', now)
    expect(easy.stabilityDays).toBeGreaterThan(good.stabilityDays)
    expect(good.stabilityDays).toBeGreaterThan(hard.stabilityDays)
  })

  it('grows stability after success', () => {
    const first = reviewMemory(createMemory('x', 'location-to-name', now), 'good', now)
    const second = reviewMemory(first, 'good', new Date('2026-01-16T12:00:00Z'))
    expect(second.stabilityDays).toBeGreaterThan(first.stabilityDays)
  })

  it('turns a failure into a ten-minute relearning step', () => {
    const mature = { ...createMemory('x', 'location-to-name', now), status: 'mastered' as const, attempts: 5, stabilityDays: 40, consecutiveCorrect: 5 }
    const failed = reviewMemory(mature, 'again', now)
    expect(failed.status).toBe('learning')
    expect(failed.lapses).toBe(1)
    expect(new Date(failed.dueAt).getTime() - now.getTime()).toBe(10 * 60_000)
    expect(failed.stabilityDays).toBeLessThan(mature.stabilityDays)
  })

  it('requires secure recent performance in both directions for mastery', () => {
    const city = makeCity('x')
    let progress = createEmptyProgress([city], now)
    const secure = (direction: 'location-to-name' | 'name-to-location') => ({
      ...createMemory(city.id, direction, now),
      status: 'review' as const,
      stabilityDays: 35,
      attempts: 3,
      correctAttempts: 3,
      consecutiveCorrect: 3,
      recentRatings: ['good', 'good', 'easy'] as Array<'good' | 'easy'>,
    })
    progress = { ...progress, memories: { [memoryKey(city.id, 'location-to-name')]: secure('location-to-name') } }
    expect(reconcileCityMastery(progress, city.id).memories[memoryKey(city.id, 'location-to-name')].status).not.toBe('mastered')
    progress.memories[memoryKey(city.id, 'name-to-location')] = secure('name-to-location')
    const mastered = reconcileCityMastery(progress, city.id)
    expect(mastered.memories[memoryKey(city.id, 'location-to-name')].status).toBe('mastered')
    expect(mastered.memories[memoryKey(city.id, 'name-to-location')].status).toBe('mastered')
  })
})

describe('adaptive queue and confusions', () => {
  it('prioritizes overdue weak memories over secure memories', () => {
    const weakCity = makeCity('weak')
    const secureCity = makeCity('secure', 4)
    const progress = createEmptyProgress([weakCity, secureCity], now)
    const weak = { ...createMemory('weak', 'location-to-name', now), status: 'learning' as const, dueAt: '2026-01-05T12:00:00Z', stabilityDays: 1, lapses: 3, lastReviewedAt: '2026-01-04T12:00:00Z' }
    const secure = { ...createMemory('secure', 'location-to-name', now), status: 'review' as const, dueAt: '2026-01-14T12:00:00Z', stabilityDays: 100, lastReviewedAt: '2026-01-14T12:00:00Z' }
    expect(priorityScore(weak, weakCity, progress, now)).toBeGreaterThan(priorityScore(secure, secureCity, progress, now))
    const queued = { ...progress, memories: { [memoryKey('weak', 'location-to-name')]: weak, [memoryKey('secure', 'location-to-name')]: secure } }
    expect(selectSessionQueue('review', [weakCity, secureCity], queued, now)[0].cityId).toBe('weak')
  })

  it('uses the configured new-city count and keeps each complete learning cycle', () => {
    const cities = Array.from({ length: 12 }, (_, index) => makeCity(`city-${index}`, 4 - index % 4))
    const progress = createEmptyProgress(cities, now)
    progress.settings.newCitiesPerSession = 7
    const queue = selectSessionQueue('learn', cities, progress, now)
    expect(new Set(queue.filter((item) => item.kind === 'teach').map((item) => item.cityId)).size).toBe(7)
    expect(queue).toHaveLength(21)
    for (const cityId of new Set(queue.map((item) => item.cityId))) {
      expect(queue.filter((item) => item.cityId === cityId)).toHaveLength(3)
    }
  })

  it('falls back safely when an already-open save lacks the new-city setting', () => {
    const cities = Array.from({ length: 8 }, (_, index) => makeCity(`legacy-${index}`, 3))
    const progress = createEmptyProgress(cities, now)
    delete (progress.settings as Partial<typeof progress.settings>).newCitiesPerSession

    expect(selectSessionQueue('learn', cities, progress, now).filter((item) => item.kind === 'teach')).toHaveLength(5)
  })

  it('resumes cities that only have one learning direction initialized', () => {
    const city = makeCity('partial', 3)
    const progress = createEmptyProgress([city], now)
    progress.memories[memoryKey(city.id, 'location-to-name')] = createMemory(city.id, 'location-to-name', now)

    expect(selectSessionQueue('learn', [city], progress, now).some((item) => item.cityId === city.id)).toBe(true)
  })

  it('randomizes equal-priority cities and avoids repeated name prefixes when alternatives exist', () => {
    const cities = ['chongqing', 'chattogram', 'chennai', 'delhi', 'tokyo'].map((id) => makeCity(id, 3))
    const progress = createEmptyProgress(cities, now)
    progress.settings.newCitiesPerSession = 3
    const firstQueue = selectSessionQueue('learn', cities, progress, now, () => 0.999)
    const secondQueue = selectSessionQueue('learn', cities, progress, now, () => 0)
    const introduced = firstQueue.filter((item) => item.kind === 'teach').map((item) => item.cityId)
    const secondIntroduced = secondQueue.filter((item) => item.kind === 'teach').map((item) => item.cityId)

    expect(introduced).toHaveLength(3)
    expect(new Set(introduced.map((id) => id.slice(0, 2))).size).toBe(3)
    expect(secondIntroduced).not.toEqual(introduced)
  })

  it('creates and gradually decays confusion edges', () => {
    const once = recordConfusion([], 'chengdu', 'chongqing', now)
    const twice = recordConfusion(once, 'chongqing', 'chengdu', now)
    expect(twice).toHaveLength(1)
    expect(twice[0].strength).toBe(2)
    const discriminated = recordDiscrimination(twice, 'chengdu', 'chongqing')
    expect(discriminated[0].strength).toBeGreaterThan(0)
    expect(discriminated[0].strength).toBeLessThan(2)
    expect(discriminated[0].successfulDiscriminations).toBe(1)
  })
})
