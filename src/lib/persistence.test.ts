import { describe, expect, it } from 'vitest'
import type { ProgressData } from '../types'
import { createEmptyProgress, importProgress, migrateProgress } from './persistence'

type LegacyProgress = Omit<ProgressData, 'reviewLog'> & { reviewLog?: ProgressData['reviewLog'] }

describe('review history migration', () => {
  it('adds an empty history to existing progress without resetting memories', () => {
    const oldProgress = createEmptyProgress([], new Date('2026-07-01T00:00:00Z')) as LegacyProgress
    delete oldProgress.reviewLog
    oldProgress.memories['kano:location-to-name'] = {
      cityId: 'kano',
      direction: 'location-to-name',
      status: 'review',
      dueAt: '2026-07-28T00:00:00.000Z',
      stabilityDays: 11,
      difficulty: 4,
      attempts: 5,
      correctAttempts: 4,
      consecutiveCorrect: 4,
      lapses: 0,
      recentRatings: ['good'],
    }

    const migrated = migrateProgress(oldProgress, [])

    expect(migrated.reviewLog).toEqual([])
    expect(migrated.memories['kano:location-to-name'].stabilityDays).toBe(11)
  })

  it('accepts old exported files that do not yet contain review history', () => {
    const oldProgress = createEmptyProgress([], new Date('2026-07-01T00:00:00Z')) as LegacyProgress
    delete oldProgress.reviewLog

    expect(importProgress(JSON.stringify(oldProgress), []).reviewLog).toEqual([])
  })
})
