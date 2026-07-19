import { GRADING_CONFIG, SCHEDULER_CONFIG } from '../config'
import type { Direction, MemoryState, ProgressData, Rating } from '../types'

const DAY_MS = 86_400_000
const MINUTE_DAYS = 1 / 1440

export function memoryKey(cityId: string, direction: Direction): string {
  return `${cityId}:${direction}`
}

export function createMemory(cityId: string, direction: Direction, now = new Date()): MemoryState {
  return {
    cityId,
    direction,
    status: 'new',
    dueAt: now.toISOString(),
    stabilityDays: MINUTE_DAYS * SCHEDULER_CONFIG.againMinutes,
    difficulty: 5,
    attempts: 0,
    correctAttempts: 0,
    consecutiveCorrect: 0,
    lapses: 0,
    recentRatings: [],
  }
}

export function retrievability(memory: MemoryState, now = new Date()): number {
  if (!memory.lastReviewedAt) return 0
  const elapsedDays = Math.max(0, (now.getTime() - new Date(memory.lastReviewedAt).getTime()) / DAY_MS)
  return Math.exp(-elapsedDays / Math.max(memory.stabilityDays, MINUTE_DAYS))
}

export function inferTypedRating(correct: boolean, responseMs: number, typo = false, hintUsed = false): Rating {
  if (!correct) return 'again'
  if (typo || hintUsed || responseMs > GRADING_CONFIG.typedHardMs) return 'hard'
  if (responseMs < GRADING_CONFIG.typedEasyMs) return 'easy'
  return 'good'
}

function nextStability(memory: MemoryState, rating: Rating): number {
  const { attempts, stabilityDays } = memory
  if (rating === 'again') return Math.max(MINUTE_DAYS * SCHEDULER_CONFIG.againMinutes, stabilityDays * SCHEDULER_CONFIG.againMultiplier)
  if (rating === 'hard') return attempts === 0
    ? SCHEDULER_CONFIG.hardInitialHours / 24
    : Math.max(SCHEDULER_CONFIG.hardInitialHours / 24, stabilityDays * SCHEDULER_CONFIG.hardMultiplier)
  if (rating === 'good') return attempts === 0
    ? SCHEDULER_CONFIG.goodInitialDays
    : Math.max(SCHEDULER_CONFIG.goodInitialDays, stabilityDays * SCHEDULER_CONFIG.goodMultiplier)
  return attempts === 0
    ? SCHEDULER_CONFIG.easyInitialDays
    : Math.max(SCHEDULER_CONFIG.easyInitialDays, stabilityDays * SCHEDULER_CONFIG.easyMultiplier)
}

export function reviewMemory(
  memory: MemoryState,
  rating: Rating,
  now = new Date(),
  metrics?: { responseMs?: number; clickErrorKm?: number; placement?: boolean },
): MemoryState {
  let stabilityDays = nextStability(memory, rating)
  if (metrics?.placement && rating === 'easy') stabilityDays = Math.max(stabilityDays, 14)
  if (metrics?.placement && rating === 'good') stabilityDays = Math.max(stabilityDays, 7)
  const correct = rating !== 'again'
  const scheduledDays = rating === 'again' ? MINUTE_DAYS * SCHEDULER_CONFIG.againMinutes : stabilityDays
  const dueAt = new Date(now.getTime() + scheduledDays * DAY_MS).toISOString()
  const attempts = memory.attempts + 1
  const blend = (previous: number | undefined, value: number | undefined) => {
    if (value == null) return previous
    if (previous == null) return value
    return (previous * (attempts - 1) + value) / attempts
  }
  return {
    ...memory,
    status: correct ? 'review' : 'learning',
    dueAt,
    stabilityDays,
    difficulty: Math.min(10, Math.max(1, memory.difficulty + (rating === 'again' ? 1 : rating === 'hard' ? 0.2 : rating === 'easy' ? -0.4 : -0.1))),
    attempts,
    correctAttempts: memory.correctAttempts + (correct ? 1 : 0),
    consecutiveCorrect: correct ? memory.consecutiveCorrect + 1 : 0,
    lapses: memory.lapses + (correct ? 0 : 1),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
    recentRatings: [...memory.recentRatings, rating].slice(-3),
    averageResponseMs: blend(memory.averageResponseMs, metrics?.responseMs),
    averageClickErrorKm: blend(memory.averageClickErrorKm, metrics?.clickErrorKm),
  }
}

export function reconcileCityMastery(progress: ProgressData, cityId: string): ProgressData {
  const keys = [memoryKey(cityId, 'location-to-name'), memoryKey(cityId, 'name-to-location')]
  const memories = keys.map((key) => progress.memories[key]).filter(Boolean)
  const mastered = memories.length === 2 && memories.every((memory) =>
    memory.stabilityDays >= SCHEDULER_CONFIG.masteryStabilityDays
    && memory.consecutiveCorrect >= SCHEDULER_CONFIG.masteryCorrectStreak
    && memory.recentRatings.length === 3
    && memory.recentRatings.every((rating) => rating !== 'again'),
  )
  const nextMemories = { ...progress.memories }
  for (const key of keys) {
    const memory = nextMemories[key]
    if (!memory) continue
    if (mastered) nextMemories[key] = { ...memory, status: 'mastered' }
    else if (memory.status === 'mastered') nextMemories[key] = { ...memory, status: 'learning' }
  }
  return { ...progress, memories: nextMemories }
}
