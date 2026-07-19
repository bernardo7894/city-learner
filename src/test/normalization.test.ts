import { describe, expect, it } from 'vitest'
import type { City } from '../types'
import { isAmbiguousAnswer, matchTypedAnswer, matchingCities, normalizeAnswer } from '../lib/normalization'

const city = (id: string, displayName: string, acceptedAnswers: string[]): City => ({
  id,
  seedName: acceptedAnswers[0],
  displayName,
  countryCode: 'XX',
  countryName: 'Testland',
  latitude: 0,
  longitude: 0,
  acceptedAnswers,
  alternateNames: acceptedAnswers,
  importance: 1,
  dataConfidence: 'verified',
})

describe('answer normalization', () => {
  it('is insensitive to diacritics and case', () => {
    expect(normalizeAnswer('  SÃO LUÍS ')).toBe('sao luis')
    expect(matchTypedAnswer('bogota', city('bogota', 'Bogotá', ['Bogotá']), [])).toMatchObject({ correct: true })
  })

  it('normalizes apostrophes, hyphens, and repeated whitespace', () => {
    expect(normalizeAnswer('Xi’an')).toBe(normalizeAnswer("xi'an"))
    expect(normalizeAnswer('Kalyan---Dombivli')).toBe(normalizeAnswer('kalyan dombivli'))
    expect(normalizeAnswer('  huai   an ')).toBe(normalizeAnswer("Huai’an"))
  })

  it('matches curated aliases', () => {
    const bengaluru = city('bengaluru', 'Bengaluru', ['Bengaluru', 'Bangalore'])
    expect(matchTypedAnswer('Bangalore', bengaluru, [bengaluru])).toMatchObject({ correct: true, typo: false })
  })

  it('accepts an unambiguous one-character typo as hard-grade eligible', () => {
    const chengdu = city('chengdu', 'Chengdu', ['Chengdu'])
    const chennai = city('chennai', 'Chennai', ['Chennai'])
    expect(matchTypedAnswer('chengdo', chengdu, [chengdu, chennai])).toMatchObject({ correct: true, typo: true })
  })

  it('does not resolve a shared name without context', () => {
    const california = city('san-jose-us', 'San Jose, California', ['San Jose', 'San Jose, California'])
    const costaRica = city('san-jose-cr', 'San José, Costa Rica', ['San José', 'San José, Costa Rica'])
    expect(isAmbiguousAnswer('san jose', [california, costaRica])).toBe(true)
    expect(matchingCities('san jose california', [california, costaRica])).toEqual([california])
  })
})
