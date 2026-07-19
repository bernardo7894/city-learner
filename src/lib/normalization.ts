import type { City } from '../types'

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐‑‒–—−-]/g, ' ')
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length]
}

export function matchingCities(answer: string, cities: City[]): City[] {
  const normalized = normalizeAnswer(answer)
  if (!normalized) return []
  return cities.filter((city) => city.acceptedAnswers.some((alias) => normalizeAnswer(alias) === normalized))
}

export function isAmbiguousAnswer(answer: string, cities: City[]): boolean {
  return matchingCities(answer, cities).length > 1
}

export interface TypedMatch {
  correct: boolean
  typo: boolean
  ambiguous: boolean
  confusedWithCityId?: string
}

export function matchTypedAnswer(answer: string, target: City, cities: City[]): TypedMatch {
  const normalized = normalizeAnswer(answer)
  const aliases = target.acceptedAnswers.map(normalizeAnswer)
  if (aliases.includes(normalized)) return { correct: true, typo: false, ambiguous: false }

  const exactOther = matchingCities(answer, cities).filter((city) => city.id !== target.id)
  if (exactOther.length === 1) {
    return { correct: false, typo: false, ambiguous: false, confusedWithCityId: exactOther[0].id }
  }
  if (exactOther.length > 1) return { correct: false, typo: false, ambiguous: true }

  const shortAlias = aliases.filter((alias) => alias.length >= 5)
  const fuzzyTarget = shortAlias.some((alias) => editDistance(normalized, alias) === 1)
  if (!fuzzyTarget) return { correct: false, typo: false, ambiguous: false }

  const fuzzyOther = cities.some((city) => city.id !== target.id && city.acceptedAnswers.some((alias) => {
    const other = normalizeAnswer(alias)
    return other.length >= 5 && editDistance(normalized, other) <= 1
  }))
  return fuzzyOther
    ? { correct: false, typo: false, ambiguous: true }
    : { correct: true, typo: true, ambiguous: false }
}
