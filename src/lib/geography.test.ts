import { describe, expect, it } from 'vitest'
import type { City } from '../types'
import { gradeClick, placementThresholds } from './geography'

function city(id: string, countryCode: string, latitude: number, longitude: number): City {
  return {
    id,
    seedName: id,
    displayName: id,
    countryCode,
    countryName: countryCode,
    latitude,
    longitude,
    acceptedAnswers: [id],
    alternateNames: [],
    importance: 3,
    dataConfidence: 'verified',
  }
}

describe('country-relative placement grading', () => {
  it('requires more precision in a geographically compact country', () => {
    const seoul = city('Seoul', 'KR', 37.5665, 126.978)
    const koreanCities = [
      seoul,
      city('Busan', 'KR', 35.1796, 129.0756),
      city('Daegu', 'KR', 35.8714, 128.6014),
      city('Daejeon', 'KR', 36.3504, 127.3845),
      city('Gwangju', 'KR', 35.1595, 126.8526),
    ]

    expect(placementThresholds(seoul, koreanCities).hardKm).toBe(220)
    expect(gradeClick(500, seoul, koreanCities)).toBe('again')
  })

  it('keeps a 500 km miss within the right region for a very large country', () => {
    const beijing = city('Beijing', 'CN', 39.9042, 116.4074)
    const chineseCities = [
      beijing,
      city('Shanghai', 'CN', 31.2304, 121.4737),
      city('Guangzhou', 'CN', 23.1291, 113.2644),
      city('Chengdu', 'CN', 30.5728, 104.0668),
      city('Wuhan', 'CN', 30.5928, 114.3055),
    ]

    expect(placementThresholds(beijing, chineseCities).hardKm).toBe(700)
    expect(gradeClick(500, beijing, chineseCities)).toBe('hard')
  })

  it('uses the existing global thresholds when country context is unavailable', () => {
    expect(gradeClick(500)).toBe('hard')
    expect(gradeClick(701)).toBe('again')
  })
})
