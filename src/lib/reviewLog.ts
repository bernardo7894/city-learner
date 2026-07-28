import type {
  AnswerResult,
  MemoryState,
  ReviewLogEntry,
  ReviewMemorySnapshot,
  SessionItem,
  SessionMode,
} from '../types'

const DAY_MS = 86_400_000
export const MAX_REVIEW_LOG_ENTRIES = 5_000

function daysBetween(later: string, earlier: string): number {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / DAY_MS
}

function snapshotMemory(memory?: MemoryState): ReviewMemorySnapshot | undefined {
  if (!memory) return undefined
  return {
    status: memory.status,
    dueAt: memory.dueAt,
    stabilityDays: memory.stabilityDays,
    difficulty: memory.difficulty,
    attempts: memory.attempts,
    correctAttempts: memory.correctAttempts,
    consecutiveCorrect: memory.consecutiveCorrect,
    lapses: memory.lapses,
    lastReviewedAt: memory.lastReviewedAt,
    lastRating: memory.lastRating,
    averageResponseMs: memory.averageResponseMs,
    averageClickErrorKm: memory.averageClickErrorKm,
  }
}

export function createQuestionReviewLogEntry({
  answeredAt,
  mode,
  item,
  result,
  previousMemory,
  nextMemory,
}: {
  answeredAt: string
  mode: SessionMode
  item: Extract<SessionItem, { kind: 'question' }>
  result: AnswerResult
  previousMemory?: MemoryState
  nextMemory: MemoryState
}): ReviewLogEntry {
  const daysSincePreviousReview = previousMemory?.lastReviewedAt
    ? daysBetween(answeredAt, previousMemory.lastReviewedAt)
    : undefined
  const previousScheduledIntervalDays = previousMemory?.lastReviewedAt
    ? daysBetween(previousMemory.dueAt, previousMemory.lastReviewedAt)
    : undefined
  const daysOverdue = previousMemory
    ? Math.max(0, daysBetween(answeredAt, previousMemory.dueAt))
    : undefined

  return {
    id: `${answeredAt}:${item.id}`,
    answeredAt,
    sessionMode: mode,
    itemKind: 'question',
    cityId: item.cityId,
    direction: item.direction,
    placement: item.placement,
    rating: result.rating,
    correct: result.correct,
    responseMs: result.responseMs,
    distanceKm: result.distanceKm,
    typedAnswer: result.typedAnswer,
    typo: result.typo,
    hintUsed: result.hintUsed,
    confusedWithCityId: result.confusedWithCityId,
    daysSincePreviousReview,
    previousScheduledIntervalDays,
    daysOverdue,
    previousMemory: snapshotMemory(previousMemory),
    nextMemory: snapshotMemory(nextMemory),
  }
}

export function createContrastReviewLogEntry({
  answeredAt,
  mode,
  item,
  result,
}: {
  answeredAt: string
  mode: SessionMode
  item: Extract<SessionItem, { kind: 'contrast' }>
  result: AnswerResult
}): ReviewLogEntry {
  return {
    id: `${answeredAt}:${item.id}`,
    answeredAt,
    sessionMode: mode,
    itemKind: 'contrast',
    cityId: item.cityId,
    otherCityId: item.otherCityId,
    rating: result.rating,
    correct: result.correct,
    responseMs: result.responseMs,
    distanceKm: result.distanceKm,
  }
}

export function appendReviewLog(log: ReviewLogEntry[], entry: ReviewLogEntry): ReviewLogEntry[] {
  const next = [...log, entry]
  return next.length > MAX_REVIEW_LOG_ENTRIES ? next.slice(-MAX_REVIEW_LOG_ENTRIES) : next
}
