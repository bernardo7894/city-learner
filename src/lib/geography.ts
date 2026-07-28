import { GRADING_CONFIG } from '../config'
import type { City, Rating } from '../types'

const EARTH_RADIUS_KM = 6371.0088
const COUNTRY_SCALE_REFERENCE_KM = 900
const COUNTRY_SCALE_MIN = 0.3
const MIN_COUNTRY_THRESHOLDS_KM = {
  easy: 40,
  good: 120,
  hard: 220,
} as const

const radians = (degrees: number) => degrees * Math.PI / 180

export function haversineDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const deltaLatitude = radians(latitude2 - latitude1)
  const deltaLongitude = radians(longitude2 - longitude1)
  const lat1 = radians(latitude1)
  const lat2 = radians(latitude2)
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function placementThresholds(targetCity?: City, cities: City[] = []) {
  if (!targetCity) {
    return {
      easyKm: GRADING_CONFIG.clickEasyKm,
      goodKm: GRADING_CONFIG.clickGoodKm,
      hardKm: GRADING_CONFIG.clickHardKm,
    }
  }

  const sameCountryDistances = cities
    .filter((candidate) => candidate.id !== targetCity.id && candidate.countryCode === targetCity.countryCode)
    .map((candidate) => haversineDistanceKm(targetCity.latitude, targetCity.longitude, candidate.latitude, candidate.longitude))
  const representativeCountryRadiusKm = median(sameCountryDistances)

  if (representativeCountryRadiusKm == null) {
    return {
      easyKm: GRADING_CONFIG.clickEasyKm,
      goodKm: GRADING_CONFIG.clickGoodKm,
      hardKm: GRADING_CONFIG.clickHardKm,
    }
  }

  const scale = Math.max(COUNTRY_SCALE_MIN, Math.min(1, representativeCountryRadiusKm / COUNTRY_SCALE_REFERENCE_KM))
  return {
    easyKm: Math.max(MIN_COUNTRY_THRESHOLDS_KM.easy, GRADING_CONFIG.clickEasyKm * scale),
    goodKm: Math.max(MIN_COUNTRY_THRESHOLDS_KM.good, GRADING_CONFIG.clickGoodKm * scale),
    hardKm: Math.max(MIN_COUNTRY_THRESHOLDS_KM.hard, GRADING_CONFIG.clickHardKm * scale),
  }
}

export function gradeClick(distanceKm: number, targetCity?: City, cities: City[] = []): Rating {
  const thresholds = placementThresholds(targetCity, cities)
  if (distanceKm <= thresholds.easyKm) return 'easy'
  if (distanceKm <= thresholds.goodKm) return 'good'
  if (distanceKm <= thresholds.hardKm) return 'hard'
  return 'again'
}

export function nearestCity(latitude: number, longitude: number, cities: City[]): { city: City; distanceKm: number } | undefined {
  let nearest: { city: City; distanceKm: number } | undefined
  for (const city of cities) {
    const distanceKm = haversineDistanceKm(latitude, longitude, city.latitude, city.longitude)
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { city, distanceKm }
  }
  return nearest
}

export function nearestCities(city: City, cities: City[], count = 3): Array<{ city: City; distanceKm: number }> {
  return cities
    .filter((candidate) => candidate.id !== city.id)
    .map((candidate) => ({ city: candidate, distanceKm: haversineDistanceKm(city.latitude, city.longitude, candidate.latitude, candidate.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count)
}
