import { describe, expect, it } from 'vitest'
import type { AnswerResult, City, MemoryState, ReviewLogEntry, SessionItem } from '../types'
import { appendReviewLog, createQuestionReviewLogEntry, exportReviewLogCsv, MAX_REVIEW_LOG_ENTRIES } from './reviewLog'

function memory(overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    cityId: 'kano',
    direction: 'location-to-name',
    status: 'review',
    dueAt: '2026-07-27T12:00:00.000Z',
    stabilityDays: 11,
    difficulty: 4,
    attempts: 5,
    correctAttempts: 4,
    consecutiveCorrect: 4,
    lapses: 0,
    lastReviewedAt: '2026-07-17T12:00:00.000Z',
    lastRating: 'good',
    recentRatings: ['good', 'good', 'easy'],
    averageResponseMs: 4200,
    ...overrides,
  }
}

describe('review history', () => {
  it('captures a lapse after an 11-day remembered interval', () => {
    const item: Extract<SessionItem, { kind: 'question' }> = {
      id: 'review-location-to-name-kano',
      kind: 'question',
      cityId: 'kano',
      direction: 'location-to-name',
    }
    const result: AnswerResult = {
      rating: 'again',
      correct: false,
      responseMs: 8100,
      typedAnswer: 'Kaduna',
      confusedWithCityId: 'kaduna',
    }
    const previousMemory = memory()
    const nextMemory = memory({
      dueAt: '2026-07-28T12:10:00.000Z',
      stabilityDays: 2.75,
      attempts: 6,
      correctAttempts: 4,
      consecutiveCorrect: 0,
      lapses: 1,
      lastReviewedAt: '2026-07-28T12:00:00.000Z',
      lastRating: 'again',
    })

    const entry = createQuestionReviewLogEntry({
      answeredAt: '2026-07-28T12:00:00.000Z',
      mode: 'review',
      item,
      result,
      previousMemory,
      nextMemory,
    })

    expect(entry.daysSincePreviousReview).toBe(11)
    expect(entry.previousScheduledIntervalDays).toBe(10)
    expect(entry.daysOverdue).toBe(1)
    expect(entry.previousMemory?.stabilityDays).toBe(11)
    expect(entry.previousMemory?.consecutiveCorrect).toBe(4)
    expect(entry.nextMemory?.lapses).toBe(1)
    expect(entry.nextMemory?.consecutiveCorrect).toBe(0)
    expect(entry.confusedWithCityId).toBe('kaduna')
  })

  it('keeps the most recent entries when the log reaches its cap', () => {
    const entries = Array.from({ length: MAX_REVIEW_LOG_ENTRIES }, (_, index) => ({
      id: String(index),
      answeredAt: new Date(index).toISOString(),
      sessionMode: 'review' as const,
      itemKind: 'question' as const,
      cityId: 'kano',
      direction: 'location-to-name' as const,
      rating: 'good' as const,
      correct: true,
      responseMs: 1000,
    }))
    const latest = { ...entries[0], id: 'latest' }

    const result = appendReviewLog(entries, latest)

    expect(result).toHaveLength(MAX_REVIEW_LOG_ENTRIES)
    expect(result[0].id).toBe('1')
    expect(result.at(-1)?.id).toBe('latest')
  })

  it('exports analysis-ready CSV with city names and escaped answers', () => {
    const cities: City[] = [{
      id: 'kano',
      seedName: 'Kano',
      displayName: 'Kano',
      countryCode: 'NG',
      countryName: 'Nigeria',
      latitude: 12,
      longitude: 8.5,
      acceptedAnswers: ['Kano'],
      alternateNames: [],
      importance: 4,
      dataConfidence: 'verified',
    }]
    const entry: ReviewLogEntry = {
      id: 'entry',
      answeredAt: '2026-07-28T12:00:00.000Z',
      sessionMode: 'review',
      itemKind: 'question',
      cityId: 'kano',
      direction: 'location-to-name',
      rating: 'again',
      correct: false,
      responseMs: 8100,
      typedAnswer: 'Kaduna, Nigeria',
      daysSincePreviousReview: 11,
    }

    const csv = exportReviewLogCsv([entry], cities)

    expect(csv).toContain('daysSincePreviousReview')
    expect(csv).toContain('Kano,Nigeria')
    expect(csv).toContain('"Kaduna, Nigeria"')
    expect(csv).toContain(',11,')
  })
})
