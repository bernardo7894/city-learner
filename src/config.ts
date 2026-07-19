export const SCHEDULER_CONFIG = {
  againMinutes: 10,
  hardInitialHours: 12,
  goodInitialDays: 1,
  easyInitialDays: 3,
  hardMultiplier: 1.3,
  goodMultiplier: 2.2,
  easyMultiplier: 3.5,
  againMultiplier: 0.25,
  masteryStabilityDays: 30,
  masteryCorrectStreak: 3,
} as const

export const GRADING_CONFIG = {
  typedEasyMs: 5_000,
  typedHardMs: 12_000,
  clickEasyKm: 100,
  clickGoodKm: 300,
  clickHardKm: 700,
} as const

export const QUEUE_CONFIG = {
  maxNewPerSession: 10,
  backlogBeforeNewIsReduced: 12,
  overdueWeight: 4,
  forgettingRiskWeight: 3,
  lapseWeight: 0.9,
  confusionWeight: 1.2,
  importanceWeight: 0.12,
} as const

export const STORAGE_KEY = 'atlas-recall-progress'
export const SCHEMA_VERSION = 1
