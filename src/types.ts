export type Direction = 'location-to-name' | 'name-to-location'
export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type MemoryStatus = 'new' | 'learning' | 'review' | 'mastered'

export interface City {
  id: string
  seedName: string
  displayName: string
  countryCode: string
  countryName: string
  admin1?: string
  latitude: number
  longitude: number
  population?: number
  geonamesId?: number
  wikidataId?: string
  acceptedAnswers: string[]
  alternateNames: string[]
  importance: number
  dataConfidence: 'verified' | 'probable' | 'needs-review'
}

export interface MemoryState {
  cityId: string
  direction: Direction
  status: MemoryStatus
  dueAt: string
  stabilityDays: number
  difficulty: number
  attempts: number
  correctAttempts: number
  consecutiveCorrect: number
  lapses: number
  lastReviewedAt?: string
  lastRating?: Rating
  recentRatings: Rating[]
  averageResponseMs?: number
  averageClickErrorKm?: number
}

export interface ConfusionEdge {
  sourceCityId: string
  confusedWithCityId: string
  strength: number
  lastOccurredAt: string
  successfulDiscriminations: number
}

export interface Settings {
  sessionLength: number
  newCitiesPerSession: number
  showMasteredLabels: boolean
  showExploreCityLabels: boolean
  showCountryNames: boolean
  showCountryBoundaries: boolean
  showAnchors: boolean
  showWeakHeat: boolean
}

export interface ProgressData {
  schemaVersion: number
  createdAt: string
  updatedAt: string
  memories: Record<string, MemoryState>
  confusions: ConfusionEdge[]
  anchors: string[]
  suspendedCityIds: string[]
  settings: Settings
}

export type SessionMode = 'learn' | 'review' | 'weak' | 'confusion' | 'placement'

export type SessionItem =
  | { id: string; kind: 'teach'; cityId: string }
  | { id: string; kind: 'question'; cityId: string; direction: Direction; placement?: boolean }
  | { id: string; kind: 'contrast'; cityId: string; otherCityId: string }

export interface AnswerResult {
  rating: Rating
  correct: boolean
  responseMs: number
  distanceKm?: number
  typedAnswer?: string
  typo?: boolean
  confusedWithCityId?: string
  hintUsed?: boolean
  nextDueAt?: string
}

export interface SessionStats {
  answers: AnswerResult[]
  introducedCityIds: string[]
  initialMasteredIds: string[]
  confusionCreated: number
  confusionWeakened: number
}
